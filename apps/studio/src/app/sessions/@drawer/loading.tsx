import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";

export default function SessionDrawerLoading() {
  return (
    <DetailDrawerLoading
      basePath="/sessions"
      title="Session details"
      description="Replay runs, state, and lifecycle events"
    />
  );
}
