import { expect, type Locator } from "@playwright/test";

/** URL-backed controlled inputs commit after the navigation transition. */
export async function setUrlSelection(control: Locator, checked = true) {
  if ((await control.isChecked()) !== checked) await control.click();
  if (checked) await expect(control).toBeChecked();
  else await expect(control).not.toBeChecked();
}
