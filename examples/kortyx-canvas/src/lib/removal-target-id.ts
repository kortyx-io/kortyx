const ITEM_SEP = "__";

/** Stable interrupt option id for a canvas item removal target. */
export function toRemoveItemTargetId(
  sectionKey: string,
  itemKey: string,
): string {
  return `${sectionKey}${ITEM_SEP}${itemKey}`;
}

export function parseRemoveItemTargetId(
  id: string,
): { sectionKey: string; itemKey: string } | null {
  const idx = id.indexOf(ITEM_SEP);
  if (idx <= 0 || idx >= id.length - ITEM_SEP.length) return null;
  return {
    sectionKey: id.slice(0, idx),
    itemKey: id.slice(idx + ITEM_SEP.length),
  };
}

/** Stable interrupt option id for a section removal target. */
export function toRemoveSectionTargetId(sectionKey: string): string {
  return sectionKey;
}
