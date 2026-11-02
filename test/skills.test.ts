import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSkills, countSkills } from "../src/skills.ts";
import { scoreMatch } from "../src/match.ts";
import type { Job } from "../src/types.ts";

test("'Go to market' is not the Go language, and JavaScript is not Java", () => {
  assert.equal(extractSkills("Own our Go to Market motion").includes("Go"), false);
  assert.equal(extractSkills("Our go-to-market team").includes("Go"), false);
  assert.equal(extractSkills("We write services in Go and Python").includes("Go"), true);
  assert.equal(extractSkills("Golang experience").includes("Go"), true);
  assert.equal(extractSkills("Strong JavaScript skills").includes("Java"), false);
  assert.equal(extractSkills("Strong Java skills").includes("Java"), true);
});

test("detects the AI-agent vocabulary FDE postings actually use", () => {
  const found = extractSkills(
    "Build agentic workflows with LLMs, RAG and the Model Context Protocol. Strong Python and TypeScript. Customer-facing; SOC 2; some travel.",
  );
  for (const s of ["AI agents", "LLMs", "RAG", "MCP", "Python", "TypeScript", "Customer-facing", "Security / compliance", "Travel"]) {
    assert.ok(found.includes(s), s);
  }
});

test("PostgreSQL does not also count as plain SQL", () => {
  const found = extractSkills("PostgreSQL experience");
  assert.ok(found.includes("PostgreSQL"));
  assert.equal(found.includes("SQL"), false);
});

function job(id: string, description: string | null): Job {
  return {
    id, company: "Acme", source: description === null ? "greenhouse" : "ashby", title: "Forward Deployed Engineer",
    location: "SF", department: null, url: "https://example.com", publishedAt: null, updatedAt: null,
    remote: null, employmentType: null, pay: null, payText: null, description,
  };
}

test("countSkills only counts postings that have a description, and says how many", () => {
  const { counts, sampleSize } = countSkills([
    job("1", "Python and AWS"),
    job("2", "Python and Kubernetes"),
    job("3", null), // Greenhouse: no description available
  ]);
  assert.equal(sampleSize, 2);
  assert.deepEqual(counts[0], { skill: "Python", jobs: 2, share: 1 });
});

test("scoreMatch reports what is covered and what is missing", () => {
  const profile = new Set(["Python", "TypeScript", "MCP", "AWS"]);
  const result = scoreMatch(profile, ["Python", "MCP", "Kubernetes", "Terraform"]);
  assert.deepEqual(result.matched, ["Python", "MCP"]);
  assert.deepEqual(result.missing, ["Kubernetes", "Terraform"]);
  assert.ok(result.score > 0 && result.score < 100);
  assert.equal(scoreMatch(profile, []).score, 0);
});

test("customer-facing work is recognised from how people actually write it", () => {
  for (const text of [
    "Worked directly with customers on onboarding and integrations.",
    "I partner closely with enterprise clients.",
    "collaborating with customers to ship",
    "Customer-facing role",
    "client facing experience",
  ]) {
    assert.ok(extractSkills(text).includes("Customer-facing"), text);
  }
  assert.ok(!extractSkills("Customer support tooling for the data team").includes("Customer-facing"));
});

test("'deployment' alone no longer counts as implementation/onboarding", () => {
  assert.ok(!extractSkills("Forward Deployed Engineer. Own the deployment of our models.").includes("Implementation / onboarding"));
  assert.ok(extractSkills("Lead customer onboarding and implementation.").includes("Implementation / onboarding"));
});
