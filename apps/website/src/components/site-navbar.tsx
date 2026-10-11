import { SiteNavbarClient } from "@/components/site-navbar-client";
import { getDocsSearchIndex } from "@/lib/docs";

export async function SiteNavbar() {
  const searchIndex = await getDocsSearchIndex();
  return <SiteNavbarClient searchIndex={searchIndex} />;
}
