export interface MatchResult {
  /** 0-100. Blend of how much of the posting's skills you cover and how many you share. */
  score: number;
  matched: string[];
  missing: string[];
  jobSkillCount: number;
}

export function scoreMatch(profile: Set<string>, jobSkills: string[]): MatchResult {
  const matched = jobSkills.filter((s) => profile.has(s));
  const missing = jobSkills.filter((s) => !profile.has(s));
  const coverage = jobSkills.length === 0 ? 0 : matched.length / jobSkills.length;
  const depth = Math.min(matched.length / 8, 1);
  return {
    score: Math.round(100 * (0.6 * coverage + 0.4 * depth)),
    matched,
    missing,
    jobSkillCount: jobSkills.length,
  };
}
