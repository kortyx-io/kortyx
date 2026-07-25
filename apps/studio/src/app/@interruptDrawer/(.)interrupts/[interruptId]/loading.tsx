import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";

export default function InterruptDrawerLoading() {
  return (
    <DetailDrawerLoading
      basePath="/interrupts"
      title="Interrupt details"
      description="Inspect the decision and resume audit trail"
    />
  );
}
