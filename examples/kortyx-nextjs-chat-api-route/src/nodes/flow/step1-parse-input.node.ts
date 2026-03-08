import { useStructuredData, useWorkflowState } from "kortyx";

export const step1ParseInputNode = async ({ input }: { input: string }) => {
  const text = input.trim();
  const query = text.length > 0 ? text : "hello";
  const todos = query
    .split(/\r?\n|,|;/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const [, setTodos] = useWorkflowState<string[]>("todos", []);
  setTodos(todos.length > 0 ? todos : [query]);

  useStructuredData({
    dataType: "hooks",
    data: {
      step: "parse",
      query,
      todos: todos.length > 0 ? todos.length : 1,
    },
  });

  return {
    data: {
      query,
    },
  } satisfies { data: { query: string } };
};
