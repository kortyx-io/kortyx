export function judgeInstructionsDescription(historical: boolean) {
  return historical
    ? "Static instructions saved with this execution. Pass criteria and conversation evidence are supplied separately for each grading call."
    : "These instructions guide how the judge applies each step’s pass criteria. The judge can be changed when launching a run.";
}
