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
  const element = [...document.querySelectorAll<HTMLElement>(target)].find(
    isLessonTargetAvailable,
  );
  return Boolean(element && prepareLessonTarget(element));
}

/** Intercepted routes can retain another copy underneath the active drawer. */
export function findLessonTarget(target: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(target)].find(
      isLessonTargetReady,
    ) ?? null
  );
}

export function isLessonTargetReady(element: HTMLElement): boolean {
  if (!isLessonTargetAvailable(element)) return false;
  const rect = element.getBoundingClientRect();
  const bounds = visibleBounds(element);
  const drawer = element.closest("[data-detail-drawer]");
  return (
    rect.left >= bounds.left - 1 &&
    rect.right <= bounds.right + 1 &&
    rect.top >= bounds.top - 1 &&
    Math.min(rect.bottom, bounds.bottom) - rect.top >=
      Math.min(rect.height, 160) - 1 &&
    !drawer
      ?.getAnimations?.()
      .some((animation) => animation.playState === "running")
  );
}

/** Include clipping ancestors: a cell behind a table header is not on screen. */
function visibleBounds(element: HTMLElement) {
  const bounds = {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
  for (
    let parent = element.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const style = window.getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow)) {
      bounds.top = Math.max(bounds.top, rect.top);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow)) {
      bounds.left = Math.max(bounds.left, rect.left);
      bounds.right = Math.min(bounds.right, rect.right);
    }
  }
  return bounds;
}

/** Own nested scrolling, then measure again. Joyride must not scroll it a second time. */
export function prepareLessonTarget(element: HTMLElement): boolean {
  if (!isLessonTargetAvailable(element)) return false;
  for (
    let parent = element.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowX || style.overflow)) {
      const rect = element.getBoundingClientRect();
      const box = parent.getBoundingClientRect();
      const left = Math.max(0, box.left);
      const right = Math.min(window.innerWidth, box.right);
      if (rect.left < left || rect.right > right)
        parent.scrollLeft += rect.left - left;
    }
    if (!/(auto|scroll)/.test(style.overflowY || style.overflow)) continue;
    const rect = element.getBoundingClientRect();
    const box = parent.getBoundingClientRect();
    const top = Math.max(8, box.top + 12);
    const bottom = Math.min(window.innerHeight - 8, box.bottom - 12);
    if (rect.top < top || rect.bottom > bottom) {
      // Keep the evidence near the top, leaving room below for the explanation.
      parent.scrollTop += rect.top - top;
    }
  }
  return isLessonTargetReady(element);
}

/** A visible foreground target can be planned before its entry animation settles. */
export function isLessonTargetAvailable(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (
    !element ||
    !rect ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.width > window.innerWidth + 1 ||
    element.closest('[inert], [aria-hidden="true"], .sr-only') ||
    window.getComputedStyle(element).visibility === "hidden"
  )
    return false;
  const drawer = element.closest("[data-detail-drawer]");
  if (drawer?.getAttribute("data-state") === "closed") return false;
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
