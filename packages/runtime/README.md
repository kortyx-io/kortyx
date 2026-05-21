# @kortyx/runtime

[![npm version](https://img.shields.io/npm/v/@kortyx/runtime.svg)](https://www.npmjs.com/package/@kortyx/runtime)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/runtime.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Graph execution, node registries, workflow registries, framework adapters, and runtime persistence for Kortyx.

Most application code should import these APIs from `kortyx`. Use `@kortyx/runtime` directly when you are wiring custom infrastructure or framework adapters.

## Install

```bash
pnpm add @kortyx/runtime
```

```bash
npm install @kortyx/runtime
```

## Key APIs

- `createInMemoryWorkflowRegistry(...)`
- `createFileWorkflowRegistry(...)`
- `registerNode(...)`
- `getRegisteredNode(...)`
- `createInMemoryFrameworkAdapter(...)`
- `createRedisFrameworkAdapter(...)`
- `createFrameworkAdapterFromEnv(...)`

## Persistence

Runtime persistence stores framework execution state such as pending interrupts and resume tokens. Business data should remain owned by your application.

```ts
import { createRedisFrameworkAdapter } from "@kortyx/runtime";

export const framework = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL,
});
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Runtime persistence](https://kortyx.io/docs/production/persistence)
- [Framework adapters](https://kortyx.io/docs/production/framework-adapters)
- [Node resolution](https://kortyx.io/docs/reference/node-resolution)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
