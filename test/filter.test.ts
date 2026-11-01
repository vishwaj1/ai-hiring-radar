import { test } from "node:test";
import assert from "node:assert/strict";
import { filterJobs, sortNewest, sortJobs } from "../src/filter.ts";
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

const NOW = Date.parse("2026-11-01T00:00:00Z");

test("remote_only matches the company flag or the word remote in the location", () => {
  const set = [
    job({ id: "a", remote: true, location: "San Francisco" }),
    job({ id: "b", remote: null, location: "Remote - US" }),
    job({ id: "c", remote: false, location: "New York" }),
    job({ id: "d", remote: null, location: "Remotely, Texas" }),
  ];
  assert.deepEqual(ids(filterJobs(set, { remoteOnly: true })), ["a", "b"]);
});

test("posted_within_days uses the publish date, drops undated roles, and is inclusive at the edge", () => {
  const set = [
    job({ id: "new", publishedAt: "2026-10-30T00:00:00Z" }),
    job({ id: "edge", publishedAt: "2026-10-02T00:00:00Z" }), // exactly 30 days
    job({ id: "old", publishedAt: "2026-09-01T00:00:00Z" }),
    job({ id: "undated", publishedAt: null, updatedAt: "2026-10-31T00:00:00Z" }),
  ];
  assert.deepEqual(ids(filterJobs(set, { postedWithinDays: 30, now: NOW })), ["edge", "new"]);
  assert.equal(filterJobs(set, { now: NOW }).length, 4);
});

test("sortJobs: newest, pay_high and company are stable and put missing pay last", () => {
  const set = [
    job({ id: "1", company: "B", pay: pay(1, 300000), publishedAt: "2026-10-01T00:00:00Z" }),
    job({ id: "2", company: "A", pay: null, publishedAt: "2026-10-03T00:00:00Z" }),
    job({ id: "3", company: "A", pay: pay(1, 500000), publishedAt: "2026-10-02T00:00:00Z" }),
    job({ id: "4", company: "C", pay: { min: 1, max: 900000, currency: "EUR", annual: true }, publishedAt: "2026-10-04T00:00:00Z" }),
  ];
  assert.deepEqual(sortJobs(set, "newest").map((j) => j.id), ["4", "2", "3", "1"]);
  assert.deepEqual(sortJobs(set, "pay_high").map((j) => j.id), ["3", "1", "4", "2"]); // EUR is not comparable, ranks with no-pay by newest
  assert.deepEqual(sortJobs(set, "company").map((j) => j.id), ["2", "3", "1", "4"]);
  assert.deepEqual(sortJobs(set, "pay_high").map((j) => j.id), sortJobs([...set].reverse(), "pay_high").map((j) => j.id));
});
