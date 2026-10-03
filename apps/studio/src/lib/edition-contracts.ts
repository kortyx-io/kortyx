/** First-party, compiled server edition boundary. Never import credentials in client code. */
export interface StudioEdition {
  /** Return a denial/redirect, or null when this browser request is allowed. */
  authorize(request: Request): Promise<Response | null>;
  /** Resolve credentials per request/session; never retain them in module globals. */
  getApiCredential(
    request?: Request,
  ): Promise<{ authorization: string } | null>;
  /** Server-owned login/callback/logout entry point; method/CSRF checks belong to the edition. */
  handleAuthRequest(request: Request): Promise<Response>;
}
