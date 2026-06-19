---
title: A Feature Must Be Deletable in One Folder
impact: HIGH
impactDescription: the single test that proves a boundary is real
tags: boundaries, cohesion, refactoring
---

## A Feature Must Be Deletable in One Folder

The cleanest test of a feature boundary: if the feature becomes obsolete, you
should be able to delete `features/<x>/` and have nothing related to `<x>` left
anywhere else — no orphaned hook in a global `hooks/`, no stray type in
`types/`, no dead fetcher in `lib/`. If deleting the folder leaves debris, the
feature was never truly cohesive.

**Incorrect (debris survives deletion):**

```
# rm -rf src/features/reports leaves behind:
src/hooks/use-report-filters.ts        # only reports used it
src/lib/report-export.ts               # only reports used it
src/types/report.ts                    # only reports used it
# ...now dead code nobody dares remove
```

**Correct (one folder holds the whole domain):**

```
# rm -rf src/features/reports removes everything:
src/features/reports/
├── components/
├── hooks/use-report-filters.ts
├── api/export-report.ts
└── types/index.ts
```

Apply this as a design check while building, not just when deleting: when you
reach for a global folder to hold something only one feature uses, put it in the
feature instead.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
