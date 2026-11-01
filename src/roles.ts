export type RoleFamily = "forward_deployed" | "solutions" | "other";

// Titles that merely contain "technical account..." (e.g. Technical Accounting Lead)
// are finance roles, not customer-facing engineering. Found in the first scan.
const EXCLUDE = /\baccounting\b|\baccountant\b|\brecruit/i;

const FORWARD_DEPLOYED = [
  /\bforward[- ]deployed\b/i,
  /\bdeployment (?:engineer|engineering|strategist|lead|manager)/i,
  /\bfield engineer/i,
];

const SOLUTIONS = [
  /\bsolutions? (?:engineer|engineering|architect|architecture|consultant)/i,
  /\bcustomer engineer\b/i,
];

export function classifyRole(title: string): RoleFamily {
  if (EXCLUDE.test(title)) return "other";
  if (FORWARD_DEPLOYED.some((re) => re.test(title))) return "forward_deployed";
  if (SOLUTIONS.some((re) => re.test(title))) return "solutions";
  return "other";
}

export function isManagement(title: string): boolean {
  return /\b(?:manager|director|head of|vp|vice president|chief)\b/i.test(title);
}
