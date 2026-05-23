import { readFile } from "node:fs/promises";
import path from "node:path";

export async function getOgLogoDataUri(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logo = await readFile(logoPath);
    return `data:image/png;base64,${logo.toString("base64")}`;
  } catch {
    return null;
  }
}
