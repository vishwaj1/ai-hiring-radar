import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAshby, normalizeGreenhouse, ashbyPay } from "../src/normalize.ts";
import type { Company } from "../src/types.ts";

const harvey: Company = { name: "Harvey", source: "ashby", slug: "harvey" };
const anthropic: Company = { name: "Anthropic", source: "greenhouse", slug: "anthropic" };

// Trimmed from a real Harvey posting returned by the live Ashby feed.
const ASHBY_RAW = {
  id: "977e6184-2dc4-422b-8ab3-bc26bb73f778",
  title: "Legal Engineering Manager (Law Firm, Litigation/Regulatory)",
  department: "Go to Market",
  team: "Go to Market",
  employmentType: "FullTime",
  location: "San Francisco",
  publishedAt: "2026-09-29T16:53:31.101+00:00",
  isListed: true,
  isRemote: null,
  workplaceType: null,
  jobUrl: "https://jobs.ashbyhq.com/harvey/977e6184-2dc4-422b-8ab3-bc26bb73f778",
  descriptionPlain: "WHY HARVEY\n\nAt Harvey, we are transforming how legal work operates.",
  compensation: {
    compensationTierSummary: "$315K – $385K • Offers Equity",
    summaryComponents: [
      { compensationType: "EquityPercentage", currencyCode: null, interval: "NONE", maxValue: null, minValue: null },
      { compensationType: "Salary", currencyCode: "USD", interval: "1 YEAR", maxValue: 385000, minValue: 315000 },
    ],
  },
};

// Trimmed from a real Anthropic posting returned by the live Greenhouse feed.
const GREENHOUSE_RAW = {
  id: 5456619008,
  title: "3P Revenue Accounting & Reporting",
  location: { name: "San Francisco, CA | Seattle, WA" },
  absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/5456619008",
  updated_at: "2026-10-19T11:17:24-04:00",
  departments: [],
  offices: [],
};

test("ashby: maps a listed job with structured pay", () => {
  const job = normalizeAshby(harvey, ASHBY_RAW);
  assert.ok(job);
  assert.equal(job.id, "ashby:harvey:977e6184-2dc4-422b-8ab3-bc26bb73f778");
  assert.equal(job.company, "Harvey");
  assert.deepEqual(job.pay, { min: 315000, max: 385000, currency: "USD", annual: true });
  assert.equal(job.payText, "$315K – $385K • Offers Equity");
  assert.equal(job.department, "Go to Market");
  assert.match(job.url, /^https:\/\/jobs\.ashbyhq\.com\/harvey\//);
});

test("ashby: unlisted postings are dropped (direct-link only)", () => {
  assert.equal(normalizeAshby(harvey, { ...ASHBY_RAW, isListed: false }), null);
});

test("ashby: a posting without a link is dropped, since every answer must link back", () => {
  assert.equal(normalizeAshby(harvey, { ...ASHBY_RAW, jobUrl: undefined }), null);
});

test("ashby: equity-only compensation is not treated as pay", () => {
  const raw = {
    ...ASHBY_RAW,
    compensation: {
      compensationTierSummary: "Offers Equity",
      summaryComponents: [{ compensationType: "EquityPercentage", currencyCode: null, interval: "NONE", maxValue: null, minValue: null }],
    },
  };
  const job = normalizeAshby(harvey, raw);
  assert.equal(job?.pay, null);
  assert.equal(job?.payText, null);
});

test("ashby: non-yearly pay is flagged so it is never mixed with salaries", () => {
  const { pay } = ashbyPay({
    compensationTierSummary: "$80 - $120 / hr",
    summaryComponents: [{ compensationType: "Salary", currencyCode: "USD", interval: "1 HOUR", minValue: 80, maxValue: 120 }],
  });
  assert.equal(pay?.annual, false);
});

test("ashby: a missing compensation field is fine", () => {
  const job = normalizeAshby(harvey, { ...ASHBY_RAW, compensation: undefined });
  assert.equal(job?.pay, null);
});

test("greenhouse: maps a list item, with no pay and no description", () => {
  const job = normalizeGreenhouse(anthropic, GREENHOUSE_RAW);
  assert.ok(job);
  assert.equal(job.id, "greenhouse:anthropic:5456619008");
  assert.equal(job.location, "San Francisco, CA | Seattle, WA");
  assert.equal(job.updatedAt, "2026-10-19T11:17:24-04:00");
  assert.equal(job.pay, null);
  assert.equal(job.description, null);
  assert.equal(job.department, null);
});

test("garbage input does not throw", () => {
  assert.equal(normalizeAshby(harvey, null), null);
  assert.equal(normalizeAshby(harvey, "x"), null);
  assert.equal(normalizeGreenhouse(anthropic, []), null);
});

test("a research grant posted as a role ($5M) is shown as text but never ranked as a salary", () => {
  const comp = {
    compensationTierSummary: "$5M",
    summaryComponents: [{ compensationType: "Salary", currencyCode: "USD", interval: "1 YEAR", minValue: 5000000, maxValue: 5000000 }],
  };
  const { pay, payText } = ashbyPay(comp);
  assert.equal(pay, null);
  assert.equal(payText, "$5M");
  const real = ashbyPay({ compensationTierSummary: "$380K - $850K", summaryComponents: [{ compensationType: "Salary", currencyCode: "USD", interval: "1 YEAR", minValue: 380000, maxValue: 850000 }] });
  assert.equal(real.pay?.max, 850000, "a genuine high range is kept");
});
