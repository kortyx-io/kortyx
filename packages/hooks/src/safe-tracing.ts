import type {
  ReasonTraceAdapter,
  ReasonTraceAttributes,
  ReasonTraceSpan,
  ReasonTraceSpanEndArgs,
  ReasonTraceSpanStartArgs,
} from "./tracing";

/** Observation callbacks never participate in execution's error path. */
export function safeSpan(span: ReasonTraceSpan | undefined): ReasonTraceSpan {
  const guard =
    <T extends unknown[]>(fn: ((...args: T) => void) | undefined) =>
    (...args: T) => {
      try {
        fn?.(...args);
      } catch {}
    };
  let ended = false;
  const finish =
    <T extends unknown[]>(fn: ((...args: T) => void) | undefined) =>
    (...args: T) => {
      if (ended) return;
      ended = true;
      guard(fn)(...args);
    };
  return {
    addEvent: guard((name: string, attributes?: ReasonTraceAttributes) =>
      span?.addEvent?.(name, attributes),
    ),
    setAttributes: guard((attributes: ReasonTraceAttributes) =>
      span?.setAttributes?.(attributes),
    ),
    end: finish((args?: ReasonTraceSpanEndArgs) => span?.end?.(args)),
    fail: finish((error: unknown, args?: ReasonTraceSpanEndArgs) => {
      if (span?.fail) span.fail(error, args);
      else span?.end?.(args);
    }),
  };
}

export function safeStartSpan(
  adapter: Partial<ReasonTraceAdapter> | undefined,
  args: ReasonTraceSpanStartArgs,
): ReasonTraceSpan {
  try {
    return safeSpan(adapter?.startSpan?.(args));
  } catch {
    return safeSpan(undefined);
  }
}

/** Retains active adapter context, and never retries a callback if observation fails. */
export async function withSafeTraceSpan<T>(
  adapter: Partial<ReasonTraceAdapter> | undefined,
  args: ReasonTraceSpanStartArgs,
  fn: (span: ReasonTraceSpan) => Promise<T>,
): Promise<T> {
  let execution: Promise<T> | undefined;
  const invoke = (span: ReasonTraceSpan) => {
    execution ??= Promise.resolve().then(async () => {
      const observed = safeSpan(span);
      try {
        const result = await fn(observed);
        observed.end?.();
        return result;
      } catch (error) {
        observed.fail?.(error);
        throw error;
      }
    });
    return execution;
  };
  let activeScope: ReasonTraceAdapter["withSpan"];
  try {
    activeScope = adapter?.withSpan?.bind(adapter);
  } catch {}
  if (activeScope) {
    let started: (() => void) | undefined;
    const invoked = new Promise<void>((resolve) => {
      started = resolve;
    });
    const observe = async () => {
      try {
        await activeScope(args, (span) => {
          const result = invoke(span);
          started?.();
          return result;
        });
      } catch {
        /* The execution promise preserves its own failure. */
      }
    };
    const observation = observe();
    // Delivery or adapter work after the callback must not hold up execution.
    if (!execution) await Promise.race([invoked, observation]);
  } else {
    await invoke(safeStartSpan(adapter, args)).catch(() => {});
  }
  return execution ?? invoke(safeSpan(undefined));
}
