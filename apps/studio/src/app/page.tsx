import { studioSettings } from "@studio/settings";
import { redirect } from "next/navigation";
import { getStudioShellContext } from "@/lib/studio-context";

export default async function Home() {
  const settings = await studioSettings.resolve(await getStudioShellContext());
  redirect(settings.setupRequired ? "/settings" : "/runs");
}
