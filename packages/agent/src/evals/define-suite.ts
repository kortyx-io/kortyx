import type {
  EvalCase,
  EvalJson,
  EvalJudge,
  EvalJudgeIdentity,
  EvalSuite,
} from "./types";

type DefinedSuite<Params> = Omit<EvalSuite<Params>, "cases" | "judge"> & {
  judge?: EvalJudge;
  cases: readonly (Omit<EvalCase<Params>, "params"> &
    (undefined extends Params
      ? { params?: Exclude<Params, undefined> }
      : { params: Params }))[];
};

const bindings = new WeakMap<object, EvalJudge>();
export function suiteJudge(suite: object): EvalJudge | undefined {
  return bindings.get(suite);
}
export function judgeIdentity(
  judge: EvalJudgeIdentity,
): NonNullable<EvalSuite["judge"]> {
  return {
    id: judge.id,
    version: judge.version,
    ...(judge.location ? { location: judge.location } : {}),
    ...(judge.instructions ? { instructions: judge.instructions } : {}),
    ...(judge.prompt ? { prompt: judge.prompt } : {}),
    ...(judge.promptTemplates
      ? { promptTemplates: judge.promptTemplates }
      : {}),
    ...(judge.model ? { model: judge.model } : {}),
  };
}

/** Author a suite with typed case parameters. Runtime validation belongs to createEvals. */
export function defineSuite<Params = EvalJson | undefined>(
  suite: DefinedSuite<Params>,
): NoInfer<
  Omit<DefinedSuite<Params>, "judge"> & Pick<EvalSuite<Params>, "judge">
> {
  const { judge, ...definition } = suite;
  const normalized = {
    ...definition,
    ...(judge ? { judge: judgeIdentity(judge) } : {}),
  };
  if (judge) bindings.set(normalized, judge);
  return normalized;
}
