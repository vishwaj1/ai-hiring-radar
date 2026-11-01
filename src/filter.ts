import type { Job } from "./types.ts";
import { classifyRole, isManagement } from "./roles.ts";
import { matchesLocation } from "./location.ts";

export type FamilyFilter = "any" | "forward_deployed" | "solutions" | "fde_or_solutions";

export interface Filters {
  query?: string | undefined;
  family?: FamilyFilter | undefined;
  location?: string | undefined;
  company?: string | undefined;
  hasPay?: boolean | undefined;
  /** Keep roles whose published USD annual range tops out at or above this. */
  minSalaryUsd?: number | undefined;
  /** Defaults to true. Set false to drop manager/director/head-of titles. */
  includeManagement?: boolean | undefined;
}

export function familyMatches(title: string, family: FamilyFilter): boolean {
  if (family === "any") return true;
  const role = classifyRole(title);
  if (family === "fde_or_solutions") return role !== "other";
  return role === family;
}

export function filterJobs(jobs: Job[], f: Filters): Job[] {
  const tokens = (f.query ?? "").toLowerCase().split(/\s+/).filter((t) => t !== "");
  const company = f.company?.trim().toLowerCase() ?? "";
  const family = f.family ?? "any";
  return jobs.filter((job) => {
    if (company !== "" && !job.company.toLowerCase().includes(company)) return false;
    if (!familyMatches(job.title, family)) return false;
    if (f.includeManagement === false && isManagement(job.title)) return false;
    if (f.location && !matchesLocation(job.location, f.location)) return false;
    if (f.hasPay && job.pay === null) return false;
    if (f.minSalaryUsd !== undefined) {
      const p = job.pay;
      if (!p || !p.annual || p.currency !== "USD" || p.max < f.minSalaryUsd) return false;
    }
    if (tokens.length > 0) {
      const haystack = `${job.title} ${job.department ?? ""} ${job.company}`.toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

function postedMs(job: Job): number {
  const ms = Date.parse(job.publishedAt ?? job.updatedAt ?? "");
  return Number.isNaN(ms) ? 0 : ms;
}

export function sortNewest(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => postedMs(b) - postedMs(a));
}
