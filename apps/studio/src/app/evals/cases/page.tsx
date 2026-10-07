import { scopedRedirect } from "@/lib/scoped-redirect";
export default async function Page() {
  await scopedRedirect("/evals/runs");
}
