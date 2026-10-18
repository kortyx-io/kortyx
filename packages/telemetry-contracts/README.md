# @kortyx/telemetry-contracts

Shared Zod wire contracts and fixtures for Kortyx telemetry producers and consumers.

Studio tables share `TableFiltersSchema`, `TableFilterRuleSchema`, the field
registries and validation/matching helpers. Groups select `match: "all" | "any"`;
values within a rule are alternatives. Text comparison is case-insensitive and
literal (wildcards are not query syntax). Negative comparisons require a value;
`missing` explicitly selects absent data. Pass field definitions to the matcher
so date equality compares instants, while text equality compares literal text.

Limits: 32 rules, 30 values per rule, 512 characters per string, 32 KiB serialized
filters. Dates require ISO timestamps with an offset. Unknown fields, unsupported
operators, malformed values and reversed ranges fail validation. Legacy Studio
query aliases remain readable through `readStudioTableFilters`.

Column registries include execution identity, environment, completion timestamps,
prompt assignments and evaluation judge metadata. `tablePassRate` returns a
percentage of recorded passed/failed/error cases (unrun cases are excluded), or
no value when none finished. `tableQueueMs` returns elapsed queue milliseconds
only when a valid start timestamp is recorded.

### Studio sample identities

`SAMPLE_PROJECT` exports the versioned sample project's stable record IDs,
recording/reference timestamps, and future guided-tour anchors. Sample records
are fictional and read-only; these identifiers are not authentication scopes.
Dataset content is maintained by Studio and the internal telemetry DB package.

The sample manifest also includes stable IDs for the two-turn session and the
saved evaluation baseline. Dataset version changes preserve existing identities;
Studio chapters resolve supported views from those IDs rather than persisting
arbitrary resource paths.
