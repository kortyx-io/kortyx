import type { NodeFn } from "@kortyx/core";

const registry = new Map<string, NodeFn>();

export function registerNode(id: string, fn: NodeFn): void {
  registry.set(id, fn);
}

export function getRegisteredNode(id: string): NodeFn | null {
  return registry.get(id) ?? null;
}

export function listRegisteredNodes(): string[] {
  return [...registry.keys()].sort();
}

export function clearRegisteredNodes(): void {
  registry.clear();
}

export function resolveNode(id: string): NodeFn {
  const fn = registry.get(id);
  if (!fn) {
    throw new Error(
      `Node '${id}' is not registered. Call registerNode('${id}', fn) before running workflows that reference it.`,
    );
  }
  return fn;
}
