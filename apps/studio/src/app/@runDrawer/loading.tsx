import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";

export default function RunDrawerLoading() {
  return (
    <DetailDrawerLoading
      basePath="/runs"
      title="Run details"
      description="Inspect execution, payloads, and timing"
    />
  );
}
