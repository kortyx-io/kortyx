import "server-only";
import { createElement } from "react";
import type { StudioSettingsAdapter } from "./contracts";
import {
  OperatorEvaluationSettings,
  OperatorKeySettings,
} from "./operator-settings";

/** Self-hosted Studio retains its existing local configuration cards. */
export const studioSettings: StudioSettingsAdapter = {
  async resolve(context) {
    return {
      categories: [
        {
          id: "environments",
          label: "Environments",
          group: "Project",
          content: createElement(
            "section",
            null,
            createElement(
              "h2",
              { className: "mb-5 border-b pb-5 text-xl font-semibold" },
              "Environments",
            ),
            createElement(
              "p",
              { className: "mb-5 text-sm text-muted-foreground" },
              "Allowed telemetry environments for this operator-managed project. Environment changes are deployment configuration, not team administration.",
            ),
            createElement(
              "ul",
              { className: "divide-y text-sm" },
              ...context.scope.telemetryEnvironments.map((name) =>
                createElement(
                  "li",
                  { key: name, className: "py-3 font-mono" },
                  name,
                ),
              ),
            ),
          ),
        },
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
