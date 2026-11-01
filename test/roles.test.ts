import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRole, isManagement } from "../src/roles.ts";

// Every title below is a real posting seen in the live feeds on 2026-11-01.
const CASES: [string, "forward_deployed" | "solutions" | "other"][] = [
  ["Forward Deployed Engineer (FDE) - SF", "forward_deployed"],
  ["Forward Deployed Engineer, Infrastructure Specialist (North America)", "forward_deployed"],
  ["Forward Deployed Strategist", "forward_deployed"],
  ["Forward Deployed Finance Engineer, Private Credit", "forward_deployed"],
  ["Software Engineer, Forward Deployed AI Solutions", "forward_deployed"],
  ["Lead Forward Deployed Product Manager", "forward_deployed"],
  ["Agent Deployment Engineer - Spanish Speaking", "forward_deployed"],
  ["AI deployment engineer (West)", "forward_deployed"],
  ["Early Access Deployment Engineer", "forward_deployed"],
  ["Partner AI Deployment Engineer - AWS", "forward_deployed"],
  ["Manager, AI Deployment Engineering (Southeast Asia)", "forward_deployed"],
  ["Field Engineer, Commercial", "forward_deployed"],
  ["Regional Director, Field Engineering, Healthcare", "forward_deployed"],
  ["Solutions Architect - Australia", "solutions"],
  ["Enterprise Solutions Engineer - Mexico", "solutions"],
  ["Senior Director, Solutions Architecture, APAC", "solutions"],
  ["Director of Solutions Engineering - EMEA Enterprise", "solutions"],
  ["Procurement Solutions Architect", "solutions"],
  ["Solutions Engineer, Ads Solutions - San Francisco", "solutions"],
  // The false positives the first keyword scan produced:
  ["Technical Accounting Lead, Ads Revenue", "other"],
  ["Head of Technical Accounting & Reporting", "other"],
  ["Revenue & Technical Accounting Manager", "other"],
  ["Technical Accounting & Financial Reporting Manager", "other"],
  ["Technical Account Executive", "other"],
  ["Legal Engineering Manager (Law Firm, Litigation/Regulatory)", "other"],
  ["Security Engineer, Cloud", "other"],
];

for (const [title, expected] of CASES) {
  test(`classifyRole: ${title}`, () => assert.equal(classifyRole(title), expected));
}

test("isManagement flags managers and directors but not ICs or leads", () => {
  assert.equal(isManagement("Manager, Forward Deployed Engineering- NYC"), true);
  assert.equal(isManagement("Regional Director, Forward Deployed Engineering"), true);
  assert.equal(isManagement("Head of Technical Accounting & Reporting"), true);
  assert.equal(isManagement("Forward Deployed Engineer (FDE) - SF"), false);
  assert.equal(isManagement("Staff Forward Deployed Engineer"), false);
});
