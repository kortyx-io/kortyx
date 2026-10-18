/** Route + visible, settled target are one checkpoint. Background drawers do not count. */
export function lessonTargetReady(target: string, destination: URL): boolean {
  const current = new URL(window.location.href);
  const params = (url: URL) =>
    [...url.searchParams].sort(([a], [b]) => a.localeCompare(b));
  if (
    current.pathname !== destination.pathname ||
    JSON.stringify(params(current)) !== JSON.stringify(params(destination))
  )
    return false;
  return findLessonTarget(target) !== null;
}

/** Intercepted routes can retain another copy underneath the active drawer. */
export function findLessonTarget(target: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(target)].find(isReady) ?? null
  );
}

function isReady(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (
    !element ||
    !rect ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.left < 0 ||
    rect.right > window.innerWidth + 1 ||
    element.closest('[inert], [aria-hidden="true"]')
  )
    return false;
  const drawer = element.closest("[data-detail-drawer]");
  if (
    drawer?.getAttribute("data-state") === "closed" ||
    drawer
      ?.getAnimations()
      .some((animation) => animation.playState === "running")
  )
    return false;
  const openDrawers = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-detail-drawer][data-state="open"]',
    ),
  ].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
  const top = openDrawers.at(-1);
  const dialog = element.closest<HTMLElement>('[data-slot="dialog-content"]');
  return (
    !top ||
    top.contains(element) ||
    Boolean(dialog && Number(dialog.style.zIndex) > Number(top.style.zIndex))
  );
}
