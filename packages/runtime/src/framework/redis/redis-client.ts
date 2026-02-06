import { connect as netConnect, type Socket } from "node:net";
import { type TLSSocket, connect as tlsConnect } from "node:tls";

export type RedisReply =
  | string
  | number
  | null
  | RedisReply[]
  | { type: "error"; message: string };

export type RedisClientOptions = {
  url: string;
  connectTimeoutMs?: number;
};

const encodeBulk = (s: string) => {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([
    Buffer.from(`$${b.length}\r\n`),
    b,
    Buffer.from("\r\n"),
  ]);
};

const encodeCommand = (cmd: string, args: string[]) => {
  const parts = [cmd, ...args];
  const bufs: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
  for (const p of parts) bufs.push(encodeBulk(p));
  return Buffer.concat(bufs);
};

function readLine(buf: Buffer, start: number) {
  const idx = buf.indexOf("\r\n", start);
  if (idx === -1) return null;
  return { line: buf.slice(start, idx).toString("utf8"), next: idx + 2 };
}

function parseReply(
  buf: Buffer,
  start: number,
): { value: RedisReply; next: number } | null {
  if (start >= buf.length) return null;
  const byte = buf[start];
  if (byte === undefined) return null;
  const prefix = String.fromCharCode(byte);
  if (prefix === "+" || prefix === "-" || prefix === ":") {
    const line = readLine(buf, start + 1);
    if (!line) return null;
    if (prefix === "+") return { value: line.line, next: line.next };
    if (prefix === ":")
      return { value: Number.parseInt(line.line, 10), next: line.next };
    return { value: { type: "error", message: line.line }, next: line.next };
  }

  if (prefix === "$") {
    const line = readLine(buf, start + 1);
    if (!line) return null;
    const len = Number.parseInt(line.line, 10);
    if (len === -1) return { value: null, next: line.next };
    const end = line.next + len;
    if (end + 2 > buf.length) return null;
    const data = buf.slice(line.next, end).toString("utf8");
    return { value: data, next: end + 2 };
  }

  if (prefix === "*") {
    const line = readLine(buf, start + 1);
    if (!line) return null;
    const count = Number.parseInt(line.line, 10);
    if (count === -1) return { value: null, next: line.next };
    const items: RedisReply[] = [];
    let cursor = line.next;
    for (let i = 0; i < count; i++) {
      const parsed = parseReply(buf, cursor);
      if (!parsed) return null;
      items.push(parsed.value);
      cursor = parsed.next;
    }
    return { value: items, next: cursor };
  }

  return {
    value: { type: "error", message: `Unknown RESP prefix: ${prefix}` },
    next: buf.length,
  };
}

export type RedisClient = {
  command: (cmd: string, args?: string[]) => Promise<RedisReply>;
};

export function createRedisClient(options: RedisClientOptions): RedisClient {
  const resolvedOptions: Required<
    Pick<RedisClientOptions, "connectTimeoutMs">
  > &
    Omit<RedisClientOptions, "connectTimeoutMs"> = {
    connectTimeoutMs: options.connectTimeoutMs ?? 5_000,
    url: options.url,
  };

  let socket: Socket | TLSSocket | null = null;
  let buffer = Buffer.alloc(0);
  const inflight: Array<{
    resolve: (v: RedisReply) => void;
    reject: (e: unknown) => void;
  }> = [];

  let connecting: Promise<void> | null = null;
  let ready = false;

  const drainReplies = () => {
    while (inflight.length) {
      const parsed = parseReply(buffer, 0);
      if (!parsed) return;
      const waiter = inflight.shift()!;
      buffer = buffer.slice(parsed.next);
      waiter.resolve(parsed.value);
    }
  };

  const send = (cmd: string, args: string[] = []): Promise<RedisReply> => {
    if (!socket) return Promise.reject(new Error("Redis socket not available"));
    const payload = encodeCommand(cmd, args);
    return new Promise<RedisReply>((resolve, reject) => {
      inflight.push({ resolve, reject });
      socket!.write(payload);
    });
  };

  const ensureConnected = async () => {
    if (ready) return;
    if (connecting) return connecting;

    connecting = (async () => {
      const u = new URL(resolvedOptions.url);
      const isTls = u.protocol === "rediss:";
      const host = u.hostname || "127.0.0.1";
      const port = u.port ? Number(u.port) : isTls ? 6380 : 6379;
      const password = u.password ? decodeURIComponent(u.password) : "";
      const db =
        u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0;

      const s = isTls
        ? tlsConnect({ host, port, servername: host })
        : netConnect({ host, port });
      socket = s;

      s.setNoDelay(true);
      s.setKeepAlive(true);

      s.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        drainReplies();
      });

      s.on("error", (err) => {
        ready = false;
        while (inflight.length) inflight.shift()!.reject(err);
      });

      s.on("close", () => {
        ready = false;
        while (inflight.length)
          inflight.shift()!.reject(new Error("Redis socket closed"));
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Redis connect timeout")),
          resolvedOptions.connectTimeoutMs,
        );

        const onConnect = () => {
          clearTimeout(timer);
          resolve();
        };

        // net: "connect", tls: "secureConnect" (TLSSocket can also emit "connect")
        s.once("connect", onConnect);
        (s as any).once?.("secureConnect", onConnect);
        s.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });

      if (password) {
        const r = await send("AUTH", [password]);
        if (typeof r === "object" && r && (r as any).type === "error") {
          throw new Error(`Redis AUTH failed: ${(r as any).message}`);
        }
      }

      if (db && Number.isFinite(db) && db > 0) {
        const r = await send("SELECT", [String(db)]);
        if (typeof r === "object" && r && (r as any).type === "error") {
          throw new Error(`Redis SELECT failed: ${(r as any).message}`);
        }
      }

      ready = true;
    })();

    try {
      await connecting;
    } finally {
      connecting = null;
    }
  };

  return {
    async command(cmd: string, args: string[] = []) {
      await ensureConnected();
      return send(cmd, args);
    },
  };
}
