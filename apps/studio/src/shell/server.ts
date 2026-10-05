import "server-only";
import { createElement } from "react";
import type { StudioShellAdapter } from "./contracts";
import { getOperatorScopes } from "./operator-scopes";
import { OperatorScopeSwitcher } from "./operator-switchers";

/** An operator-managed installation has no managed user or team account. */
export const studioShell: StudioShellAdapter = {
  async resolve() {
    const scope = await getOperatorScopes();
    if (!scope) return {};
    const projects = scope.scopes.map((row) => ({
      id: row.id,
      name: row.context.project.name,
    }));
    const environments = scope.selected.context.environments.map((name) => ({
      id: name,
      name,
    }));
    return {
      ...(projects.length > 1
        ? {
            projectSwitcher: createElement(OperatorScopeSwitcher, {
              kind: "project",
              selected: scope.selected.id,
              options: projects,
            }),
          }
        : {}),
      ...(environments.length > 1 && scope.environment
        ? {
            environmentSwitcher: createElement(OperatorScopeSwitcher, {
              kind: "environment",
              selected: scope.environment,
              options: environments,
            }),
          }
        : {}),
    };
  },
};
