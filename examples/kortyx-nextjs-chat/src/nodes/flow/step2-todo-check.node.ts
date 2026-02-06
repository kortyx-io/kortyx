import { useNodeState, useStructuredData, useWorkflowState } from "kortyx";

type TodoCheck = {
  item: string;
  ok: boolean;
  reason: string;
};

export const step2TodoCheckNode = async ({
  input,
}: {
  input: { rawInput: string; query: string };
}) => {
  const [todos] = useWorkflowState<string[]>("todos", []);
  const [checked, setChecked] = useWorkflowState<TodoCheck[]>("checked", []);

  // Node-local: survives retries/loops of THIS node only.
  const [idx, setIdx] = useNodeState(0);

  const item = String(todos[idx] ?? "").trim();
  const ok = item.length > 0;
  const reason = ok ? "non-empty" : "empty";

  setChecked((prev) => [...prev, { item, ok, reason }]);

  const nextIdx = idx + 1;
  setIdx(nextIdx);

  const done = nextIdx >= todos.length;

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "todo-check",
      query: input.query,
      idx,
      nextIdx,
      total: todos.length,
      done,
      sample: item,
      checked: checked.length + 1,
    },
  });

  return {
    ...(done ? { condition: "done" } : { condition: "more" }),
    data: {
      progress: {
        idx: nextIdx,
        total: todos.length,
      },
    },
  };
};
