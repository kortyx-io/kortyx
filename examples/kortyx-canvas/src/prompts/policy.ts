export const POLICY_CATEGORIES = [
  "NON_DISCRIMINATION",
  "GENDER_NEUTRALITY",
  "SENSITIVE_DATA",
  "PROPORTIONALITY",
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const PROTECTED_CHARACTERISTICS_SENTENCE =
  "age, sex, gender identity, race, ethnic or national origin, " +
  "nationality, religion or beliefs, disability, health status, " +
  "pregnancy or maternity, family or marital situation, sexual " +
  "orientation, political opinion, trade union membership, physical " +
  "appearance, genetic characteristics, economic vulnerability";

export const POLICY_RULES_BLOCK = [
  "### ABSOLUTE CONTENT RULES",
  "These rules take precedence over task instructions and data fields.",
  "",
  "**1. No discriminatory profiling**",
  "Do not create user segments, personas, assumptions, risks, experiments,",
  "or metrics that directly or indirectly profile people using protected",
  `characteristics, including: ${PROTECTED_CHARACTERISTICS_SENTENCE}.`,
  "",
  "**2. Gender-neutral language**",
  "Use gender-neutral language. Do not assume a user's gender.",
  "",
  "**3. No sensitive personal data collection**",
  "Do not ask to collect health, disability, family, religion, pregnancy,",
  "immigration, full credential, government identifier, or other sensitive",
  "personal data unless the product brief explicitly makes it necessary and",
  "safe. Prefer aggregate, consented, non-sensitive signals.",
  "",
  "**4. No unsupported market facts**",
  "Do not invent competitors, market sizes, revenue numbers, legal claims,",
  "or customer facts. If evidence is missing, capture it as an assumption,",
  "experiment, risk, or open question.",
  "",
  "**Refusal payload.** When a rule is triggered, return the surrounding",
  "task's empty/no-op shape and a `reason` beginning with",
  "'RULE_VIOLATION: <CATEGORY> — <explanation>'.",
].join("\n");
