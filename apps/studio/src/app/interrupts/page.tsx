import { cookies } from "next/headers";
import InterruptsPageClient from "@/features/interrupts/components/interrupts-page-client";
import { getMockInterrupts } from "@/features/interrupts/data/mock-interrupts";
import {
  INTERRUPTS_TABLE_PREFERENCES_COOKIE,
  parseInterruptsTablePreferences,
} from "@/features/interrupts/lib/table-preferences";

export default async function InterruptsPage() {
  const [interrupts, cookieStore] = await Promise.all([
    getMockInterrupts(),
    cookies(),
  ]);
  return (
    <InterruptsPageClient
      interrupts={interrupts}
      preferences={parseInterruptsTablePreferences(
        cookieStore.get(INTERRUPTS_TABLE_PREFERENCES_COOKIE)?.value,
      )}
    />
  );
}
