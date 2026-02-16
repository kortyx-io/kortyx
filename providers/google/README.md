# @kortyx/google

Google Gemini provider implementation for Kortyx.

## Install

```bash
npm install @kortyx/google
```

## Usage

```ts
import { createGoogleGenerativeAI } from "@kortyx/google";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```

## License

Apache-2.0
