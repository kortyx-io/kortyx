import { DetailDrawerLoading } from "@/components/detail/detail-drawer-loading";
export default function Loading() {
  return (
    <DetailDrawerLoading
      basePath="/evals/suites"
      title="Eval suite"
      description="Conversation definition"
    />
  );
}
