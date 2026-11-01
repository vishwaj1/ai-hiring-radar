import type { Company, Job, Pay } from "./types.ts";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Descriptions are used for keyword analysis only; cap them to bound memory. */
const MAX_DESCRIPTION_CHARS = 12_000;

export function ashbyPay(compensation: unknown): {
  pay: Pay | null;
  payText: string | null;
} {
  if (!isObj(compensation)) return { pay: null, payText: null };
  const components = compensation["summaryComponents"];
  if (!Array.isArray(components)) return { pay: null, payText: null };
  for (const c of components) {
    if (!isObj(c) || c["compensationType"] !== "Salary") continue;
    const min = num(c["minValue"]);
    const max = num(c["maxValue"]);
    const currency = str(c["currencyCode"]);
    if (min === null || max === null || currency === null) continue;
    const interval = str(c["interval"]) ?? "";
    return {
      pay: { min, max, currency, annual: /year/i.test(interval) },
      // Only show the company's wording when we also have a real salary range;
      // "Offers Equity" alone is not pay.
      payText: str(compensation["compensationTierSummary"]),
    };
  }
  return { pay: null, payText: null };
}

export function normalizeAshby(company: Company, raw: unknown): Job | null {
  if (!isObj(raw)) return null;
  // Ashby marks some postings as unlisted: reachable by direct link only.
  if (raw["isListed"] === false) return null;
  const id = str(raw["id"]);
  const title = str(raw["title"]);
  const url = str(raw["jobUrl"]);
  if (id === null || title === null || url === null) return null;

  const { pay, payText } = ashbyPay(raw["compensation"]);
  const workplace = str(raw["workplaceType"]);
  const remote =
    typeof raw["isRemote"] === "boolean"
      ? raw["isRemote"]
      : workplace !== null
        ? /remote/i.test(workplace)
        : null;
  const description = str(raw["descriptionPlain"]);

  return {
    id: `ashby:${company.slug}:${id}`,
    company: company.name,
    source: "ashby",
    title,
    location: str(raw["location"]) ?? "Not specified",
    department: str(raw["department"]) ?? str(raw["team"]),
    url,
    publishedAt: str(raw["publishedAt"]),
    updatedAt: null,
    remote,
    employmentType: str(raw["employmentType"]),
    pay,
    payText,
    description: description === null ? null : description.slice(0, MAX_DESCRIPTION_CHARS),
  };
}

export function normalizeGreenhouse(company: Company, raw: unknown): Job | null {
  if (!isObj(raw)) return null;
  const rawId = raw["id"];
  const id =
    typeof rawId === "number" || typeof rawId === "string" ? String(rawId) : null;
  const title = str(raw["title"]);
  const url = str(raw["absolute_url"]);
  if (id === null || title === null || url === null) return null;

  const loc = raw["location"];
  const location = isObj(loc) ? str(loc["name"]) : null;
  const depts = Array.isArray(raw["departments"]) ? raw["departments"] : [];
  const firstDept = depts.find(isObj);

  return {
    id: `greenhouse:${company.slug}:${id}`,
    company: company.name,
    source: "greenhouse",
    title,
    location: location ?? "Not specified",
    department: firstDept ? str(firstDept["name"]) : null,
    url,
    publishedAt: str(raw["first_published"]),
    updatedAt: str(raw["updated_at"]),
    remote: null,
    employmentType: null,
    // Greenhouse's public board API does not expose pay or (in list mode) descriptions.
    pay: null,
    payText: null,
    description: null,
  };
}
