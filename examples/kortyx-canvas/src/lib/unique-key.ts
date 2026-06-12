/**
 * Returns `candidate` if it doesn't collide with any string in `existing`,
 * otherwise suffixes `_2`, `_3`, … until a free name is found.
 *
 * Used by add-section / add-item nodes to guarantee their LLM-picked
 * snake_case keys are unique within the parent object before mutating the
 * canvas.
 */
export function ensureUniqueKey(candidate: string, existing: string[]): string {
  if (!existing.includes(candidate)) return candidate;
  let n = 2;
  while (existing.includes(`${candidate}_${n}`)) n += 1;
  return `${candidate}_${n}`;
}
