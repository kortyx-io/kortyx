import "server-only";
import { createElement } from "react";
import type { StudioSettingsAdapter } from "./contracts";
import {
  OperatorEvaluationSettings,
  OperatorKeySettings,
} from "./operator-settings";

/** Self-hosted Studio retains its existing local configuration cards. */
export const studioSettings: StudioSettingsAdapter = {
  async resolve() {
    return {
      categories: [
        {
          id: "api-keys",
          label: "API keys",
          content: createElement(OperatorKeySettings),
        },
        {
          id: "evaluations",
          label: "Evaluations",
          content: createElement(OperatorEvaluationSettings),
        },
      ],
      setupRequired: false,
    };
  },
};
