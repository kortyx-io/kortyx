import { dirname } from "node:path";
import type {
  EnsureWorkflowTopologyRequest,
  WorkflowTool,
} from "@kortyx/telemetry-contracts";
import ts from "typescript";

type Call = { sourceNodeId: string; targetWorkflowId: string };
type NodeTools = {
  tools: WorkflowTool[];
  toolDiscovery: { status: "complete" | "unresolved"; warnings: string[] };
};
type Bindings = Map<ts.Symbol, ts.Expression>;

/** Source-only discovery: never executes a node, hook, or workflow. */
export function discoverWorkflowCalls(
  entry: string,
  snapshots: EnsureWorkflowTopologyRequest[],
): {
  calls: Map<string, Call[]>;
  tools: Map<string, Map<string, NodeTools>>;
  warnings: string[];
} {
  const configPath = ts.findConfigFile(dirname(entry), ts.sys.fileExists);
  const config = configPath
    ? ts.readConfigFile(configPath, ts.sys.readFile).config
    : {};
  const parsed = ts.parseJsonConfigFileContent(
    config ?? {},
    ts.sys,
    configPath ? dirname(configPath) : dirname(entry),
  );
  const program = ts.createProgram([entry], {
    ...parsed.options,
    allowJs: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const known = new Map(
    snapshots.map((s) => [
      s.workflow.id,
      new Set(s.workflow.nodes.map((n) => n.id)),
    ]),
  );
  const calls = new Map<string, Call[]>();
  const warnings = new Set<string>();
  const attachedTools = new Map<string, Map<string, NodeTools>>();
  const definitions = new Map<string, ts.ObjectLiteralExpression[]>();
  const local = (n: ts.Node) =>
    !n.getSourceFile().isDeclarationFile &&
    !n.getSourceFile().fileName.includes("node_modules");
  const symbol = (n: ts.Node): ts.Symbol | undefined => {
    let s = checker.getSymbolAtLocation(n);
    if (
      s?.valueDeclaration &&
      ts.isShorthandPropertyAssignment(s.valueDeclaration)
    )
      s = checker.getShorthandAssignmentValueSymbol(s.valueDeclaration);
    return s && s.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(s)
      : s;
  };
  const unwrap = (e: ts.Expression): ts.Expression => {
    while (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e)
    )
      e = e.expression;
    return e;
  };
  const api = (e: ts.Expression, name: string): boolean => {
    e = unwrap(e);
    const s = symbol(ts.isPropertyAccessExpression(e) ? e.name : e);
    if (s?.name !== name) return false;
    return (s.declarations ?? []).some((d) =>
      /(?:node_modules\/(?:kortyx|@kortyx\/)|packages\/(?:core|hooks|sdk)\/)/.test(
        d.getSourceFile().fileName,
      ),
    );
  };
  const factoryBindings = new WeakMap<ts.Expression, Bindings>();
  function resolve(
    e: ts.Expression | undefined,
    bindings: Bindings,
    seen = new Set<ts.Node>(),
  ): ts.Expression | undefined {
    if (!e) return;
    e = unwrap(e);
    if (seen.has(e)) return;
    seen.add(e);
    if (ts.isIdentifier(e)) {
      const s = symbol(e);
      const bound = s && bindings.get(s);
      if (bound) return resolve(bound, bindings, seen);
      const d = s?.valueDeclaration;
      if (
        d &&
        (ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d)) &&
        d.initializer &&
        (!ts.isVariableDeclaration(d) ||
          (ts.isVariableDeclarationList(d.parent) &&
            (d.parent.flags & ts.NodeFlags.Const) !== 0))
      )
        return resolve(d.initializer, bindings, seen);
    }
    if (ts.isPropertyAccessExpression(e)) {
      const found = property(e.expression, e.name.text, bindings, seen);
      if (found) return resolve(found, bindings, seen);
      const owner = symbol(e.expression);
      const declaration = symbol(e.name)?.valueDeclaration;
      if (
        owner &&
        owner.flags & ts.SymbolFlags.Module &&
        declaration &&
        ts.isVariableDeclaration(declaration)
      )
        return resolve(declaration.initializer, bindings, seen);
      return e;
    }
    if (
      ts.isElementAccessExpression(e) &&
      e.argumentExpression &&
      ts.isStringLiteralLike(e.argumentExpression)
    ) {
      const found = property(
        e.expression,
        e.argumentExpression.text,
        bindings,
        seen,
      );
      return found ? resolve(found, bindings, seen) : e;
    }
    if (ts.isCallExpression(e)) {
      const d = symbol(
        ts.isPropertyAccessExpression(e.expression)
          ? e.expression.name
          : e.expression,
      )?.valueDeclaration;
      const fn =
        d && ts.isFunctionDeclaration(d)
          ? d
          : d &&
              ts.isVariableDeclaration(d) &&
              d.initializer &&
              (ts.isArrowFunction(d.initializer) ||
                ts.isFunctionExpression(d.initializer))
            ? d.initializer
            : undefined;
      if (fn?.body && local(fn)) {
        const bound = new Map(bindings);
        fn.parameters.forEach((p, i) => {
          if (ts.isIdentifier(p.name)) {
            const key = symbol(p.name);
            const arg = e.arguments[i] ?? p.initializer;
            if (key && arg)
              bound.set(key, resolve(arg, bindings, new Set(seen)) ?? arg);
          }
        });
        const returned = ts.isBlock(fn.body)
          ? fn.body.statements
              .filter(ts.isReturnStatement)
              .map((r) => r.expression)
          : [fn.body];
        if (returned.length === 1 && returned[0]) {
          const value = resolve(returned[0], bound, seen);
          if (value) factoryBindings.set(value, bound);
          return value;
        }
      }
    }
    return e;
  }
  function property(
    e: ts.Expression | undefined,
    key: string,
    bindings: Bindings,
    seen = new Set<ts.Node>(),
  ): ts.Expression | undefined {
    const obj = resolve(e, bindings, seen);
    if (!obj || !ts.isObjectLiteralExpression(obj)) return;
    const scoped = factoryBindings.get(obj) ?? bindings;
    // Later properties override earlier spreads/properties.
    for (const p of [...obj.properties].reverse()) {
      if (ts.isSpreadAssignment(p)) {
        const spread = resolve(p.expression, scoped, new Set(seen));
        if (!spread || !ts.isObjectLiteralExpression(spread)) return undefined;
        const found = property(p.expression, key, scoped, new Set(seen));
        if (found) return found;
      } else if (
        p.name &&
        (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) &&
        p.name.text === key
      ) {
        if (ts.isPropertyAssignment(p))
          return resolve(p.initializer, scoped, new Set(seen));
        if (ts.isShorthandPropertyAssignment(p))
          return resolve(p.name, scoped, new Set(seen));
      }
    }
    return undefined;
  }
  function literal(
    e: ts.Expression | undefined,
    bindings: Bindings,
  ): string | undefined {
    const value = resolve(e, bindings);
    return value && ts.isStringLiteralLike(value) ? value.text : undefined;
  }
  function workflowId(
    e: ts.Expression | undefined,
    bindings: Bindings,
  ): string | undefined {
    const value = resolve(e, bindings);
    if (!value) return;
    if (ts.isStringLiteralLike(value)) return value.text;
    if (ts.isCallExpression(value) && api(value.expression, "defineWorkflow"))
      return literal(property(value.arguments[0], "id", bindings), bindings);
    return undefined;
  }
  function isHook(e: ts.Expression): boolean {
    if (api(e, "useWorkflow")) return true;
    e = unwrap(e);
    const d = symbol(
      ts.isPropertyAccessExpression(e) ? e.name : e,
    )?.valueDeclaration;
    if (
      d &&
      ts.isBindingElement(d) &&
      (d.propertyName?.getText() ?? d.name.getText()) === "useWorkflow"
    ) {
      const decl = d.parent.parent;
      if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const value = resolve(decl.initializer, new Map());
        return (
          !!value &&
          ts.isCallExpression(value) &&
          api(value.expression, "createWorkflowHooks")
        );
      }
    }
    if (ts.isPropertyAccessExpression(e) && e.name.text === "useWorkflow") {
      const value = resolve(e.expression, new Map());
      return (
        !!value &&
        ts.isCallExpression(value) &&
        api(value.expression, "createWorkflowHooks")
      );
    }
    const value = resolve(e, new Map());
    return !!value && value !== e && api(value, "useWorkflow");
  }
  function functionFor(
    e: ts.Expression,
  ): ts.FunctionLikeDeclaration | undefined {
    const value = resolve(e, new Map());
    if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)))
      return value;
    const d = symbol(
      ts.isPropertyAccessExpression(e) ? e.name : e,
    )?.valueDeclaration;
    return d && (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d))
      ? d
      : undefined;
  }
  function recordTools(
    expression: ts.Expression | undefined,
    mode: "direct" | "model",
    bindings: Bindings,
    workflow: string,
    node: string,
    list = false,
    seen = new Set<ts.Node>(),
  ) {
    const byNode = attachedTools.get(workflow) ?? new Map<string, NodeTools>();
    attachedTools.set(workflow, byNode);
    const target = byNode.get(node) ?? {
      tools: [],
      toolDiscovery: { status: "complete" as const, warnings: [] },
    };
    byNode.set(node, target);
    const unresolved = () => {
      target.toolDiscovery.status = "unresolved";
      const warning = `${workflow}/${node}: tool attachment is not statically resolved; real execution supplies observed tools.`;
      if (!target.toolDiscovery.warnings.includes(warning))
        target.toolDiscovery.warnings.push(warning);
      warnings.add(warning);
    };
    const value = resolve(expression, bindings);
    if (!value || seen.has(value)) {
      unresolved();
      return;
    }
    seen.add(value);
    if (list && ts.isArrayLiteralExpression(value)) {
      for (const item of value.elements) {
        if (ts.isSpreadElement(item))
          recordTools(
            item.expression,
            mode,
            bindings,
            workflow,
            node,
            true,
            new Set(seen),
          );
        else
          recordTools(
            item,
            mode,
            bindings,
            workflow,
            node,
            false,
            new Set(seen),
          );
      }
      return;
    }
    if (list) {
      unresolved();
      return;
    }
    const name = literal(property(value, "name", bindings), bindings);
    if (!name) {
      unresolved();
      return;
    }
    const description = literal(
      property(value, "description", bindings),
      bindings,
    );
    const schema = property(value, "inputSchema", bindings);
    const fields = resolve(property(schema, "properties", bindings), bindings);
    const requiredValue = resolve(
      property(schema, "required", bindings),
      bindings,
    );
    const required =
      requiredValue && ts.isArrayLiteralExpression(requiredValue)
        ? requiredValue.elements.map((entry) => literal(entry, bindings))
        : [];
    const inputFields =
      fields && ts.isObjectLiteralExpression(fields)
        ? fields.properties.flatMap((field) => {
            if (
              !ts.isPropertyAssignment(field) ||
              !(
                ts.isIdentifier(field.name) ||
                ts.isStringLiteralLike(field.name)
              )
            )
              return [];
            return [
              {
                name: field.name.text,
                type:
                  literal(
                    property(field.initializer, "type", bindings),
                    bindings,
                  ) ?? "unknown",
                required: required.includes(field.name.text),
              },
            ];
          })
        : [];
    if (
      !target.tools.some(
        (tool) => tool.name === name && tool.callingMode === mode,
      )
    )
      target.tools.push({
        name,
        callingMode: mode,
        provenance: "source",
        ...(description ? { description } : {}),
        ...(inputFields.length ? { inputFields } : {}),
      });
  }
  function scanFunction(
    fn: ts.FunctionLikeDeclaration,
    bindings: Bindings,
    workflow: string,
    node: string,
    stack: Set<ts.Node>,
  ) {
    if (!fn.body || !local(fn) || stack.has(fn)) return;
    if (stack.size >= 32) {
      warnings.add(
        `${workflow}/${node}: custom-hook discovery depth exceeded.`,
      );
      const attached = attachedTools.get(workflow)?.get(node);
      if (attached) {
        attached.toolDiscovery.status = "unresolved";
        attached.toolDiscovery.warnings.push(
          "Custom-hook discovery depth exceeded.",
        );
      }
      return;
    }
    const next = new Set(stack).add(fn);
    const walk = (n: ts.Node) => {
      if (ts.isFunctionDeclaration(n)) return; // Follow helpers at their call sites.
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        (ts.isArrowFunction(n.initializer) ||
          ts.isFunctionExpression(n.initializer))
      )
        return;
      if (ts.isCallExpression(n)) {
        if (api(n.expression, "useTool")) {
          recordTools(
            property(n.arguments[0], "tool", bindings),
            "direct",
            bindings,
            workflow,
            node,
          );
        } else if (api(n.expression, "useReason")) {
          const list = property(n.arguments[0], "tools", bindings);
          if (list) recordTools(list, "model", bindings, workflow, node, true);
        } else if (isHook(n.expression)) {
          const target = workflowId(
            property(n.arguments[0], "workflow", bindings),
            bindings,
          );
          if (target && known.has(target)) {
            const list = calls.get(workflow) ?? [];
            if (
              !list.some(
                (c) => c.sourceNodeId === node && c.targetWorkflowId === target,
              )
            )
              list.push({ sourceNodeId: node, targetWorkflowId: target });
            calls.set(workflow, list);
          } else {
            const pos = n
              .getSourceFile()
              .getLineAndCharacterOfPosition(n.getStart());
            warnings.add(
              `${workflow}/${node}: unresolved or unregistered child target at ${n.getSourceFile().fileName}:${pos.line + 1}; runtime observations will supply dynamic targets.`,
            );
          }
        } else {
          const helper = functionFor(n.expression);
          if (helper && local(helper)) {
            const bound = new Map(bindings);
            helper.parameters.forEach((p, i) => {
              const arg = n.arguments[i];
              if (!arg) return;
              if (ts.isIdentifier(p.name)) {
                const s = symbol(p.name);
                if (s) bound.set(s, resolve(arg, bindings) ?? arg);
              } else if (ts.isObjectBindingPattern(p.name)) {
                for (const b of p.name.elements) {
                  const value = property(
                    arg,
                    b.propertyName?.getText() ?? b.name.getText(),
                    bindings,
                  );
                  const s = symbol(b.name);
                  if (s && value)
                    bound.set(s, resolve(value, bindings) ?? value);
                }
              }
            });
            scanFunction(helper, bound, workflow, node, next);
          }
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(fn.body);
  }
  for (const source of program.getSourceFiles().filter(local)) {
    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n) && api(n.expression, "defineWorkflow")) {
        const obj = resolve(n.arguments[0], new Map());
        const id = obj && literal(property(obj, "id", new Map()), new Map());
        if (id && known.has(id) && obj && ts.isObjectLiteralExpression(obj))
          definitions.set(id, [...(definitions.get(id) ?? []), obj]);
      }
      ts.forEachChild(n, walk);
    };
    walk(source);
  }
  for (const [id, nodes] of known) {
    attachedTools.set(
      id,
      new Map(
        [...nodes].map((node) => [
          node,
          { tools: [], toolDiscovery: { status: "complete", warnings: [] } },
        ]),
      ),
    );
    const defs = definitions.get(id) ?? [];
    if (defs.length !== 1) {
      warnings.add(
        `${id}: ${defs.length ? "ambiguous" : "unavailable"} workflow source; child-call discovery skipped.`,
      );
      for (const node of attachedTools.get(id)?.values() ?? []) {
        node.toolDiscovery.status = "unresolved";
        node.toolDiscovery.warnings.push(
          "Workflow source unavailable or ambiguous.",
        );
      }
      continue;
    }
    calls.set(id, []);
    const bindings = new Map<ts.Symbol, ts.Expression>();
    const obj = property(defs[0], "nodes", bindings);
    for (const node of nodes) {
      const run = property(property(obj, node, bindings), "run", bindings);
      const fn = run && functionFor(run);
      if (fn) scanFunction(fn, bindings, id, node, new Set());
      else {
        const tools = attachedTools.get(id)?.get(node);
        if (tools) {
          tools.toolDiscovery.status = "unresolved";
          tools.toolDiscovery.warnings.push("Node source unavailable.");
        }
        warnings.add(
          `${id}/${node}: node source unavailable; child-call discovery skipped.`,
        );
      }
    }
    calls
      .get(id)
      ?.sort(
        (a, b) =>
          a.sourceNodeId.localeCompare(b.sourceNodeId) ||
          a.targetWorkflowId.localeCompare(b.targetWorkflowId),
      );
  }
  for (const nodes of attachedTools.values())
    for (const node of nodes.values())
      node.tools.sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.callingMode.localeCompare(b.callingMode),
      );
  return { calls, tools: attachedTools, warnings: [...warnings].sort() };
}
