# @kortyx/google

Google Gemini provider implementation for Kortyx.

## Install

```bash
npm install @kortyx/google
```

## Basic usage

```ts
import { google } from "@kortyx/google";

const model = google("gemini-2.5-flash");
```

The default `google` export reads one of these environment variables on first use:

- `GOOGLE_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `KORTYX_GOOGLE_API_KEY`
- `KORTYX_GEMINI_API_KEY`

If you want an app-local barrel, re-export it from a shared file:

```ts
// src/lib/providers.ts
export { google } from "@kortyx/google";
```

Then import from that file where you use it.

> Re-exporting `google` does not create a local binding in the same file. If you want to call `google("...")` in that file, use `import { google } from "@kortyx/google"`.

## Advanced usage

Use `createGoogleGenerativeAI(...)` when you want explicit app-owned setup or custom settings:

```ts
import { createGoogleGenerativeAI } from "@kortyx/google";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```

## License

Apache-2.0
