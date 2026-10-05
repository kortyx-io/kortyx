# Catalog workflow eval endpoint

A runnable, read-only example: a real Kortyx workflow calls `list_products` and
answers a price question. Studio or an optional code judge grades the captured
tool evidence. The catalog is a public fixture; this verifies the integration,
not your application's permissions. For private tools reuse your application's
normal authentication and request context in `setup`/`execute`.

From a Kortyx source checkout:

```sh
pnpm install
pnpm exec turbo run build --filter=kortyx --filter=@kortyx/openrouter
cd examples/kortyx-eval-endpoint
cp .env.example .env
```

Privately set `OPENROUTER_API_KEY` and `EVAL_SERVICE_KEY` (at least 32 characters)
in `.env`. Generate a service key with:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

```sh
pnpm start
```

The consumer endpoint is `http://localhost:3210/api/evals`. For a Docker Desktop
Studio API target, use `http://host.docker.internal:3210/api/evals` and
`allowInsecureHttp: true`. Copy the same service key into the private Studio
target, with its existing organization/project and allowed environment IDs.
Configure a Studio judge on the API backend and grant `eval:run` to the Studio
project key. Follow the complete [first eval guide](https://kortyx.io/docs/studio/first-eval)
for mounts, bootstrap, diagnosis and verification.

```sh
# Use your configured Studio connection, not the application's service/provider key.
pnpm exec kortyx studio evals doctor --connection local --target catalog --suite catalog-smoke
```

Start `catalog-smoke` from Studio's Suites list. This incurs workflow/judge model
usage. The sample does not configure telemetry, so workflow costs/inspection
links require adding normal agent telemetry; judge usage is recorded by Studio.

To run without Studio, set `APP_JUDGE_MODEL=openai/gpt-4o` in `.env`, then:

```sh
pnpm eval --suite catalog-smoke
```

The CLI reads `.env` and `.env.local`. Local results appear in the terminal;
they do not create a Studio eval record. `EVAL_SERVICE_KEY` is required only for
the HTTP server, not direct local execution. For another application copy the
small agent/evals/app/server files, installing `kortyx`, `@kortyx/openrouter`,
`hono`, `@hono/node-server`, and `tsx` at compatible published versions.
