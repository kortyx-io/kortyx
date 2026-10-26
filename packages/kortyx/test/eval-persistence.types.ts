import {
  type CreatePostgresEvalExecutionStoreOptions,
  type CreatePostgresFrameworkAdapterOptions,
  createCachingFrameworkAdapter,
  createEvalRouteHandler,
  createPostgresEvalExecutionStore,
  createPostgresFrameworkAdapter,
  createRedisFrameworkAdapter,
  type EvalExecutionStore,
  type FrameworkAdapter,
  type PostgresEvalExecutionStoreOptions,
} from "../src";

export function configureEvalPersistence(
  evals: Parameters<typeof createEvalRouteHandler>[0]["evals"],
  connectionString: string,
  redisUrl: string,
) {
  const evalOptions: PostgresEvalExecutionStoreOptions = { leaseMs: 30_000 };
  const options: CreatePostgresFrameworkAdapterOptions = {
    connectionString,
    namespace: "app/production",
    evalExecutions: evalOptions,
  };
  const storage = createPostgresFrameworkAdapter(options);
  const cached = createCachingFrameworkAdapter({
    storage,
    cache: createRedisFrameworkAdapter({ url: redisUrl }),
  });
  const shared: EvalExecutionStore = cached.evalExecutions;
  const generic: FrameworkAdapter = cached;
  const optional: EvalExecutionStore | undefined = generic.evalExecutions;
  void optional;
  const handler = createEvalRouteHandler({
    evals,
    serviceKey: "application-owned-service-key-at-least-32-characters",
    executionStore: shared,
  });
  const standaloneOptions: CreatePostgresEvalExecutionStoreOptions = {
    ...evalOptions,
    connectionString,
    namespace: "separate-eval-host/production",
  };
  const standalone = createPostgresEvalExecutionStore(standaloneOptions);
  return { storage: cached, handler, standalone };
}
