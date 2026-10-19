/** Server authentication contract. Never import credentials in client code. */
export interface StudioAuthAdapter {
  /** Return a denial/redirect, or null when this browser request is allowed. */
  authorize(request: Request): Promise<Response | null>;
  /**
   * Optional background session check for signed-in account shells. Never start
   * login, record foreground activity, or expose credentials. Provider refresh
   * may occur without extending the session's idle or absolute lifetime.
   */
  getSessionStatus?(
    request: Request,
  ): Promise<"authenticated" | "unauthenticated" | "unavailable">;
  /** Independently validate the current request/session; never retain credentials in module globals. */
  getApiCredential(request?: Request): Promise<{
    authorization: string;
    projectId?: string;
    environmentId?: string;
    environment?: string;
  } | null>;
  /** Server-owned login/callback/logout entry point; method/CSRF checks belong to the adapter. */
  handleAuthRequest(request: Request): Promise<Response>;
}
