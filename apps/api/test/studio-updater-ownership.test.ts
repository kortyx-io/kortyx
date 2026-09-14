import { spawnSync } from "node:child_process";
import {
  chown,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { applyUpdate } from "../src/updater/engine";
import { initializeStorage, operation, saveJson } from "../src/updater/storage";

// Run this file as root in the API image: the ordinary CI user cannot reproduce
// a Docker root process writing into a different user's private directory.
const rootLinux = process.platform === "linux" && process.getuid?.() === 0;

it.skipIf(!rootLinux)(
  "keeps a host user's state and backups accessible after a root worker updates",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "kortyx-owner-test-"));
    const owner = { uid: 1001, gid: 1001 };
    try {
      await chown(home, owner.uid, owner.gid);
      for (const [name, contents] of Object.entries({
        ".env":
          "KORTYX_COMPOSE_PROJECT_NAME=ownership-test\nKORTYX_STUDIO_IMAGE_TAG=v0.3.0\n",
        "config.json": JSON.stringify({ imageTag: "v0.3.0" }),
        "compose.yml": "services: {}\n",
      })) {
        await writeFile(join(home, name), contents, { mode: 0o600 });
        await chown(join(home, name), owner.uid, owner.gid);
      }
      const id = "11111111-1111-4111-8111-111111111111";
      await saveJson(home, "operation.json", {
        id,
        from: "0.3.0",
        release: {
          format: 1,
          installer: 1,
          version: "0.3.2",
          api: `ghcr.io/kortyx-io/kortyx-api@sha256:${"a".repeat(64)}`,
          studio: `ghcr.io/kortyx-io/kortyx-studio@sha256:${"b".repeat(64)}`,
        },
        phase: "starting",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        backup: null,
        messages: [],
      });
      let installed = false;
      await applyUpdate(home, id, async (args, output) => {
        if (output) await writeFile(output, "verified test archive");
        if (args.includes("up") && args.includes("--wait-timeout"))
          installed = true;
        if (args.includes("-p")) return installed ? "0.3.2" : "0.3.0";
        return "";
      });
      expect((await operation(home))?.phase).toBe("succeeded");
      const directories = [
        ".updates",
        ".updates/backups",
        `.updates/backups/${id}`,
      ];
      const files = [
        ".env",
        "config.json",
        ".updates/operation.json",
        ...[".env", "config.json", "compose.yml", "database.dump"].map(
          (name) => `.updates/backups/${id}/${name}`,
        ),
      ];
      for (const path of [...directories, ...files]) {
        const info = await stat(join(home, path));
        expect({ uid: info.uid, gid: info.gid }, path).toEqual(owner);
        expect(info.mode & 0o777, path).toBe(
          directories.includes(path) ? 0o700 : 0o600,
        );
      }
      const child = spawnSync(
        process.execPath,
        [
          "-e",
          `
      const fs = require('node:fs');
      const path = require('node:path');
      const home = process.argv[1];
      for (const file of JSON.parse(process.argv[2])) fs.readFileSync(path.join(home, file));
      try { fs.accessSync(path.join(home, '.updates/lock')); process.exit(2); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    `,
          home,
          JSON.stringify(files),
        ],
        { ...owner, encoding: "utf8" },
      );
      expect(child.stderr).toBe("");
      expect(child.status).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);

it.skipIf(!rootLinux)(
  "repairs known root-owned state on controller startup without exposing secrets",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "kortyx-owner-repair-"));
    try {
      await chown(home, 1001, 1001);
      await mkdir(join(home, ".updates"), { mode: 0o700 });
      for (const name of [".env", "config.json", ".updates/settings.json"]) {
        await writeFile(join(home, name), "private", { mode: 0o600 });
      }
      await initializeStorage(home);
      for (const name of [".env", "config.json", ".updates/settings.json"]) {
        expect((await stat(join(home, name))).uid).toBe(1001);
        expect((await stat(join(home, name))).mode & 0o777).toBe(0o600);
        expect(await readFile(join(home, name), "utf8")).toBe("private");
      }
      expect((await stat(join(home, ".updates"))).uid).toBe(1001);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);
