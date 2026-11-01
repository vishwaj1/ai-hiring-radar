import file from "../data/companies.json" with { type: "json" };
import type { Company } from "./types.ts";

function toCompany(raw: { name: string; source: string; slug: string }): Company {
  if (raw.source !== "ashby" && raw.source !== "greenhouse") {
    throw new Error(`companies.json: "${raw.name}" has unknown source "${raw.source}"`);
  }
  return { name: raw.name, source: raw.source, slug: raw.slug };
}

/** Boards verified live on 2026-11-01. See data/companies.json for how. */
export const COMPANIES: Company[] = file.companies.map(toCompany);
