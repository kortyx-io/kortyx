# Studio prompt example

This server uses the actual Kortyx workflow, prompt hook, model adapter, telemetry,
and eval endpoint. Start a local Studio/API with prompt and eval execution enabled.
Create `canvas/classify-intent` in Prompts with system instructions for support vs
sales, user `{{message}}`, the default message input schema, and configuration:

```json
{ "modelName": "fast", "temperature": 0 }
```

Set `KORTYX_API_URL`, `KORTYX_PROMPTS_API_KEY` (prompt serving plus telemetry),
`KORTYX_ENVIRONMENT=production`, and an `EVAL_SERVICE_KEY` of at least 32 characters.
Run `pnpm --filter @kortyx/example-prompts start`. Register the server's
`http://localhost:6500/api/evals` with the Studio backend's target configuration,
binding the same project and environment. Use explicit local HTTP opt-in.

The example exposes `intent-regression`, with support and sales cases and an app
judge. Test the candidate from Studio before making it live. Once promoted,
`POST /api/chat` with `{ "message": "Help me reset my password" }` resolves the
live prompt and sends generation identity to Studio. The example chat route is
local demonstration code; production applications retain their own authentication.

By default the fixture provider returns deterministic labels to test the complete
integration without paid credentials. To evaluate real model behavior, set
`OPENROUTER_API_KEY`, `WORKFLOW_MODEL`, optional `ACCURATE_MODEL`, and
`APP_JUDGE_MODEL`. Configuration aliases map to that registry in application code.

The promoted `live` version is the default. Set `KORTYX_PROMPT_TAG=staging` to
resolve a manually assigned staging tag instead. Tags are independent of the
`KORTYX_ENVIRONMENT` used by telemetry and serving-key authorization. Saving a
candidate or editing an optional tag never moves live.
