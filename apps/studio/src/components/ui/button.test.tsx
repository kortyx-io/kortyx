import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Button, buttonVariants } from "./button";

it("keeps legacy shadcn action aliases on the canonical style definitions", () => {
  expect(buttonVariants({ variant: "default" })).toBe(
    buttonVariants({ variant: "primary" }),
  );
  expect(buttonVariants({ variant: "outline" })).toBe(
    buttonVariants({ variant: "secondary" }),
  );
});

it("gives action links the same button role and size styling without nesting interactive elements", () => {
  const action = renderToStaticMarkup(
    <Button variant="secondary" size="sm">
      Import
    </Button>,
  );
  const link = renderToStaticMarkup(
    <Button asChild variant="secondary" size="sm">
      <a href="/prompts/groups">Test groups</a>
    </Button>,
  );
  expect(link).toContain('<a href="/prompts/groups"');
  expect(link).not.toContain("<button");
  expect(link.match(/class="([^"]*)"/)?.[1]).toBe(
    action.match(/class="([^"]*)"/)?.[1],
  );
  expect(link).toContain('data-variant="secondary"');
  expect(link).toContain('data-size="sm"');
});

it("preserves form submission, disabled state and pressed-state semantics", () => {
  const submit = renderToStaticMarkup(
    <Button type="submit" disabled>
      Save
    </Button>,
  );
  expect(submit).toContain('type="submit"');
  expect(submit).toContain('disabled=""');
  expect(submit).toContain('data-variant="primary"');
  const toggle = renderToStaticMarkup(
    <Button variant="ghost" aria-pressed={true}>
      Live
    </Button>,
  );
  expect(toggle).toContain('aria-pressed="true"');
});
