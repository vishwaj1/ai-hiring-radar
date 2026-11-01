import { test } from "node:test";
import assert from "node:assert/strict";
import { isUS, matchesLocation } from "../src/location.ts";

test("isUS recognises real location strings from the feeds", () => {
  for (const loc of [
    "San Francisco", "San Francisco, CA", "New York, NY (HQ)", "New York City",
    "Seattle", "Washington, DC", "Remote (US)", "United States", "NYC or Palo Alto (in office)",
  ]) assert.equal(isUS(loc), true, loc);
});

test("isUS rejects non-US locations, including look-alike country codes", () => {
  for (const loc of [
    "London", "London, UK", "Toronto", "Tokyo, Japan", "Berlin, DE",
    "Bengaluru", "Paris, France", "Sydney", "Remote", "Americas",
  ]) assert.equal(isUS(loc), false, loc);
});

test("aliases and alternatives", () => {
  assert.equal(matchesLocation("San Francisco, CA", "SF"), true);
  assert.equal(matchesLocation("New York, NY (HQ)", "nyc"), true);
  assert.equal(matchesLocation("Palo Alto", "bay area"), true);
  assert.equal(matchesLocation("London", "sf"), false);
  assert.equal(matchesLocation("London", "sf or london"), true);
  assert.equal(matchesLocation("Anywhere", ""), true);
  assert.equal(matchesLocation("Seattle", "US"), true);
  assert.equal(matchesLocation("Singapore", "apac"), true);
});
