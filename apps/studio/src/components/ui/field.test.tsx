import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Field, FieldLabel } from "./field";
import { Input } from "./input";

it("owns label/control spacing and retains native label association", () => {
  const html = renderToStaticMarkup(
    <Field>
      <FieldLabel htmlFor="name">Project name</FieldLabel>
      <Input id="name" name="name" />
    </Field>,
  );
  expect(html).toContain('data-slot="field" class="grid min-w-0 gap-2"');
  expect(html).toContain('for="name"');
  expect(html).toContain('id="name"');
  expect(html).not.toContain("mt-");
});
