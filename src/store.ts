import type { Company, Job, Source } from "./types.ts";
import { normalizeAshby, normalizeGreenhouse } from "./normalize.ts";
import { SnapshotCache } from "./cache.ts";
import { Limiter } from "./limiter.ts";
import { htmlToText } from "./text.ts";

/** Identify ourselves honestly to the services we read. */
export const USER_AGENT =
  "ai-hiring-radar/0.1 (independent portfolio demo; +https://github.com/vishwaj1/ai-hiring-radar)";

const TTL_MS = 15 * 60_000;
const MAX_STALE_MS = 6 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DETAIL_CACHE_MAX = 200;

export interface LoadResult {
  jobs: Job[];
  requested: number;
  loaded: number;
  failed: { company: string; error: string }[];
  /** Boards that had not answered when the deadline passed. They keep loading, so a repeat call is fuller. */
  pending: string[];
  /** When the oldest board in this result was fetched. Null if none loaded. */
  oldestFetchAt: number | null;
}

export interface StoreOptions {
  companies: Company[];
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Minimum gap between request starts, per source. */
  gapMs?: number;
  now?: () => number;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function boardUrl(c: Company): string {
  const slug = encodeURIComponent(c.slug);
  return c.source === "ashby"
    ? `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`
    : `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`;
}

export function parseJobId(id: string): { source: Source; slug: string; rawId: string } | null {
  const [source, slug, ...rest] = id.split(":");
  const rawId = rest.join(":");
  if ((source !== "ashby" && source !== "greenhouse") || !slug || !rawId) return null;
  return { source, slug, rawId };
}

export function createStore(opts: StoreOptions) {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const gap = opts.gapMs ?? 100;
  const limiters: Record<Source, Limiter> = {
    ashby: new Limiter(6, gap),
    greenhouse: new Limiter(6, gap),
  };
  const boards = new Map<string, SnapshotCache<Job[]>>();
  const details = new Map<string, string>();

  async function getJson(source: Source, url: string): Promise<unknown> {
    return limiters[source].run(async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await fetchFn(url, {
          headers: { accept: "application/json", "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const type = res.headers.get("content-type") ?? "";
        if (!/json/i.test(type)) throw new Error(`Expected JSON but got "${type || "no content-type"}"`);
        return res.json();
      }
    });
  }

  function cacheFor(c: Company): SnapshotCache<Job[]> {
    const key = `${c.source}:${c.slug}`;
    let cache = boards.get(key);
    if (!cache) {
      cache = new SnapshotCache<Job[]>({ ttlMs: TTL_MS, maxStaleMs: MAX_STALE_MS, now });
      boards.set(key, cache);
      const limit = opts.companies.length + 60;
      if (boards.size > limit) {
        const tracked = new Set(opts.companies.map((t) => `${t.source}:${t.slug}`));
        for (const k of boards.keys()) {
          if (!tracked.has(k) && k !== key) { boards.delete(k); break; }
        }
      }
    }
    return cache;
  }

  async function loadBoard(c: Company) {
    return cacheFor(c).get(async () => {
      const json = await getJson(c.source, boardUrl(c));
      if (!isObj(json) || !Array.isArray(json["jobs"])) throw new Error("Unexpected response shape");
      const normalize = c.source === "ashby" ? normalizeAshby : normalizeGreenhouse;
      const jobs: Job[] = [];
      for (const raw of json["jobs"]) {
        const job = normalize(c, raw);
        if (job) jobs.push(job);
      }
      return jobs;
    });
  }

  async function loadJobs(
    companies: Company[] = opts.companies,
    options: { deadlineMs?: number } = {},
  ): Promise<LoadResult> {
    type Outcome = { state: "done"; value: Awaited<ReturnType<typeof loadBoard>> } | { state: "failed"; error: string } | { state: "pending" };
    const outcomes: Outcome[] = companies.map(() => ({ state: "pending" }));
    const loads = companies.map((c, i) =>
      loadBoard(c).then(
        (value) => { outcomes[i] = { state: "done", value }; },
        (err: unknown) => { outcomes[i] = { state: "failed", error: err instanceof Error ? err.message : String(err) }; },
      ),
    );
    const all = Promise.all(loads);
    if (options.deadlineMs === undefined) {
      await all;
    } else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => { timer = setTimeout(resolve, options.deadlineMs); });
      await Promise.race([all, deadline]);
      clearTimeout(timer);
    }
    const jobs: Job[] = [];
    const failed: LoadResult["failed"] = [];
    const pending: string[] = [];
    let oldest: number | null = null;
    outcomes.forEach((o, i) => {
      const name = companies[i]?.name ?? "unknown";
      if (o.state === "done") {
        jobs.push(...o.value.data);
        oldest = oldest === null ? o.value.fetchedAt : Math.min(oldest, o.value.fetchedAt);
      } else if (o.state === "failed") {
        failed.push({ company: name, error: o.error });
      } else {
        pending.push(name);
      }
    });
    return { jobs, requested: companies.length, loaded: companies.length - failed.length - pending.length, failed, pending, oldestFetchAt: oldest };
  }

  /** Read one board that is not in the tracked list. Only the two fixed hosts are ever contacted; the slug is URL-encoded. */
  async function loadAdhoc(slug: string, source: Source | "auto"): Promise<{ company: Company; jobs: Job[]; fetchedAt: number } | null> {
    const order: Source[] = source === "auto" ? ["ashby", "greenhouse"] : [source];
    for (const src of order) {
      const tracked = opts.companies.find((c) => c.source === src && c.slug.toLowerCase() === slug.toLowerCase());
      const company: Company = tracked ?? { name: slug, source: src, slug };
      try {
        const hit = await loadBoard(company);
        return { company, jobs: hit.data, fetchedAt: hit.fetchedAt };
      } catch {
        // try the next source
      }
    }
    return null;
  }

  function companiesMatching(name: string): Company[] {
    const q = name.trim().toLowerCase();
    return opts.companies.filter((c) => c.name.toLowerCase().includes(q));
  }

  async function findJob(id: string): Promise<Job | null> {
    const parsed = parseJobId(id);
    if (!parsed) return null;
    const company = opts.companies.find((c) => c.source === parsed.source && c.slug === parsed.slug);
    if (!company) return null;
    const { data } = await loadBoard(company);
    return data.find((j) => j.id === id) ?? null;
  }

  /** Full description text for one posting. Ashby has it already; Greenhouse needs one extra request. */
  async function getDescription(job: Job): Promise<string | null> {
    if (job.description !== null) return job.description;
    const parsed = parseJobId(job.id);
    if (!parsed || parsed.source !== "greenhouse") return null;
    const cached = details.get(job.id);
    if (cached !== undefined) return cached;
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.slug)}/jobs/${encodeURIComponent(parsed.rawId)}`;
    const json = await getJson("greenhouse", url);
    const content = isObj(json) && typeof json["content"] === "string" ? json["content"] : null;
    if (content === null) return null;
    const text = htmlToText(content);
    if (details.size >= DETAIL_CACHE_MAX) {
      const oldest = details.keys().next().value;
      if (oldest !== undefined) details.delete(oldest);
    }
    details.set(job.id, text);
    return text;
  }

  return { loadJobs, loadAdhoc, companiesMatching, findJob, getDescription, companies: opts.companies };
}

export type Store = ReturnType<typeof createStore>;
