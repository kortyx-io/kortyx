import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function GithubLink({ className }: { className?: string }) {
  return (
    <Button variant="ghost" size="icon" asChild className={cn(className)}>
      <a
        href="https://github.com/kortyx-io/kortyx"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="sr-only">Open Kortyx on GitHub</span>
        <GithubIcon className="size-5" />
      </a>
    </Button>
  );
}
