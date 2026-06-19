---
title: components/ Is a Design System, Not a Junk Drawer
impact: HIGH
impactDescription: prevents domain logic leaking into shared UI
tags: organization, design-system, shared
---

## components/ Is a Design System, Not a Junk Drawer

The top-level `components/` folder is reserved for **shared UI with zero domain
knowledge** — buttons, inputs, modals, layout primitives, typography. A shared
component should care about generic concerns (`variant`, `size`, `disabled`),
never about business terms like "invoice" or "risk". The moment domain logic
leaks into shared UI, every feature becomes coupled to it and the component grows
afraid-to-touch conditionals.

**Incorrect (domain logic baked into a shared component):**

```tsx
// components/button/button.tsx
export function Button({ action, invoiceId }: { action: "approve" | "reject"; invoiceId: string }) {
  const label = action === "approve" ? "Approve invoice" : "Reject invoice";
  const onClick = () => updateInvoice(invoiceId, action); // business logic in the design system
  return <button onClick={onClick}>{label}</button>;
}
```

**Correct (generic primitive; domain lives in the feature):**

```tsx
// components/button/button.tsx — knows only about presentation
export function Button({ variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }))} {...props} />;
}

// features/invoices/components/invoice-actions.tsx — domain behavior
import { Button } from "@/components/button/button";

export function InvoiceActions({ invoiceId }: { invoiceId: string }) {
  return (
    <>
      <Button variant="primary" onClick={() => approveInvoice(invoiceId)}>Approve</Button>
      <Button variant="ghost" onClick={() => rejectInvoice(invoiceId)}>Reject</Button>
    </>
  );
}
```

This keeps the design system small and consistent while features stay free to
move fast without breaking each other.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
