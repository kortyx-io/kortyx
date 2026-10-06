import { expect, it } from "vitest";
import { studioHref, studioPathname } from "./studio-routing";

const scope = {
  projectPublicId: "prj_0123456789abcdef01234567",
  organizationPublicId: "org_0123456789abcdef01234567",
};
it("leaves OSS, auth and external destinations unchanged", () => {
  for (const href of [
    "/runs",
    "/settings/account",
    "/auth/logout",
    "https://example.test",
    "//example.test",
  ])
    expect(studioHref(href)).toBe(href);
  expect(studioHref("/settings/account", scope)).toBe("/settings/account");
  expect(studioHref("/auth/logout", scope)).toBe("/auth/logout");
});
it("keeps project links, detail routes and settings in explicit scope", () => {
  expect(studioHref("/runs/run-a?range=24h#details", scope)).toBe(
    `/projects/${scope.projectPublicId}/runs/run-a?range=24h#details`,
  );
  expect(studioHref("/settings/project", scope)).toBe(
    `/projects/${scope.projectPublicId}/settings/general`,
  );
  expect(studioHref("/settings/providers", scope)).toBe(
    `/projects/${scope.projectPublicId}/settings/providers`,
  );
  expect(studioHref("/settings/members", scope)).toBe(
    `/organizations/${scope.organizationPublicId}/settings/members`,
  );
  expect(studioPathname(studioHref("/settings/project", scope))).toBe(
    "/settings/project",
  );
  expect(studioPathname(studioHref("/evals/runs/a", scope))).toBe(
    "/evals/runs/a",
  );
  expect(studioHref(studioHref("/runs", scope), scope)).toBe(
    studioHref("/runs", scope),
  );
});
