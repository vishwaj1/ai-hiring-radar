import type { Job } from "./types.ts";

export interface CompanyPayRow {
  company: string;
  jobsWithPay: number;
  min: number;
  max: number;
  exampleTitle: string;
  exampleUrl: string;
}

export interface PayReport {
  rows: CompanyPayRow[];
  /** Postings with a USD annual range. */
  comparableJobs: number;
  /** Postings with pay we deliberately did not mix in (other currency or not yearly). */
  excludedJobs: number;
  /** Median of each comparable posting's midpoint. */
  medianMidpoint: number | null;
  /** Companies with matching roles where none published a comparable range. */
  noPayCompanies: { company: string; jobs: number }[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  const lo = sorted[mid - 1];
  if (hi === undefined) return null;
  return sorted.length % 2 === 1 || lo === undefined ? hi : Math.round((lo + hi) / 2);
}

export function buildPayReport(jobs: Job[]): PayReport {
  const byCompany = new Map<string, CompanyPayRow>();
  const midpoints: number[] = [];
  const seenWithComparable = new Set<string>();
  const totals = new Map<string, number>();
  let excluded = 0;

  for (const job of jobs) {
    totals.set(job.company, (totals.get(job.company) ?? 0) + 1);
    const p = job.pay;
    if (!p) continue;
    if (!p.annual || p.currency !== "USD") {
      excluded += 1;
      continue;
    }
    midpoints.push((p.min + p.max) / 2);
    seenWithComparable.add(job.company);
    const row = byCompany.get(job.company);
    if (!row) {
      byCompany.set(job.company, {
        company: job.company,
        jobsWithPay: 1,
        min: p.min,
        max: p.max,
        exampleTitle: job.title,
        exampleUrl: job.url,
      });
    } else {
      row.jobsWithPay += 1;
      if (p.min < row.min) row.min = p.min;
      if (p.max > row.max) {
        row.max = p.max;
        row.exampleTitle = job.title;
        row.exampleUrl = job.url;
      }
    }
  }

  const noPayCompanies = [...totals.entries()]
    .filter(([company]) => !seenWithComparable.has(company))
    .map(([company, count]) => ({ company, jobs: count }))
    .sort((a, b) => b.jobs - a.jobs);

  return {
    rows: [...byCompany.values()].sort((a, b) => b.max - a.max),
    comparableJobs: midpoints.length,
    excludedJobs: excluded,
    medianMidpoint: median(midpoints),
    noPayCompanies,
  };
}
