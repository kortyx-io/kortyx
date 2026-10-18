export type DrainableServer = {
  close: (callback: (error?: Error) => void) => unknown;
  closeAllConnections?: () => void;
};

export type Closeable = {
  close: () => Promise<void>;
};

export const closeApiResources = async (
  resources: readonly Closeable[],
): Promise<void> => {
  let failure: { error: unknown } | undefined;
  for (const resource of resources) {
    try {
      await resource.close();
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
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
  let failure: { error: unknown } | undefined;

  try {
    await drainServer(options.server, options.timeoutMs ?? 25_000);
  } catch (error) {
    failure = { error };
  }

  try {
    await closeApiResources([options.studioChangeBus, options.database]);
  } catch (error) {
    failure ??= { error };
  }

  if (failure) throw failure.error;
};
