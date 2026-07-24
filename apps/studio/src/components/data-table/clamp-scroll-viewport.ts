export function syncHorizontalScroll(
  body: HTMLDivElement | null,
  header: HTMLDivElement | null,
) {
  if (!body || !header || header.scrollLeft === body.scrollLeft) return;
  header.scrollLeft = body.scrollLeft;
}

/** Clamp scroll after content width changes and keep header/body aligned. */
export function clampScrollViewport(
  body: HTMLDivElement | null,
  header?: HTMLDivElement | null,
) {
  if (!body) return;

  const maxScrollLeft = Math.max(0, body.scrollWidth - body.clientWidth);
  const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);

  if (body.scrollLeft > maxScrollLeft) {
    body.scrollLeft = maxScrollLeft;
  }
  if (body.scrollTop > maxScrollTop) {
    body.scrollTop = maxScrollTop;
  }

  syncHorizontalScroll(body, header ?? null);
}
