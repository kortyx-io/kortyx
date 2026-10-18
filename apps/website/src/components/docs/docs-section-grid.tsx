import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SectionItem = {
  href: string;
  title: string;
  description: string;
};

type DocsSectionGridProps = {
  title: string;
  description?: string;
  items: SectionItem[];
};

export function DocsSectionGrid(props: DocsSectionGridProps) {
  const { title, description, items } = props;

  return (
    <section className="max-w-5xl pb-20">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full gap-3 cursor-pointer transition-colors hover:bg-accent">
              <CardHeader className="pb-0">
                <CardTitle className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-base leading-7 text-foreground md:text-lg">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
