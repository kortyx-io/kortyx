# Studio prompts

Read this for prompt contracts, serving, candidate evals, and migration. Verify
installed exports and `kortyx studio prompts --help` before using this release.

Use `definePrompt({ id, format, variables: z.object(...), config: z.object(...) })`
to declare the application's contract. Register references in
`createPrompts({ definitions, source: studioPromptSource({ apiUrl, apiKey,
environment, projectId? }) })`, then pass `prompts` to `createAgent`.
Inside nodes, call `usePrompt(ref, { variables, version? })` and
`useReason({ prompt, model, ...reasonOptions })`. A system-user prompt brings both
roles; chat prompts preserve all ordered messages. Do not also supply
input/system/messages. Keep model selection explicit through an app-owned
registry mapping saved config aliases to provider model references.

Template variables fill `{{message}}`; configuration is returned separately.
Do not confuse saved modelName or temperature with runtime template inputs.
Use strict application schemas and preserve credentials on the server. Compiled
prompts are frozen provenance-bearing objects, not caller-supplied JSON.

One execution resolves an atomic baseline; checkpoint/resume/fork and parallel
children retain that snapshot. An explicit version pin cannot override a
conflicting Studio eval snapshot. Last-known-good fallback is opt-in and bounded;
never bypass authorization or hash/contract errors with fallback.

Categories organize the library. Test groups select exact versions for a suite
launch; they do not contain a suite, route production traffic, or require SDK
group definitions. Use the existing eval drawer for all or selected cases.
Actual `useReason({ prompt })` calls provide version/hash receipts. Check saved
verified evidence, destination environment and companion assignments before
promotion. A queued run or a requested candidate alone is insufficient.

For CLI authoring: get the executable JSON with `prompts get KEY --file FILE`,
modify it, validate, review the candidate hash, then use `prompts update KEY
--file FILE --base-version N --expected-hash HASH --note NOTE
--idempotency-key UUID`. Read `diff`, `versions`, and saved eval results.
`action FILE` applies the validated category/group/review/policy contract.

For separate deployments or cloud projects, use independent named connections
with key environment variables and optional project IDs. `prompts copy KEY
--from SOURCE --to DESTINATION --plan-file FILE` plans without assigning live
versions. Review mappings and explicit append/rename conflicts, then
`prompts apply FILE --connection DESTINATION`. Retain the plan for retries.
Verify `verification: "destination-read-back"`, run destination evals, and
explicitly promote with the reviewed assignment revision. Transfers preserve
origin hashes, remap exact dependencies, and never transfer credentials, source
approvals/evals, or live assignments.

For reproducible integration verification, use `examples/kortyx-prompts`' actual
SDK workflow and authenticated consumer endpoint. Its fixture provider verifies
transport and version selection. Use configured real providers for semantic
quality evaluation; do not claim a deterministic fixture proves model quality.

Inline inclusions persist as `[[prompt:stable/key]]`, with the referenced key,
exact version and hash in `content.dependencies`. They include matching-role
message text and inherit input contracts; retain the parent configuration. The
Studio `#` picker resolves Latest to an exact pin before save. Declare inherited
inputs in the parent application interface and pass their values to `usePrompt`.
Do not flatten messages, remove the manifest or insert display names into stable
references when editing through the CLI. Export/copy preserves the closure and
rewrites reference tokens for renamed destination keys. Actual-use receipts also
identify included versions during evaluations.
