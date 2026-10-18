import {
  readStudioTableFilters,
  type StudioTableResource,
} from "@kortyx/telemetry-contracts";
import {
  type SavedTableView,
  validView,
} from "@/components/data-table/saved-table-views";

/** One-time compatibility adapter; shared table code has no feature/cookie names. */
function readLegacyViews(resource: StudioTableResource): SavedTableView[] {
  try {
    const raw = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`kortyx_${resource}_table_prefs=`))
      ?.split("=")
      .slice(1)
      .join("=");
    if (!raw) return [];
    const old = JSON.parse(decodeURIComponent(raw)).views;
    if (!Array.isArray(old)) return [];
    return old.flatMap((view) => {
      try {
        const query = view.query.filters ?? view.query;
        const pairs = Object.fromEntries(
          Object.entries(query)
            .filter(([, value]) => value != null)
            .map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(",") : String(value),
            ]),
        );
        const migrated = {
          name: view.name,
          filters: readStudioTableFilters(pairs, resource),
          layout: view.layout,
          sort: view.query.sort,
          direction: view.query.dir,
          scope: Object.fromEntries(
            Object.entries(pairs).filter(([key]) =>
              [
                "q",
                "env",
                "range",
                "startedAfter",
                "startedBefore",
                "includeChildren",
              ].includes(key),
            ),
          ),
        };
        return validView(migrated) ? [migrated] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
export const readLegacyRunsViews = () => readLegacyViews("runs");
export const readLegacySessionsViews = () => readLegacyViews("sessions");
export const readLegacyInterruptsViews = () => readLegacyViews("interrupts");
