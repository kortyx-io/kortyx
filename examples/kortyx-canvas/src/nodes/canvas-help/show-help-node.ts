import "server-only";

const HELP_TEXT = `## Canvas help

- **Create a canvas:** Ask “Create a canvas for a product brief” and choose a brief and facilitator.
- **Find a brief:** Ask “Find the Developer Onboarding brief.”
- **Refine a canvas:** Describe the section or item you want to change.
- **Save your work:** Ask “Save this canvas” and confirm when prompted.

Send another message whenever you’re ready to continue.`;

export const showHelpNode = async () => ({
  data: { text: HELP_TEXT },
  ui: { message: HELP_TEXT },
});
