# Next.js Feature-Driven Architecture (skill)

A Claude Code skill capturing feature-driven (feature-based) architecture for
Next.js App Router projects. Organize code by business domain, keep routes thin,
draw clear feature boundaries, lean on server state, and abstract late.

- **`SKILL.md`** — entry point: when to apply, prioritized category table, quick reference.
- **`rules/`** — one file per rule, each with an explanation plus incorrect/correct examples.
- **`AGENTS.md`** — all rules compiled into a single document.

## Categories

| Prefix | Category | Impact |
|--------|----------|--------|
| `org-` | Folder Organization | HIGH |
| `boundary-` | Feature Boundaries | HIGH |
| `state-` | State Management | MEDIUM |
| `abstraction-` | Abstraction Timing | MEDIUM |

## Sources & further reading

**Primary sources** — the two articles this skill distills:

- Gerardo Perrucci — [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
  — group by feature, thin routes, mini-app feature internals, server-first
  state, and the rule-of-two for abstraction.
- Rufat Aliyev — [Feature-Driven Architecture with Next.js: A Better Way to Structure Your Application](https://dev.to/rufatalv/feature-driven-architecture-with-nextjs-a-better-way-to-structure-your-application-1lph)
  — explicit feature public APIs and clear cross-feature boundaries
  ([starter repo](https://github.com/rufatalv/next-feature-based)).

**Broader methodologies** — cross-checked against, and where the extra boundary rules come from:

- [Feature-Sliced Design](https://feature-sliced.design/) — a formal methodology:
  layers (`app → pages → widgets → features → entities → shared`), slices, and
  segments (`ui/api/model/lib/config`), with strict layers-import-only-downward
  and no-sibling-slice rules.
- [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  — the most popular practical reference architecture; source of the
  no-cross-feature-import and unidirectional-dependency rules, and the argument
  *against* barrel files (prefer direct imports — see `rules/boundary-public-api.md`).
- [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
  (Robert C. Martin) — the folder layout should "scream" the business domain, not
  the framework.

These broadly agree on the essentials; they differ mainly on barrel files /
public-API style and on how many layers to formalize.

## Note for this repo

Studio uses feature folders. Treat the listed folders as optional conventions,
not a mandatory DDD-style layer stack: use `schema.ts`/`schema/` for Zod as the
single source of truth for validation and inferred types,
`api/` only for external I/O, and `lib/` for pure feature-local helpers.
