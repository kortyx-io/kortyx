import { getDocsSearchIndex } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";
import { NavbarClient } from "./navbar-client";

type NavbarProps = {
  className?: string;
};

export async function Navbar({ className }: NavbarProps) {
  const searchIndex = await getDocsSearchIndex();

  return <NavbarClient searchIndex={searchIndex} className={cn(className)} />;
}
