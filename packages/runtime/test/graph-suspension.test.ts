import {
  type BaseCheckpointSaver,
  emptyCheckpoint,
} from "@langchain/langgraph-checkpoint";
import { expect, it, vi } from "vitest";
import {
  acknowledgeResumeDelivery,
  captureGraphSnapshot,
  createResumeDelivery,
  type GraphSnapshotBundle,
  prepareSuspensionSnapshot,
  restoreGraphSnapshot,
  resumeDeliveryInput,
} from "../src/framework/graph-snapshot";

const command = "00000000-0000-0000-0000-000000000000";
const snapshot = (
  writes: GraphSnapshotBundle["pendingWrites"] = [],
  runtime: unknown = {},
): GraphSnapshotBundle => ({
  config: {},
  checkpoint: { ...emptyCheckpoint(), channel_values: { runtime } },
  metadata: { source: "loop", step: 0, parents: {} },
  pendingWrites: writes,
});
const capture = (
  saved: GraphSnapshotBundle,
  options: Parameters<typeof captureGraphSnapshot>[3],
) =>
  captureGraphSnapshot(
    { getTuple: vi.fn(async () => saved) } as unknown as BaseCheckpointSaver,
    "run",
    undefined,
    options,
  );
const occurrence = (nodeId = "node", position = 0) => ({
  meta: { __kortyxInterruptOccurrence: { nodeId, position } },
});

it("addresses a response by occurrence and acknowledgment, independently of response equality", () => {
  const delivery = createResumeDelivery(
    "request",
    "node",
    occurrence("node", 1),
    "same",
  );
  acknowledgeResumeDelivery(undefined, "node", 1);
  acknowledgeResumeDelivery(delivery, "other", 1);
  acknowledgeResumeDelivery(delivery, "node", 0);
  expect(delivery.delivered).toBe(false);
  acknowledgeResumeDelivery(delivery, "node", 1);
  expect(delivery.delivered).toBe(true);
  expect(resumeDeliveryInput(delivery)).toBe("same");
});

it("imports older object and array journals without confusing branch response histories", () => {
  for (const wrap of [false, true]) {
    const journal = { nodes: { node: { responses: ["first", "second"] } } };
    expect(
      createResumeDelivery(
        "id",
        "node",
        {},
        "third",
        snapshot([], { __kortyxParallelGraph: wrap ? [journal] : journal }),
      ).position,
    ).toBe(2);
  }
  expect(() =>
    createResumeDelivery(
      "id",
      "node",
      { meta: { __kortyxInterruptOccurrence: { position: "invalid" } } },
      0,
    ),
  ).toThrow("Invalid interrupt occurrence");
  expect(
    createResumeDelivery("id", "node", {}, 0, snapshot(undefined, null))
      .position,
  ).toBe(0);
  expect(
    createResumeDelivery(
      "id",
      "node",
      {},
      0,
      snapshot([], { __kortyxParallelGraph: { nodes: {} } }),
    ).position,
  ).toBe(0);
});

it("imports a legacy task replay history and targets the supported engine interrupt ID", () => {
  const saved = snapshot([
    [command, "__resume__", "not-a-task-history"],
    ["task", "data", {}],
    ["task", "__resume__", ["first", "second"]],
    ["other", "__resume__", "not-an-array"],
    ["task", "__interrupt__", { id: "engine", value: {} }],
  ]);
  const delivery = createResumeDelivery("id", "node", {}, false, saved);
  expect(delivery.position).toBe(2);
  expect(resumeDeliveryInput(delivery)).toEqual({ engine: false });
  const array = snapshot([
    [
      "task",
      "__interrupt__",
      [{ id: "engine", value: {} }, null, {}, { id: 1 }],
    ],
  ]);
  expect(
    createResumeDelivery("id", "node", {}, null, array).engineInterruptId,
  ).toBe("engine");
});

it("folds command state before the authoritative hook replacement and removes only obsolete command channels", async () => {
  const saved = snapshot(
    [
      [
        command,
        "runtime",
        { flags: { command: true }, __kortyx: { nodeState: { old: true } } },
      ],
      [command, "config", { old: true }],
      [command, "__resume__", "consumed"],
      [command, "data", { keep: true }],
      ["task", "__resume__", ["first"]],
    ],
    { flags: { previous: true } },
  );
  const sealed = await capture(saved, {
    runtimePatch: { __kortyx: { nodeState: { current: true } } },
  });
  expect(sealed?.checkpoint.channel_values.runtime).toEqual({
    flags: { previous: true, command: true },
    __kortyx: { nodeState: { current: true } },
  });
  expect(sealed?.pendingWrites).toEqual([
    [command, "data", { keep: true }],
    ["task", "__resume__", ["first"]],
  ]);
  expect(saved.pendingWrites).toHaveLength(5);
});

it("retains an unconsumed answer in the Kortyx suspension envelope and strips its engine command", async () => {
  const delivery = createResumeDelivery(
    "id",
    "node",
    occurrence(),
    "fresh",
    snapshot([["task", "__interrupt__", { id: "engine", value: {} }]]),
  );
  const saved = snapshot([
    ["engine", "__resume__", ["fresh"]],
    [command, "runtime", null],
  ]);
  const sealed = await capture(saved, { response: delivery });
  expect(sealed?.suspension).toEqual({ version: 1, response: delivery });
  expect(sealed?.pendingWrites).toEqual([]);
  expect(
    (
      await capture(
        {
          ...snapshot(),
          pendingWrites: undefined,
        } as unknown as GraphSnapshotBundle,
        {},
      )
    )?.checkpoint.channel_values.runtime,
  ).toEqual({});
  expect((await capture(snapshot([], undefined), {}))?.suspension).toEqual({
    version: 1,
  });
});

for (const array of [false, true])
  it(`seals an acknowledged answer into lagging task replay history (array=${array})`, async () => {
    const delivery = createResumeDelivery(
      "id",
      "node",
      occurrence("node", 1),
      "second",
    );
    delivery.delivered = true;
    const entry = { value: occurrence("node", 1) };
    const saved = snapshot([
      ["task", "__interrupt__", array ? [entry] : entry],
      ["task", "__resume__", ["first"]],
      ["unrelated", "__resume__", ["other"]],
      [command, "__interrupt__", {}],
    ]);
    const sealed = await capture(saved, { response: delivery });
    expect(
      sealed?.pendingWrites?.find(
        ([task, channel]) => task === "task" && channel === "__resume__",
      )?.[2],
    ).toEqual(["first", "second"]);
    expect(sealed?.suspension).toEqual({ version: 1 });
  });

it("seals the coordinator's addressed answer without treating another activation as its target", async () => {
  const delivery = createResumeDelivery(
    "id",
    "node",
    occurrence("node", 3),
    "fourth",
  );
  delivery.delivered = true;
  const saved = snapshot(
    [["task", "__interrupt__", { value: occurrence("node", 3) }]],
    { __kortyxParallelGraph: { version: 1 } },
  );
  expect(
    (await capture(saved, { response: delivery }))?.pendingWrites,
  ).toContainEqual(["task", "__resume__", ["fourth"]]);
  const other = snapshot([
    ["task", "__interrupt__", { value: occurrence("other", 3) }],
  ]);
  expect((await capture(other, { response: delivery }))?.pendingWrites).toEqual(
    other.pendingWrites,
  );
});

it("does not duplicate an already committed answer or guess a missing replay prefix", async () => {
  const delivery = createResumeDelivery("id", "node", occurrence(), "first");
  delivery.delivered = true;
  const saved = snapshot([
    ["task", "__interrupt__", { value: occurrence() }],
    ["task", "__resume__", ["first"]],
  ]);
  expect((await capture(saved, { response: delivery }))?.pendingWrites).toEqual(
    saved.pendingWrites,
  );
  expect(
    (await capture(snapshot(), { response: delivery }))?.suspension,
  ).toEqual({ version: 1 });
  expect(
    (
      await capture(
        {
          ...snapshot(),
          pendingWrites: undefined,
        } as unknown as GraphSnapshotBundle,
        { response: delivery },
      )
    )?.suspension,
  ).toEqual({ version: 1 });
  const legacy = snapshot(
    [
      ["task", "__interrupt__", {}],
      ["task", "__resume__", "invalid-history"],
    ],
    null,
  );
  expect(
    (await capture(legacy, { response: delivery }))?.pendingWrites,
  ).toContainEqual(["task", "__resume__", ["first"]]);
  const many = snapshot([["task", "__interrupt__", [{}, {}]]]);
  expect((await capture(many, { response: delivery }))?.pendingWrites).toEqual(
    many.pendingWrites,
  );
});

it("rejects ambiguous legacy delivery and unknown suspension versions before restoration", async () => {
  const saved = snapshot([[command, "__resume__", "possibly consumed"]]);
  expect(() => prepareSuspensionSnapshot(saved)).toThrow(
    "ambiguous pending command",
  );
  const legacy = snapshot();
  expect(prepareSuspensionSnapshot(legacy)).toBe(legacy);
  const supported = { ...snapshot(), suspension: { version: 1 as const } };
  expect(prepareSuspensionSnapshot(supported)).toBe(supported);
  const unknown = {
    ...snapshot(),
    suspension: { version: 99 },
  } as unknown as GraphSnapshotBundle;
  expect(() => prepareSuspensionSnapshot(unknown)).toThrow("Unsupported");
  await expect(
    restoreGraphSnapshot({} as BaseCheckpointSaver, unknown, "run"),
  ).rejects.toThrow("Unsupported");
  expect(() =>
    createResumeDelivery(
      "id",
      "node",
      {},
      "answer",
      snapshot([
        ["a", "__resume__", ["a"]],
        ["b", "__resume__", ["b"]],
      ]),
    ),
  ).toThrow("Cannot identify");
  expect(
    createResumeDelivery("id", "node", {}, "answer", {
      ...snapshot(),
      pendingWrites: undefined,
    } as unknown as GraphSnapshotBundle).position,
  ).toBe(0);
  const absentRuntime = snapshot([[command, "runtime", {}]], null);
  expect(
    (await capture(absentRuntime, {}))?.checkpoint.channel_values.runtime,
  ).toEqual({});
});

it("validates saved undelivered responses before restoring them", async () => {
  const good = {
    id: "request",
    nodeId: "node",
    position: 0,
    value: false,
    delivered: false,
  };
  for (const invalid of [
    null,
    "invalid",
    { ...good, id: 1 },
    { ...good, nodeId: 1 },
    { ...good, position: NaN },
    { ...good, position: -1 },
    { ...good, delivered: true },
    { id: "request", nodeId: "node", position: 0, delivered: false },
    { ...good, engineInterruptId: 1 },
  ]) {
    const saved = {
      ...snapshot(),
      suspension: { version: 1, response: invalid },
    } as unknown as GraphSnapshotBundle;
    expect(() => prepareSuspensionSnapshot(saved)).toThrow(
      "Invalid undelivered response",
    );
  }
  for (const response of [good, { ...good, engineInterruptId: "engine" }]) {
    const saved = {
      ...snapshot(),
      suspension: { version: 1, response },
    } as GraphSnapshotBundle;
    expect(prepareSuspensionSnapshot(saved)).toBe(saved);
  }
  for (const target of [
    null,
    "invalid",
    { nodeId: "other", position: 0 },
    { nodeId: "node", position: -1 },
    { nodeId: "node", position: "invalid" },
  ])
    expect(() =>
      createResumeDelivery(
        "id",
        "node",
        { meta: { __kortyxInterruptOccurrence: target } },
        "answer",
      ),
    ).toThrow("Invalid interrupt occurrence");
});
