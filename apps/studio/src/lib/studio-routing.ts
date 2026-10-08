/** Product context in URLs is a request, never an authorization grant. */
export interface StudioRouteScope {
  projectPublicId?: string;
  organizationPublicId?: string;
}

export const STUDIO_REQUEST_PATH = "x-kortyx-studio-request-path";

export function studioHref(href: string, scope?: StudioRouteScope): string {
  if (!scope || !href.startsWith("/") || href.startsWith("//")) return href;
  const split = href.search(/[?#]/);
  const path = split < 0 ? href : href.slice(0, split);
  const suffix = split < 0 ? "" : href.slice(split);
  if (
    scope.organizationPublicId &&
    /^\/settings\/(general|members)$/.test(path)
  )
    return `/organizations/${scope.organizationPublicId}${path}${suffix}`;
  if (scope.projectPublicId) {
    const prefix = `/projects/${scope.projectPublicId}`;
    if (path === "/" || path === "/settings")
      return `${prefix}${path === "/" ? "/runs" : "/settings/general"}${suffix}`;
    if (path === "/settings/project")
      return `${prefix}/settings/general${suffix}`;
    if (
      /^\/settings\/(api-keys|connection|evaluations|providers|privacy)$/.test(
        path,
      )
    )
      return `${prefix}${path}${suffix}`;
    if (
      /^\/(runs|sessions|workflows|interrupts|evals|diagnostics)(\/|$)/.test(
        path,
      )
    )
      return `${prefix}${path}${suffix}`;
  }
  return href;
}

export function studioPathname(pathname: string): string {
  const project = pathname.match(/^\/projects\/prj_[0-9a-f]{24}(\/.*)$/);
  if (project)
    return project[1] === "/settings/general"
      ? "/settings/project"
      : (project[1] ?? pathname);
  const organization = pathname.match(
    /^\/organizations\/org_[0-9a-f]{24}(\/settings\/(?:general|members))$/,
  );
  return organization?.[1] ?? pathname;
}
