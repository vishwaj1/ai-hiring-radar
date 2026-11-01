import { test } from "node:test";
import assert from "node:assert/strict";
import { filterJobs, sortNewest } from "../src/filter.ts";
import type { Job } from "../src/types.ts";

function job(over: Partial<Job>): Job {
  return {
    id: "ashby:x:1", company: "Acme", source: "ashby", title: "Engineer", location: "San Francisco",
    department: null, url: "https://example.com/1", publishedAt: null, updatedAt: null, remote: null,
    employmentType: null, pay: null, payText: null, description: null, ...over,
  };
}
const pay = (min: number, max: number) => ({ min, max, currency: "USD", annual: true });

const JOBS: Job[] = [
  job({ id: "1", company: "OpenAI", title: "Forward Deployed Engineer (FDE) - SF", pay: pay(185000, 300000), publishedAt: "2026-10-26T00:00:00Z" }),
  job({ id: "2", company: "Cursor", title: "Forward Deployed Engineer", location: "London", publishedAt: "2026-10-08T00:00:00Z" }),
  job({ id: "3", company: "Decagon", title: "Senior Solutions Engineer", pay: pay(200000, 280000), publishedAt: "2026-01-16T00:00:00Z" }),
  job({ id: "4", company: "Cursor", title: "Regional Director, Forward Deployed Engineering", publishedAt: "2026-10-28T00:00:00Z" }),
  job({ id: "5", company: "OpenAI", title: "Lead, Technical Accounting (Compute Infrastructure)", pay: pay(216000, 240000) }),
  job({ id: "6", company: "Anthropic", source: "greenhouse", title: "Account Executive", updatedAt: "2026-08-21T00:00:00Z" }),
];
const ids = (jobs: Job[]) => jobs.map((j) => j.id).sort();

test("family filter excludes the accounting false positive", () => {
  assert.deepEqual(ids(filterJobs(JOBS, { family: "forward_deployed" })), ["1", "2", "4"]);
  assert.deepEqual(ids(filterJobs(JOBS, { family: "fde_or_solutions" })), ["1", "2", "3", "4"]);
});

test("management can be excluded", () => {
  assert.deepEqual(ids(filterJobs(JOBS, { family: "forward_deployed", includeManagement: false })), ["1", "2"]);
});

test("location, company and has_pay combine", () => {
  assert.deepEqual(ids(filterJobs(JOBS, { location: "SF" })), ["1", "3", "4", "5", "6"]);
  assert.deepEqual(ids(filterJobs(JOBS, { company: "cursor" })), ["2", "4"]);
  assert.deepEqual(ids(filterJobs(JOBS, { family: "forward_deployed", hasPay: true })), ["1"]);
});

test("min salary compares the top of the published range", () => {
  assert.deepEqual(ids(filterJobs(JOBS, { minSalaryUsd: 250000 })), ["1", "3"]);
  assert.deepEqual(ids(filterJobs(JOBS, { minSalaryUsd: 290000 })), ["1"]);
});

test("query tokens must all match title, department or company", () => {
  assert.deepEqual(ids(filterJobs(JOBS, { query: "openai forward" })), ["1"]);
  assert.deepEqual(ids(filterJobs(JOBS, { query: "kubernetes" })), []);
});

test("sortNewest orders by date and puts undated postings last", () => {
  assert.deepEqual(sortNewest(JOBS).map((j) => j.id), ["4", "1", "2", "6", "3", "5"]);
});
