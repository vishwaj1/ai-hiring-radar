import type { Job } from "./types.ts";

export interface CompanyHiring {
  company: string;
  roles: number;
  with_pay: number;
  newest: string | null;
  top_locations: string[];
  example_title: string;
  example_url: string;
}

function postedMs(job: Job): number {
  const ms = Date.parse(job.publishedAt ?? job.updatedAt ?? "");
  return Number.isNaN(ms) ? 0 : ms;
}

/** Group already-filtered roles by company, busiest first. Ties break on company name so order is stable. */
export function buildHiringOverview(jobs: Job[]): CompanyHiring[] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = groups.get(job.company);
    if (list) list.push(job);
    else groups.set(job.company, [job]);
  }
  const rows: CompanyHiring[] = [];
  for (const [company, list] of groups) {
    const newestJob = [...list].sort((a, b) => postedMs(b) - postedMs(a) || a.id.localeCompare(b.id))[0] as Job;
    const counts = new Map<string, number>();
    for (const j of list) counts.set(j.location, (counts.get(j.location) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([loc]) => loc);
    const date = newestJob.publishedAt ?? newestJob.updatedAt;
    rows.push({
      company,
      roles: list.length,
      with_pay: list.filter((j) => j.pay !== null).length,
      newest: date ? date.slice(0, 10) : null,
      top_locations: top,
      example_title: newestJob.title,
      example_url: newestJob.url,
    });
  }
  return rows.sort((a, b) => b.roles - a.roles || a.company.localeCompare(b.company));
}
