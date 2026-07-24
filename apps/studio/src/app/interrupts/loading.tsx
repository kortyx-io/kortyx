import { cookies } from "next/headers";
import {
  DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
  INTERRUPTS_TABLE_PREFERENCES_COOKIE,
  parseInterruptsTablePreferences,
} from "@/features/interrupts/lib/table-preferences";
import { StudioRouteLoading } from "@/features/telemetry/components/studio-route-loading";

export default async function InterruptsLoading() {
  const cookieStore = await cookies();
  const preferences = {
    ...DEFAULT_INTERRUPTS_TABLE_PREFERENCES,
    ...parseInterruptsTablePreferences(
      cookieStore.get(INTERRUPTS_TABLE_PREFERENCES_COOKIE)?.value,
    ),
  };
  return (
    <StudioRouteLoading
      route="interrupts"
      layout={preferences.layout}
      sort={preferences.sort}
      direction={preferences.dir}
      pageSize={preferences.pageSize}
    />
  );
}
