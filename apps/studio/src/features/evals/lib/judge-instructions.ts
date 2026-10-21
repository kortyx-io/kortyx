export function judgeInstructionsDescription(historical: boolean) {
  return historical
    ? "Saved instructions for assessing each step’s criterion against selected evidence. Assessment details → Grading request shows the recorded messages when available."
    : "Reusable instructions for assessing each step’s criterion against selected evidence. Highlighted variables are filled for each grading call. The judge model can be changed when launching a run.";
}
