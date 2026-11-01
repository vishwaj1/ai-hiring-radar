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
  /** Keep roles the company marks remote, or whose location text says "remote". */
  remoteOnly?: boolean | undefined;
  /** Keep roles first published within this many days. Roles with no date are dropped when set. */
  postedWithinDays?: number | undefined;
  /** Clock for postedWithinDays; injectable for tests. */
  now?: number | undefined;
}

export function isRemote(job: Job): boolean {
  return job.remote === true || /\bremote\b/i.test(job.location);
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
    if (f.remoteOnly && !isRemote(job)) return false;
    if (f.postedWithinDays !== undefined) {
      const ms = Date.parse(job.publishedAt ?? "");
      const now = f.now ?? Date.now();
      if (Number.isNaN(ms) || now - ms > f.postedWithinDays * 86_400_000) return false;
    }
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

export type SortBy = "newest" | "pay_high" | "company";

function topUsd(job: Job): number {
  const p = job.pay;
  return p && p.annual && p.currency === "USD" ? p.max : -1;
}

/** newest: latest posting first. pay_high: highest published USD top-of-range first, roles without comparable pay last.
 *  company: A to Z, newest first within a company. Ties always break on newest, then id, so order is stable. */
export function sortJobs(jobs: Job[], by: SortBy = "newest"): Job[] {
  const tie = (a: Job, b: Job) => postedMs(b) - postedMs(a) || a.id.localeCompare(b.id);
  const cmp =
    by === "pay_high"
      ? (a: Job, b: Job) => topUsd(b) - topUsd(a) || tie(a, b)
      : by === "company"
        ? (a: Job, b: Job) => a.company.localeCompare(b.company) || tie(a, b)
        : tie;
  return [...jobs].sort(cmp);
}
