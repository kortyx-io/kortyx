export type DrainableServer = {
  close: (callback: (error?: Error) => void) => unknown;
  closeAllConnections?: () => void;
};

export type Closeable = {
  close: () => Promise<void>;
};

export const drainServer = async (
  server: DrainableServer,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      reject(new Error(`HTTP drain exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
    timeout.unref();

    server.close((error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    });
  });

export const shutdownApiRuntime = async (options: {
  markNotReady: () => void;
  server: DrainableServer;
  studioChangeBus: Closeable;
  database: Closeable;
  timeoutMs?: number;
}): Promise<void> => {
  options.markNotReady();
  let failure: unknown;

  try {
    await drainServer(options.server, options.timeoutMs ?? 25_000);
  } catch (error) {
    failure = error;
  }

  for (const closeable of [options.studioChangeBus, options.database]) {
    try {
      await closeable.close();
    } catch (error) {
      failure ??= error;
    }
  }

  if (failure) throw failure;
};
