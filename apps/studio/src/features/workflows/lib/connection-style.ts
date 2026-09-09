/** Keep connection kinds readable independently of metric/error coloring. */
export const CONNECTION_STYLE = {
  call: { color: "#8b5cf6", dashArray: "2 7" },
  handoff: { color: "#0ea5e9", dashArray: "9 7" },
} as const;
