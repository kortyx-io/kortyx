# @kortyx/stream

[![npm version](https://img.shields.io/npm/v/@kortyx/stream.svg)](https://www.npmjs.com/package/@kortyx/stream)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/stream.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Streaming primitives, SSE helpers, readers, collectors, and structured-data reducers for Kortyx.

Most application code should import server/runtime stream helpers from `kortyx` and browser-safe stream helpers from `kortyx/browser`. Use `@kortyx/stream` directly when you need the lower-level protocol package.

## Install

```bash
pnpm add @kortyx/stream
```

```bash
npm install @kortyx/stream
```

## Key APIs

- `StreamChunk`
- `createStreamResponse(...)`
- `toSSE(...)`
- `readStream(...)`
- `consumeStream(...)`
- `collectStream(...)`
- `collectBufferedStream(...)`
- `createStructuredStreamAccumulator(...)`
- `applyStructuredChunk(...)`

## Example

```ts
import { collectBufferedStream } from "@kortyx/stream";

const result = await collectBufferedStream(agent.streamChat(messages));

console.log(result.text);
console.log(result.structured);
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Stream protocol](https://kortyx.io/docs/reference/stream-protocol)
- [SSE guide](https://kortyx.io/docs/guides/sse)
- [React client](https://kortyx.io/docs/reference/react-client)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
