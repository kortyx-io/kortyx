import { expect, it } from "vitest";
import { safeLearningGuides } from "./studio-learning-guides";

it("accepts authorized edition destinations and rejects unsafe or duplicate links", () => {
  const guide = {
    id: "members",
    title: "Manage members",
    description: "An optional workspace guide",
    href: "/organizations/org_test/settings/members" as const,
  };
  expect(
    safeLearningGuides([
      guide,
      guide,
      ...["//evil.example", "/\\evil.example", "javascript:alert(1)"].map(
        (href, i) => ({
          ...guide,
          id: `invalid-${i}`,
          href: href as `/${string}`,
        }),
      ),
    ]),
  ).toEqual([guide]);
});
