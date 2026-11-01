export type Source = "ashby" | "greenhouse";

export interface Company {
  name: string;
  source: Source;
  slug: string;
}

export interface Pay {
  min: number;
  max: number;
  currency: string;
  /** True when the company published a per-year figure. */
  annual: boolean;
}

export interface Job {
  /** `${source}:${slug}:${rawId}` - stable, passed back to get_job. */
  id: string;
  company: string;
  source: Source;
  title: string;
  location: string;
  department: string | null;
  /** The company's own posting page. Every answer links here. */
  url: string;
  publishedAt: string | null;
  updatedAt: string | null;
  remote: boolean | null;
  employmentType: string | null;
  pay: Pay | null;
  /** Pay exactly as the company wrote it. Null whenever `pay` is null. */
  payText: string | null;
  /** Plain-text description. Used for analysis only; never returned in full. */
  description: string | null;
}
