# Zod compatibility

Published Kortyx packages that depend on Zod declare `zod: "^4.5.0"` as a
required peer dependency. The `kortyx` facade declares the same peer so the
application selects one compatible Zod version for its workflow schemas and
the SDK. Development dependencies continue to use the workspace catalog and
lockfile; widening the consumer range does not downgrade Studio or the API.

## Supported boundary

Manual verification on 2026-10-27 sampled the first and latest stable patch of
each Zod 4 minor, plus the then-current declared minimum:

| Versions | SDK result |
| --- | --- |
| 4.0.0, 4.0.17, 4.1.0, 4.1.13 | Object-intersection JSON Schema inference differs from the supported behavior. |
| 4.2.0, 4.2.1, 4.3.0, 4.3.6 | Intersection inference and portable eval judge-prompt tests fail. |
| 4.4.0, 4.4.3 | Object-intersection JSON Schema inference still differs. |
| 4.5.0, 4.5.4, 4.6.0, 4.6.6, 4.6.7 | All 1,523 tests in the nine directly affected SDK/provider packages pass; 12 live-provider/PostgreSQL cases are skipped without credentials/services. |

All sampled versions passed source/test type checks when the application and
SDK shared a Zod version. Separate app/SDK copies caused workflow schema type
errors, including app 4.6.6 against SDK 4.6.7. A wider direct dependency alone
does not guarantee compatible schema types.

The matrix is evidence for the minimum version, not a claim that every patch
or future Zod 4 release was tested. Zod 3, Zod 4.0–4.4, Zod Mini, live model
calls, and private runtime adapters are outside this verification.

## Packed consumer regression

Run from the repository root:

```sh
pnpm test:compat:zod
```

The command builds the `kortyx` and OpenRouter dependency graph, packs its
workspace packages with pnpm, and creates independent npm consumer projects
for Zod 4.5.0 and the currently locked development version. Only local Kortyx
tarballs are substituted for registry packages; Zod has no override. Strict
peer resolution must succeed, and each Zod-dependent package must resolve the
same Zod entry as the application.

The consumer compiles with strict TypeScript checks and verifies inferred
workflow input/output types, a model-selected structured output with a local
provider fixture, invalid execution input rejection, output/interrupt contract
validation, and OpenRouter's Jev output validator. It makes no live model calls.
Temporary installations are removed after success or failure.

CI runs this regression in the existing build/typecheck suite. Existing
coverage, database integration, Studio/API checks, and release gates remain in
place. Public installation guidance lives in the SDK installation page and
package READMEs; the distributed Kortyx skill records the shared peer setup.

## Release assessment

This changes package installation metadata and broadens the supported Zod 4
range. It changes no runtime API, validation schema, persisted data, telemetry
payload, Studio route, control, page help, or guided tour. After rebasing onto
main, assess the final diff for any additional surfaces before requesting
review. Package exports and publish registration are unchanged; normal package
release automation publishes the updated peer declarations. Studio rolling
upgrade strategy remains unchanged because its locked Zod version and wire
contracts are unchanged.
