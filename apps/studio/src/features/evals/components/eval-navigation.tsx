import Link from "next/link";
export function EvalNavigation({ active }: { active: "runs" | "suites" }) {
  return (
    <nav aria-label="Eval navigation" className="flex gap-5 border-b">
      {(["runs", "suites"] as const).map((view) => (
        <Link
          key={view}
          href={`/evals/${view}`}
          prefetch={false}
          aria-current={view === active ? "page" : undefined}
          className={`border-b-2 pb-2 text-xs font-medium ${view === active ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {view === "runs" ? "Runs" : "Suites"}
        </Link>
      ))}
    </nav>
  );
}
