export function judgeInstructionsDescription(historical: boolean) {
  return historical
    ? "Reusable judge instructions saved with this execution. Each grading call also receives the step’s criterion and selected evidence. Custom templates show where those values are inserted; Assessment details contains the recorded grading request when available."
    : "These reusable instructions guide how the judge applies each step’s criterion to its answer and evidence. A custom template shows the input variables. The judge model can be changed when launching a run.";
}
