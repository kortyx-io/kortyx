# @kortyx/prompts

Portable typed prompt contracts and Studio serving for Kortyx. The `kortyx` entry
package re-exports `definePrompt`, `createPrompts`, `studioPromptSource`, and
`localPromptSource`. Workflow nodes use `usePrompt` from `kortyx` or `@kortyx/hooks`.

See [SDK integration](https://kortyx.io/docs/sdk/guides/studio-prompts),
[Studio management](https://kortyx.io/docs/studio/prompts), and the runnable
[`examples/kortyx-prompts`](../../examples/kortyx-prompts) application.

Prompt variables fill templates; saved configuration is returned separately.
Immutable versions carry canonical executable SHA-256 hashes. Each execution
freezes one assignment snapshot and checkpoints retain it for resume/fork.
Serving requires `prompt:serve`. Optional last-known-good fallback defaults to a
five-minute maximum age and refuses authorization/contract failures.

Inline `[[prompt:key]]` references expand matching-role messages from the exact
dependency manifest and the same immutable snapshot. Included inputs must be
declared by the parent interface; parent configuration remains authoritative.
Nested references are bounded and record exact dependency provenance. Studio's
TipTap picker displays `#Name@vN`; selecting Latest creates an exact pin.
