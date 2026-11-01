import type { Job } from "./types.ts";

// A curated, transparent keyword list. This is counting, not understanding:
// it finds words, so it cannot tell "required" from "nice to have".
const SKILLS: [string, RegExp][] = [
  ["Python", /\bpython\b/i],
  ["TypeScript", /\btypescript\b/i],
  ["JavaScript", /\bjavascript\b/i],
  ["Go", /\b[Gg]olang\b|\bGo\b(?![- ]to[- ][Mm]arket)/],
  ["Java", /\bjava\b/i],
  ["Rust", /\brust\b/i],
  ["C++", /c\+\+/i],
  ["SQL", /\bsql\b/i],
  ["React", /\breact(?:\.js)?\b/i],
  ["Node.js", /\bnode(?:\.js|js)\b/i],
  ["PostgreSQL", /\bpostgres(?:ql)?\b/i],
  ["Snowflake", /\bsnowflake\b/i],
  ["Salesforce", /\bsalesforce\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["GCP", /\bgcp\b|google cloud/i],
  ["Azure", /\bazure\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Docker", /\bdocker\b/i],
  ["Terraform", /\bterraform\b/i],
  ["Linux", /\blinux\b/i],
  ["CI/CD", /\bci\/cd\b|continuous integration/i],
  ["REST APIs", /\brest(?:ful)?\b(?: apis?)?/i],
  ["GraphQL", /\bgraphql\b/i],
  ["OAuth / SSO", /\boauth\b|\bsso\b|\bsaml\b|\boidc\b/i],
  ["Webhooks", /\bwebhooks?\b/i],
  ["LLMs", /\bllms?\b|large language models?/i],
  ["RAG", /\bRAG\b|retrieval[- ]augmented/],
  ["Prompt engineering", /prompt engineering|prompt design/i],
  ["Fine-tuning", /fine[- ]tun(?:e|ing)/i],
  ["AI agents", /\bagentic\b|\b(?:ai|llm|autonomous) agents?\b/i],
  ["MCP", /\bMCP\b|model context protocol/i],
  ["Evals", /\bevals?\b|\bevaluations?\b/i],
  ["Vector databases", /vector (?:database|db|store|search)|\bembeddings?\b/i],
  ["PyTorch", /\bpytorch\b/i],
  ["Machine learning", /machine learning|\bML\b/],
  ["Data pipelines", /data pipelines?|\betl\b|\belt\b/i],
  ["Observability", /\bobservability\b|\bdatadog\b|\bgrafana\b/i],
  ["Security / compliance", /\bsoc ?2\b|\bhipaa\b|\bgdpr\b|\biso 27001\b/i],
  ["Customer-facing", /customer[- ]facing|client[- ]facing/i],
  ["Enterprise customers", /\benterprise (?:customers?|clients?|sales|deals?|accounts?)\b/i],
  ["Pre-sales / demos", /pre[- ]sales|\bdemos?\b|proof[- ]of[- ]concept|\bpocs?\b/i],
  ["Implementation / onboarding", /\bimplementation\b|\bonboarding\b|\bdeployment\b/i],
  ["Solution architecture", /solutions? architect/i],
  ["Stakeholder communication", /stakeholders?|executive presence/i],
  ["Travel", /\btravel(?:l?ing)?\b/i],
];

export const SKILL_NAMES: string[] = SKILLS.map(([name]) => name);

export function extractSkills(text: string): string[] {
  const found: string[] = [];
  for (const [name, re] of SKILLS) if (re.test(text)) found.push(name);
  return found;
}

const memo = new WeakMap<Job, string[]>();

/** Skills named in a posting's title and description. Memoised per Job object. */
export function skillsForJob(job: Job): string[] {
  const cached = memo.get(job);
  if (cached) return cached;
  const skills = extractSkills(`${job.title}\n${job.description ?? ""}`);
  memo.set(job, skills);
  return skills;
}

export interface SkillCount {
  skill: string;
  jobs: number;
  share: number;
}

export function countSkills(jobs: Job[]): { counts: SkillCount[]; sampleSize: number } {
  const withText = jobs.filter((j) => j.description !== null);
  const tally = new Map<string, number>();
  for (const job of withText) {
    for (const s of skillsForJob(job)) tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  const counts = [...tally.entries()]
    .map(([skill, n]) => ({
      skill,
      jobs: n,
      share: withText.length === 0 ? 0 : Math.round((n / withText.length) * 100) / 100,
    }))
    .sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill));
  return { counts, sampleSize: withText.length };
}
