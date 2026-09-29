# Next major removals

This is the repository checklist for intentionally deprecated public APIs. A
deprecation is not complete until it is listed here with its replacement,
runtime warning, migration documentation, and removal tests.

## `useReason` singular interrupt API

Introduced as deprecated in the release that added model interrupt contracts.

- [ ] Remove `UseReasonArgs.interrupt` and `UseReasonInterruptConfig`.
- [ ] Remove `UseReasonResult.interruptResponse`; use `interruptHistory`.
- [ ] Remove the legacy JSON first-pass/continuation implementation and its
      `awaiting_interrupt` checkpoint reader. It remains temporarily so runs
      paused on the previous version can resume during the deprecation window.
- [ ] Remove `KORTYX_USE_REASON_INTERRUPT_DEPRECATED` and its compatibility
      normalizer.
- [ ] Remove legacy-only parsing and prompt helpers after checking they have no
      other callers.
- [ ] Delete legacy examples and tests; retain a compile-time test proving the
      removed fields fail.
- [ ] Call out the removal in the major migration guide and release notes.

Replacement:

```ts
const picker = defineInterruptContract({
  description: "Ask the user to choose a job.",
  schemaId: "example.job-picker",
  schemaVersion: "1",
  requestSchema: JobPickerRequest,
  responseSchema: JobPickerResponse,
});

await useReason({
  model,
  input,
  tools,
  interrupts: {
    mode: "optional",
    maxRequests: 3,
    contracts: { picker },
  },
});
```

## `useReason` single JSON output API

Deprecated when model-selected output contracts were introduced. Remove this legacy API in the next major version, after its published callers and provider-native exceptions have a supported migration path.

- [ ] Remove `UseReasonArgs.outputSchema`, `UseReasonArgs.structured`, and `UseReasonResult.output` in the next major version.
- [ ] Replace TypeSafe Jev's native `jevOutputSchema(...)` use of `outputSchema` before removal. Jev cannot call tools, so it cannot use model-selected `outputs` directly; preserve its typed decision result through a non-tool public API and test it.
- [ ] Migrate published examples, docs, and `skills/kortyx` references that still demonstrate the legacy fields; retain a compile-time test proving the removed fields fail.
- [ ] Remove `KORTYX_USE_REASON_OUTPUT_DEPRECATED` and the legacy JSON prompt, parser, and structured streaming compatibility path once no callers remain.
- [ ] Keep the `structured-data` wire protocol and `useStructuredData`; output contracts use both.
- [ ] Update the Hooks and Stream Protocol guides and retain compile-time tests for the replacement.

Replacement: `defineOutputContract(...)` with `useReason({ outputs: { emit, return } })`. For realtime partial fields, define `stream.fields` on the contract. The model first selects that contract through a control tool, then Kortyx performs a separate streamed JSON pass and emits partial chunks before `final`. For deterministic output, call `useStructuredData({ contract, data })`.

Runtime warning: `KORTYX_USE_REASON_OUTPUT_DEPRECATED`.

## Process for adding entries

Every future entry must name the public surface, replacement, first deprecated
version/release, runtime warning code when applicable, compatibility code to
delete, and tests/docs that must change. The next-major release owner must
search for every warning code and every `@deprecated` annotation before cutting
the release.
