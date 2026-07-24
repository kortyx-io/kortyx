import type { StudioApiError } from "@/lib/studio-api";

type StudioDataErrorProps = {
  title: string;
  error: StudioApiError;
};

export function StudioDataError({ title, error }: StudioDataErrorProps) {
  const detail =
    error.type === "not_configured"
      ? "Configure KORTYX_API_URL and KORTYX_STUDIO_API_KEY, then restart Studio."
      : error.status === 403
        ? "The Studio service key is valid but is missing the Studio read scope for this project."
        : error.status === 401
          ? "The Studio service key is missing, invalid, expired, or revoked."
          : error.status
            ? `Status ${error.status}`
            : error.type;

  return (
    <div className="flex h-full items-center justify-center rounded-xl border bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
