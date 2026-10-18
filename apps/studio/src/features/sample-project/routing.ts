/** Sample context is explicit in URLs; it cannot change another tab's project. */
export const SAMPLE_PREFIX = "/sample";
export const SAMPLE_REQUEST_HEADER = "x-kortyx-sample-project";
export const SAMPLE_VISIBILITY_COOKIE = "kortyx_sample_visible";
export const SAMPLE_RETURN_COOKIE = "kortyx_sample_return";
export function isSamplePath(path: string) {
  return path === SAMPLE_PREFIX || path.startsWith(`${SAMPLE_PREFIX}/`);
}
export function samplePath(path: string) {
  return isSamplePath(path)
    ? path.slice(SAMPLE_PREFIX.length) || "/runs"
    : path;
}
export function safeSampleReturn(path: string | undefined) {
  return path === "/onboarding"
    ? path
    : path && /^(?:\/projects\/prj_[0-9a-f]{24})?\/runs$/.test(path)
      ? path
      : "/runs";
}
