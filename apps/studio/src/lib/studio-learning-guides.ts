/** Optional, authorized edition help links. These never join the sample tour queue. */
export interface StudioLearningGuide {
  id: string;
  title: string;
  description: string;
  href: `/${string}`;
}
export function safeLearningGuides(
  guides: readonly StudioLearningGuide[] = [],
) {
  if (!Array.isArray(guides)) return [];
  const seen = new Set<string>();
  return guides
    .filter((guide) => {
      if (
        !guide ||
        typeof guide.id !== "string" ||
        typeof guide.href !== "string" ||
        typeof guide.title !== "string" ||
        typeof guide.description !== "string" ||
        !/^[a-z0-9-]{1,64}$/.test(guide.id) ||
        seen.has(guide.id) ||
        !/^\/(?!\/)[^\\\s?#]*$/.test(guide.href) ||
        guide.title.trim().length === 0 ||
        guide.title.length > 100 ||
        guide.description.length > 400
      )
        return false;
      seen.add(guide.id);
      return true;
    })
    .slice(0, 8);
}
