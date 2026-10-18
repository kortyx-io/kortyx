"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SidebarSection } from "@/lib/docs";
import type { ProductTarget } from "./docs-product-selector";
import { DocsSidebarContent } from "./docs-sidebar";

type VersionTarget = {
  version: string;
  href: string;
  isLatest: boolean;
  label: string;
  subtitle: string;
};

type DocsMobileSidebarProps = {
  selectedProduct: string;
  productTargets: ProductTarget[];
  sidebar: SidebarSection[];
  currentSectionSlug: string | null;
  currentDocSlug: string | null;
  versionTargets: VersionTarget[];
  selectedVersion: string;
};

export function DocsMobileSidebar(props: DocsMobileSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (pathname) setIsOpen(false);
  }, [pathname]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-6">
        <SheetTitle className="sr-only">Documentation Menu</SheetTitle>
        <DocsSidebarContent {...props} />
      </SheetContent>
    </Sheet>
  );
}
