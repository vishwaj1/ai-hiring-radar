import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHiringOverview } from "../src/overview.ts";
import type { Job } from "../src/types.ts";

function job(over: Partial<Job>): Job {
  return {
    id: "x", company: "Acme", source: "ashby", title: "FDE", location: "New York", department: null,
    url: "https://example.com/x", publishedAt: null, updatedAt: null, remote: null, employmentType: null,
    pay: null, payText: null, description: null, ...over,
  };
}
const pay = { min: 1, max: 2, currency: "USD", annual: true };

test("groups by company, busiest first, with stable tie-breaks", () => {
  const rows = buildHiringOverview([
    job({ id: "1", company: "B" }), job({ id: "2", company: "B" }),
    job({ id: "3", company: "A" }), job({ id: "4", company: "A" }),
    job({ id: "5", company: "C" }),
  ]);
  assert.deepEqual(rows.map((r) => [r.company, r.roles]), [["A", 2], ["B", 2], ["C", 1]]);
});

test("counts pay, picks the newest posting as the example, and lists the top 3 locations", () => {
  const [row] = buildHiringOverview([
    job({ id: "old", title: "Old", url: "https://e/old", publishedAt: "2026-09-01T00:00:00Z", location: "NYC", pay }),
    job({ id: "new", title: "New", url: "https://e/new", publishedAt: "2026-10-30T00:00:00Z", location: "SF" }),
    job({ id: "n2", location: "NYC", updatedAt: "2026-10-01T00:00:00Z" }),
    job({ id: "n3", location: "Seattle" }),
    job({ id: "n4", location: "London" }),
  ]);
  assert.ok(row);
  assert.equal(row.roles, 5);
  assert.equal(row.with_pay, 1);
  assert.equal(row.example_title, "New");
  assert.equal(row.newest, "2026-10-30");
  assert.deepEqual(row.top_locations, ["NYC", "London", "Seattle"]);
});

test("empty input gives no rows; undated roles say so", () => {
  assert.deepEqual(buildHiringOverview([]), []);
  assert.equal(buildHiringOverview([job({})])[0]?.newest, null);
});
