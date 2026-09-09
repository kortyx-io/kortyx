import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

function discover(
  source: string,
  options: {
    snapshots?: EnsureWorkflowTopologyRequest[];
  } = {},
) {
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
    writeFileSync(join(dir, "targets.ts"), `export const target = "child";`);
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
    return discoverWorkflowCalls(
      join(dir, "entry.ts"),
      options.snapshots ?? [snapshot("parent"), snapshot("child", [])],
    );
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
        snapshot("canvas-help", ["showHelp"]),
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

describe("source discovery edge cases", () => {
  it("resolves namespace exports, indexed constants, spreads and shorthand properties", () => {
    const result = discover(`
      import * as targets from "./targets";
      const workflow = child;
      const shared = {workflow};
      const ids = {target:"child"};
      const hooks = createWorkflowHooks({child});
      function run() {
        hooks.useWorkflow({id:"namespace", workflow:targets.target});
        invoke({id:"indexed", workflow:ids["target"]});
        invoke({...shared, id:"spread"});
        invoke({...{other: true}, workflow:child});
        invoke({workflow:"wrong", ...shared});
        invoke({workflow: (child as unknown)!});
      }
      const parent = define({id:"parent",nodes:{chat:{run}},edges:[]});
    `);
    expect(result.warnings).toEqual([]);
    expect(result.calls.get("parent")).toEqual([
      { sourceNodeId: "chat", targetWorkflowId: "child" },
    ]);
  });

  it("does not guess through unresolved overrides, cycles, missing fields or dynamic indexes", () => {
    const result = discover(`
      declare const unknown: object;
      declare const missing: string;
      const cycle = cycle;
      const ids = {target:"child"};
      const parent=define({id:"parent", nodes:{chat:{run:()=>{
        invoke({workflow:child, ...unknown});
        invoke({workflow:cycle});
        invoke({workflow:ids["absent"]});
        invoke({workflow:ids[missing]});
        invoke({workflow:ids.absent});
        invoke({workflow:{id:"child"}});
        invoke({workflow:define({nodes:{},edges:[]})});
        invoke({get workflow(){return child;}});
        invoke();
      }}},edges:[]});
    `);
    expect(result.calls.get("parent")).toEqual([]);
    expect(result.warnings).toHaveLength(9);
  });

  it("reports missing and duplicate workflow definitions and unavailable node source", () => {
    const result = discover(
      `
      const parent=define({id:"parent",nodes:{chat:{run: unknownFunction}},edges:[]});
      const second=define({id:"child",nodes:{},edges:[]});
    `,
      {
        snapshots: [
          snapshot("parent"),
          snapshot("child", []),
          snapshot("missing", []),
        ],
      },
    );
    expect(result.warnings).toEqual([
      "child: ambiguous workflow source; child-call discovery skipped.",
      "missing: unavailable workflow source; child-call discovery skipped.",
      "parent/chat: node source unavailable; child-call discovery skipped.",
    ]);
  });

  it("bounds deep custom-hook traversal and sorts calls from multiple nodes", () => {
    const chain = Array.from(
      { length: 34 },
      (_, i) =>
        `function deep${i}(){${i === 33 ? "invoke({workflow:child})" : `deep${i + 1}()`};}`,
    ).join("\n");
    const result = discover(
      `
      ${chain}
      const parent=define({id:"parent",nodes:{z:{run:()=>invoke({workflow:child})},a:{run:()=>invoke({workflow:child})},chat:{run:()=>deep0()}},edges:[]});
    `,
      {
        snapshots: [
          snapshot("parent", ["z", "a", "chat"]),
          snapshot("child", []),
        ],
      },
    );
    expect(result.calls.get("parent")).toEqual([
      { sourceNodeId: "a", targetWorkflowId: "child" },
      { sourceNodeId: "z", targetWorkflowId: "child" },
    ]);
    expect(result.warnings).toEqual([
      "parent/chat: custom-hook discovery depth exceeded.",
    ]);
  });

  it("follows methods and function expressions, tolerating omitted or unbound helper arguments", () => {
    const result = discover(`
      const helper=function(args){invoke({workflow:args.target});};
      const obj={method({target: alias, missing}){invoke({workflow:alias});}};
      function unusedDefault(target) { invoke({workflow:target}); }
      const fake={useWorkflow(){}};
      const {useWorkflow: fakeCall}=fake;
      const parent=define({id:"parent",nodes:{chat:{run:function(){
        helper({target:child}); obj.method({target:child}); unusedDefault(); fakeCall();
        const inner=function(){invoke({workflow:child})};
      }}},edges:[]});
    `);
    expect(result.calls.get("parent")).toEqual([
      { sourceNodeId: "chat", targetWorkflowId: "child" },
    ]);
    expect(result.warnings).toHaveLength(1);
  });
});

it("discovers workflows without a tsconfig, and tolerates an unreadable config", () => {
  const dir = mkdtempSync(join(tmpdir(), "kortyx-source-"));
  try {
    const entry = join(dir, "entry.ts");
    writeFileSync(
      entry,
      `import {defineWorkflow} from ${JSON.stringify(resolve("../core/src/index.ts"))};
      import {useWorkflow} from ${JSON.stringify(resolve("../hooks/src/index.ts"))};
      const parent=defineWorkflow({id:"parent",nodes:{chat:{run:()=>useWorkflow({workflow:"parent"})}},edges:[]});`,
    );
    for (const invalidConfig of [false, true]) {
      if (invalidConfig) writeFileSync(join(dir, "tsconfig.json"), "{");
      const result = discoverWorkflowCalls(entry, [snapshot("parent")]);
      expect(result.warnings).toEqual([]);
      expect(result.calls.get("parent")).toEqual([
        { sourceNodeId: "chat", targetWorkflowId: "parent" },
      ]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
