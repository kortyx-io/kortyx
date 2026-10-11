import "server-only";

import { studioShell } from "@studio/shell";
import { redirect } from "next/navigation";
import { getStudioShellContext } from "./studio-context";
import { studioHref } from "./studio-routing";

/** Edition scope comes from the independently authorized shell, not URL parsing. */
export async function scopedRedirect(href: string): Promise<never> {
  const context = await getStudioShellContext();
  const contribution = await studioShell.resolve(context);
  redirect(studioHref(href, contribution.routeScope));
}
