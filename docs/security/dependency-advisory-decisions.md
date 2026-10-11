# Dependency advisory decisions

This register documents open advisories that cannot currently be removed by a
stable parent-package upgrade. It is not a blanket exception: each decision is
limited to the dependency path and usage described below. Reassess a decision
when its parent dependency changes, a patched stable release becomes available,
or the stated usage constraints stop being true.

Production dependencies remain a hard gate:

```sh
pnpm audit --prod --audit-level low
```

The repository-wide `pnpm audit:deps` gate ignores only the advisory IDs listed
as active decisions here. Any new advisory still fails the security job.

## Active decisions

### esbuild development server request exposure

- Advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- Dependency path: `drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild@0.18.20`
- Scope: development-only database tooling in `@kortyx/telemetry-db`
- Decision: vulnerable code is not used
- Reviewed: 2026-10-04

Kortyx invokes Drizzle Kit for schema generation, checks, and Studio. It does
not invoke `esbuild.serve()` or expose an esbuild development server. The latest
stable Drizzle Kit (`0.31.11`) still reaches the latest
`@esbuild-kit/core-utils` (`3.3.2`), which pins `esbuild ~0.18.20`; there is no
stable parent upgrade that removes this path.

Reopen this decision if Kortyx starts an esbuild development server, if the
tooling becomes part of a production image, or when Drizzle Kit removes the
deprecated `@esbuild-kit` chain.

### esbuild Windows development server file read

- Advisory: [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)
- Dependency path: `tsup@8.5.1 > esbuild@0.27.7`
- Scope: development-only package builds
- Decision: vulnerable code is not used
- Reviewed: 2026-10-04

Kortyx uses tsup's build command and does not invoke `esbuild.serve()`. The
advisory affects the esbuild development server on Windows. `tsup@8.5.1` is the
latest stable release and constrains esbuild to `^0.27.0`, which excludes the
patched `0.28.1` release.

Reopen this decision if an esbuild development server is introduced, if tsup
ships support for esbuild `0.28.1` or later, or if this tooling enters a
production runtime.
