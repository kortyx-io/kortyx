---
title: Drive Filter Refetches Through a Transition (No Skeleton Flash)
impact: MEDIUM
impactDescription: keeps current data visible while refetching
tags: url, nuqs, usetransition, ux
---

## Drive Filter Refetches Through a Transition (No Skeleton Flash)

A `shallow:false` nuqs change is a navigation, so without care it triggers
`loading.tsx` and the content blanks to a skeleton on every filter tweak. Pass a
`startTransition` to nuqs: React keeps the **current** UI mounted while the new
data streams; show `isPending` as a subtle dim instead.

**Incorrect (skeleton flashes on each filter change):**

```tsx
const [, setRange] = useQueryStates(parsers, { shallow: false })
```

**Correct (old data stays, dims while pending):**

```tsx
const [isPending, startTransition] = useTransition()
const [, setRange] = useQueryStates(parsers, { shallow: false, startTransition })

return (
  <div className={isPending ? 'opacity-60 transition-opacity' : undefined} aria-busy={isPending}>
    <Table rows={rows} />
  </div>
)
```

Reference: [React — useTransition](https://react.dev/reference/react/useTransition)
