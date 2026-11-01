import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, parseJobId } from "../src/store.ts";
import { COMPANIES } from "../src/companies.ts";
import type { Company } from "../src/types.ts";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const harvey: Company = { name: "Harvey", source: "ashby", slug: "harvey" };
const anthropic: Company = { name: "Anthropic", source: "greenhouse", slug: "anthropic" };
const ghost: Company = { name: "Ghost Co", source: "ashby", slug: "ghost" };

const ASHBY_BODY = {
  apiVersion: "1",
  jobs: [
    { id: "a1", title: "Forward Deployed Engineer", jobUrl: "https://jobs.ashbyhq.com/harvey/a1", location: "New York", isListed: true, descriptionPlain: "Python and AWS" },
    { id: "a2", title: "Secret Role", jobUrl: "https://jobs.ashbyhq.com/harvey/a2", location: "New York", isListed: false },
  ],
};
const GH_BODY = {
  jobs: [{ id: 111, title: "Solutions Engineer", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/111", location: { name: "San Francisco, CA" }, updated_at: "2026-10-19T11:17:24-04:00" }],
  meta: { total: 1 },
};

function fakeFetch(calls: string[]) {
  return async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.ashbyhq.com") && url.includes("/harvey")) return json(ASHBY_BODY);
    if (url.includes("boards-api.greenhouse.io") && url.endsWith("/jobs/111")) {
      return json({ id: 111, content: "&lt;p&gt;Build with Python &amp;amp; AWS.&lt;/p&gt;" });
    }
    if (url.includes("boards-api.greenhouse.io") && url.includes("/anthropic/")) return json(GH_BODY);
    return new Response("not found", { status: 404 });
  };
}

const noSleep = async () => {};

test("loads both sources, drops unlisted postings, and reports a missing board instead of failing", async () => {
  const calls: string[] = [];
  const store = createStore({ companies: [harvey, anthropic, ghost], fetchFn: fakeFetch(calls), sleep: noSleep, gapMs: 0 });
  const result = await store.loadJobs();
  assert.equal(result.requested, 3);
  assert.equal(result.loaded, 2);
  assert.deepEqual(result.jobs.map((j) => j.id).sort(), ["ashby:harvey:a1", "greenhouse:anthropic:111"]);
  assert.deepEqual(result.failed, [{ company: "Ghost Co", error: "HTTP 404" }]);
  assert.ok(result.oldestFetchAt !== null);
});

test("concurrent loads of the same board make one request, and repeat loads are served from cache", async () => {
  const calls: string[] = [];
  const store = createStore({ companies: [harvey], fetchFn: fakeFetch(calls), sleep: noSleep, gapMs: 0 });
  await Promise.all([store.loadJobs(), store.loadJobs(), store.loadJobs()]);
  await store.loadJobs();
  assert.equal(calls.length, 1);
});

test("sends an honest User-Agent and asks for JSON", async () => {
  let headers: unknown;
  const store = createStore({
    companies: [harvey],
    fetchFn: async (_url, init) => { headers = init?.headers; return json(ASHBY_BODY); },
    sleep: noSleep, gapMs: 0,
  });
  await store.loadJobs();
  const h = headers as Record<string, string>;
  assert.match(h["user-agent"] ?? "", /ai-hiring-radar/);
  assert.equal(h["accept"], "application/json");
});

test("retries once on a 503, then succeeds", async () => {
  let n = 0;
  const store = createStore({
    companies: [harvey],
    fetchFn: async () => (++n === 1 ? new Response("busy", { status: 503 }) : json(ASHBY_BODY)),
    sleep: noSleep, gapMs: 0,
  });
  const result = await store.loadJobs();
  assert.equal(n, 2);
  assert.equal(result.loaded, 1);
});

test("gives up after one retry rather than hammering a struggling board", async () => {
  let n = 0;
  const store = createStore({
    companies: [harvey],
    fetchFn: async () => { n++; return new Response("busy", { status: 503 }); },
    sleep: noSleep, gapMs: 0,
  });
  const result = await store.loadJobs();
  assert.equal(n, 2);
  assert.deepEqual(result.failed, [{ company: "Harvey", error: "HTTP 503" }]);
});

test("rejects an HTML response served with a 200 (a known Lever failure mode)", async () => {
  const store = createStore({
    companies: [harvey],
    fetchFn: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    sleep: noSleep, gapMs: 0,
  });
  const result = await store.loadJobs();
  assert.match(result.failed[0]?.error ?? "", /Expected JSON/);
});

test("findJob resolves a stable id; unknown or malformed ids return null", async () => {
  const store = createStore({ companies: [harvey, anthropic], fetchFn: fakeFetch([]), sleep: noSleep, gapMs: 0 });
  assert.equal((await store.findJob("ashby:harvey:a1"))?.title, "Forward Deployed Engineer");
  assert.equal(await store.findJob("ashby:harvey:nope"), null);
  assert.equal(await store.findJob("lever:foo:1"), null);
  assert.equal(await store.findJob("garbage"), null);
});

test("getDescription: Ashby uses the feed copy; Greenhouse fetches one posting and decodes it", async () => {
  const calls: string[] = [];
  const store = createStore({ companies: [harvey, anthropic], fetchFn: fakeFetch(calls), sleep: noSleep, gapMs: 0 });
  const ashbyJob = await store.findJob("ashby:harvey:a1");
  assert.equal(await store.getDescription(ashbyJob!), "Python and AWS");
  const ghJob = await store.findJob("greenhouse:anthropic:111");
  assert.equal(await store.getDescription(ghJob!), "Build with Python & AWS.");
  await store.getDescription(ghJob!);
  assert.equal(calls.filter((u) => u.endsWith("/jobs/111")).length, 1, "detail is cached");
});

test("parseJobId", () => {
  assert.deepEqual(parseJobId("ashby:harvey:977e6184-2dc4"), { source: "ashby", slug: "harvey", rawId: "977e6184-2dc4" });
  assert.equal(parseJobId("ashby:harvey"), null);
});

test("companies.json is well-formed: unique boards, known sources", () => {
  assert.ok(COMPANIES.length >= 60);
  const keys = COMPANIES.map((c) => `${c.source}:${c.slug}`);
  assert.equal(new Set(keys).size, keys.length, "duplicate board");
  assert.ok(!COMPANIES.some((c) => /manufact|mcp-use/i.test(c.name)), "Manufact must not be in the demo data");
});
