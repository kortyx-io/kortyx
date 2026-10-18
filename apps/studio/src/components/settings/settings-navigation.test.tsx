import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SettingsNavigation, SettingsPanel } from "./settings-navigation";

vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () => "/settings/general",
}));
vi.mock("@/components/scoped-link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

it("shows unavailable categories with a Soon badge and no navigation link", () => {
  const html = renderToStaticMarkup(
    <SettingsNavigation>
      <SettingsPanel id="general" label="General">
        General settings
      </SettingsPanel>
      <SettingsPanel id="members" label="Members" availability="soon">
        Preview
      </SettingsPanel>
    </SettingsNavigation>,
  );
  expect(html).toContain('href="/settings/general"');
  expect(html).toContain('aria-disabled="true"');
  expect(html).toContain("Members");
  expect(html).toContain("Soon");
  expect(html).not.toContain('href="/settings/members"');
});
