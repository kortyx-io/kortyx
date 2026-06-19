---
title: Pure UI State Stays Local
impact: MEDIUM
impactDescription: keeps global state small and components self-contained
tags: state, local, useState
---

## Pure UI State Stays Local

Ephemeral UI concerns — is a dialog open, which tab is selected, is a tooltip
visible, the current value of an uncontrolled input — should live in `useState`
in the closest component that needs them. Hoisting this into context or a global
store adds re-render scope and indirection for state that nothing else cares
about.

**Incorrect (transient UI state in a global store):**

```tsx
const useUiStore = create((set) => ({
  isInviteModalOpen: false,
  openInviteModal: () => set({ isInviteModalOpen: true }),
  closeInviteModal: () => set({ isInviteModalOpen: false }),
}));
```

**Correct (local to the component that owns it):**

```tsx
function InviteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite</Button>
      <InviteModal open={open} onOpenChange={setOpen} />
    </>
  );
}
```

Lift state up (or into a feature provider) only when a sibling genuinely needs to
read it — not preemptively.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
