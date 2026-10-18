import type { EvalCase, EvalJson, EvalSuite } from "./types";

type DefinedSuite<Params> = Omit<EvalSuite<Params>, "cases"> & {
  cases: readonly (Omit<EvalCase<Params>, "params"> &
    (undefined extends Params
      ? { params?: Exclude<Params, undefined> }
      : { params: Params }))[];
};

/** Author a suite with typed case parameters. Runtime validation belongs to createEvals. */
export function defineSuite<Params = EvalJson | undefined>(
  suite: DefinedSuite<Params>,
): DefinedSuite<Params> {
  return suite;
}
