import { notFound } from "next/navigation";

// The implicit children slot needs a fallback alongside the detail drawers.
// Preserve a 404 when no primary page matches rather than rendering an empty shell.
export default function Default() {
  notFound();
}
