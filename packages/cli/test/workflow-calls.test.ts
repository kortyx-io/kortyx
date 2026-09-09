import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EnsureWorkflowTopologyRequest } from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import { discoverWorkflowCalls } from "../src/workflow-calls";

const snapshot = (
  id: string,
  nodes: string[] = ["chat"],
): EnsureWorkflowTopologyRequest => ({
  schemaVersion: 1,
  environment: "test",
  service: { name: "test" },
  workflow: {
    id,
    declaredVersion: "1",
    topologyHash: "a".repeat(64),
    nodes: nodes.map((id) => ({ id })),
    edges: [],
  },
});

function discover(source: string) {
  const dir = mkdtempSync(join(process.cwd(), ".calls-test-"));
  try {
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          moduleResolution: "bundler",
          module: "esnext",
          target: "es2022",
        },
      }),
    );
    writeFileSync(
      join(dir, "hooks.ts"),
      `import { useWorkflow as invoke } from "../../hooks/src/index";
      export async function useResearch(args: {target: unknown}) { return await invoke({id:"research",workflow:args.target,input:{}}); }
      export function recurse() { recurse(); }
    `,
    );
    writeFileSync(
      join(dir, "entry.ts"),
      `import {defineWorkflow as define} from "@kortyx/core";
      import {useWorkflow as invoke, createWorkflowHooks} from "../../hooks/src/index";
      import {useResearch, recurse} from "./hooks";
      const IDS = {child:"child"} as const;
      const child = define({id:IDS.child, version:"1", nodes:{}, edges:[]});
      ${source}
      throw new Error("Analysis must never execute this module");
    `,
    );
    return discoverWorkflowCalls(join(dir, "entry.ts"), [
      snapshot("parent"),
      snapshot("child", []),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("child workflow source discovery", () => {
  it("discovers all five real Canvas relationships before traffic", () => {
    const result = discoverWorkflowCalls(
      resolve("../../examples/kortyx-canvas/src/lib/agent.ts"),
      [
        snapshot("general-chat"),
        snapshot("canvas-creation", []),
        snapshot("brief-query", []),
        snapshot("canvas-save", []),
        snapshot("update-canvas", ["findUpdatePaths"]),
      ],
    );
    expect(result.warnings).toEqual([]);
    expect(result.calls.get("general-chat")).toEqual(
      ["brief-query", "canvas-creation", "canvas-save", "update-canvas"].map(
        (targetWorkflowId) => ({ sourceNodeId: "chat", targetWorkflowId }),
      ),
    );
    expect(result.calls.get("update-canvas")).toEqual([
      { sourceNodeId: "findUpdatePaths", targetWorkflowId: "canvas-save" },
    ]);
  });
  it("follows imported custom hooks and parameter bindings without executing code", () => {
    const result = discover(
      `const parent = define({id:"parent",version:"1",nodes:{chat:{run: async () => { recurse(); await useResearch({target: child}); }}},edges:[]});`,
    );
    expect(result.calls.get("parent")).toEqual([
      { sourceNodeId: "chat", targetWorkflowId: "child" },
    ]);
    expect(result.warnings).toEqual([]);
  });
  it("handles bound string IDs, aliases, duplicate calls, and destructured helper parameters", () => {
    const result =
      discover(`const {useWorkflow: call} = createWorkflowHooks({child});
      async function helper({target}: {target:string}) { await call({id:"one",workflow:target,input:{}}); }
      const alias = invoke;
      const parent = define({id:"parent",version:"1",nodes:{chat:{run:async()=>{await helper({target:IDS.child}); await alias({id:"two",workflow:child,input:{}});}}},edges:[]});`);
    expect(result.calls.get("parent")).toEqual([
      { sourceNodeId: "chat", targetWorkflowId: "child" },
    ]);
    expect(result.warnings).toEqual([]);
  });
  it("leaves mutable targets unresolved instead of guessing their initializer", () => {
    const result = discover(`let target=child;
      const parent=define({id:"parent",version:"1",nodes:{chat:{run:async()=>invoke({id:"mutable",workflow:target,input:{}})}},edges:[]});`);
    expect(result.calls.get("parent")).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
  it("warns about dynamic targets and ignores comments and unrelated same-named functions", () => {
    const result = discover(`const fake={useWorkflow: (args:unknown)=>args};
      const parent = define({id:"parent",version:"1",nodes:{chat:{run:async({input})=>{
        // invoke({workflow:child});
        const prompt = 'invoke({workflow:child})';
        fake.useWorkflow({workflow:child});
        await invoke({id:"dynamic",workflow:input.target,input:{}});
      }}},edges:[]});`);
    expect(result.calls.get("parent")).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "unresolved or unregistered child target",
    );
  });
  it("does not attribute calls from another workflow or an uncalled module helper", () => {
    const result =
      discover(`async function unused(){await invoke({id:"unused",workflow:child,input:{}});}
      const unrelated=define({id:"unregistered",version:"1",nodes:{chat:{run:unused}},edges:[]});
      const parent=define({id:"parent",version:"1",nodes:{chat:{run:()=>{
        const notCalled = async () => invoke({id:"unused-local",workflow:child,input:{}});
        return {data:{}};
      }}},edges:[]});`);
    expect(result.calls.get("parent")).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
