import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayReport, median } from "../src/pay.ts";
import type { Job } from "../src/types.ts";

function job(company: string, title: string, pay: Job["pay"]): Job {
  return {
    id: `${company}:${title}`, company, source: "ashby", title, location: "SF", department: null,
    url: `https://example.com/${company}/${title}`, publishedAt: null, updatedAt: null, remote: null,
    employmentType: null, pay, payText: pay ? "x" : null, description: null,
  };
}
const usd = (min: number, max: number) => ({ min, max, currency: "USD", annual: true });

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([3]), 3);
  assert.equal(median([1, 9, 5]), 5);
  assert.equal(median([1, 2, 3, 4]), 3);
});

test("groups by company, takes the widest range, and sorts by top of range", () => {
  const report = buildPayReport([
    job("OpenAI", "FDE SF", usd(185000, 300000)),
    job("OpenAI", "FDE NYC Manager", usd(302000, 385000)),
    job("Baseten", "FDE Training", usd(200000, 400000)),
    job("Modal", "FDE ML", usd(180000, 250000)),
  ]);
  assert.deepEqual(report.rows.map((r) => r.company), ["Baseten", "OpenAI", "Modal"]);
  const openai = report.rows.find((r) => r.company === "OpenAI");
  assert.equal(openai?.jobsWithPay, 2);
  assert.equal(openai?.min, 185000);
  assert.equal(openai?.max, 385000);
  assert.equal(openai?.exampleTitle, "FDE NYC Manager");
  assert.equal(report.comparableJobs, 4);
});

test("does not mix currencies or hourly rates into a USD yearly comparison", () => {
  const report = buildPayReport([
    job("Cohere", "FDE Toronto", { min: 175000, max: 385000, currency: "CAD", annual: true }),
    job("Acme", "Contractor", { min: 80, max: 120, currency: "USD", annual: false }),
    job("Ramp", "FDE", usd(168000, 285000)),
  ]);
  assert.equal(report.comparableJobs, 1);
  assert.equal(report.excludedJobs, 2);
  assert.deepEqual(report.rows.map((r) => r.company), ["Ramp"]);
});

test("names companies that have matching roles but publish no comparable pay", () => {
  const report = buildPayReport([
    job("Cursor", "FDE", null),
    job("Cursor", "Field Engineer", null),
    job("Notion", "FDA", null),
    job("Ramp", "FDE", usd(168000, 285000)),
  ]);
  assert.deepEqual(report.noPayCompanies, [
    { company: "Cursor", jobs: 2 },
    { company: "Notion", jobs: 1 },
  ]);
});
