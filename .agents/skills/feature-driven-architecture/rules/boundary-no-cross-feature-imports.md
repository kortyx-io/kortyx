---
title: Don't Import Across Features — Compose at the App Level
impact: HIGH
impactDescription: keeps features independent and prevents a tangled dependency web
tags: boundaries, imports, composition, decoupling
---

## Don't Import Across Features — Compose at the App Level

A feature importing another feature couples them: the two now ship, break, and
get refactored together, and a web of feature-to-feature edges quietly forms.
The widely-adopted rule (bulletproof-react, Feature-Sliced Design) is stronger
than "import the public API" — it's **don't import sibling features at all**.
When two features need to work together, compose them where they meet: the
**route / page** in `app/`, or a dedicated higher-level module.

bulletproof-react: *"It might not be a good idea to import across the features.
Instead, compose different features at the application level."*
Feature-Sliced Design: *"slices cannot use other slices on the same layer."*

**Incorrect (one feature reaches into a sibling):**

```tsx
// features/billing/components/billing-panel.tsx
import { useAuth } from "@/features/auth";        // sibling-feature dependency
import { InvoiceList } from "@/features/invoices"; // another sibling dependency

export function BillingPanel() {
  const { user } = useAuth();
  return <InvoiceList userId={user.id} />;
}
```

**Correct (compose the features in the route):**

```tsx
// app/billing/page.tsx — the composition point
import { useAuth } from "@/features/auth";
import { BillingPanel } from "@/features/billing";
import { InvoiceList } from "@/features/invoices";

export default function BillingPage() {
  return (
    <BillingLayout>
      <BillingPanel />
      <InvoiceList />
    </BillingLayout>
  );
}
```

If two features keep needing each other's code, that shared piece probably
belongs one level down — in `components/`, `lib/`, or a shared module (see
`abstraction-rule-of-two` and `boundary-unidirectional-deps`) — not in either
feature.

Reference: [bulletproof-react project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) · [Feature-Sliced Design](https://feature-sliced.design/)
