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
  schemaId: "wolly.job-picker",
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

## Process for adding entries

Every future entry must name the public surface, replacement, first deprecated
version/release, runtime warning code when applicable, compatibility code to
delete, and tests/docs that must change. The next-major release owner must
search for every warning code and every `@deprecated` annotation before cutting
the release.
