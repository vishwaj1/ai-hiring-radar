import { test } from "node:test";
import assert from "node:assert/strict";
import { SnapshotCache } from "../src/cache.ts";
import { Limiter } from "../src/limiter.ts";
import { htmlToText, excerpt } from "../src/text.ts";

test("cache: serves fresh data without reloading", async () => {
  let t = 0;
  let loads = 0;
  const cache = new SnapshotCache<number>({ ttlMs: 100, maxStaleMs: 1000, now: () => t });
  const load = async () => ++loads;
  assert.equal((await cache.get(load)).data, 1);
  t = 50;
  assert.equal((await cache.get(load)).data, 1);
  assert.equal(loads, 1);
});

test("cache: after the TTL it serves the old copy and refreshes in the background", async () => {
  let t = 0;
  let loads = 0;
  const cache = new SnapshotCache<number>({ ttlMs: 100, maxStaleMs: 1000, now: () => t });
  const load = async () => ++loads;
  await cache.get(load);
  t = 200;
  const hit = await cache.get(load);
  assert.equal(hit.data, 1);
  assert.equal(hit.stale, true);
  await new Promise((r) => setTimeout(r, 5));
  t = 210;
  assert.equal((await cache.get(load)).data, 2);
});

test("cache: concurrent callers share one load", async () => {
  let loads = 0;
  const cache = new SnapshotCache<number>({ ttlMs: 100, maxStaleMs: 1000 });
  const load = async () => {
    await new Promise((r) => setTimeout(r, 10));
    return ++loads;
  };
  const results = await Promise.all([cache.get(load), cache.get(load), cache.get(load)]);
  assert.equal(loads, 1);
  assert.ok(results.every((r) => r.data === 1));
});

test("cache: if a refresh fails, the old copy is served instead of an error", async () => {
  let t = 0;
  const cache = new SnapshotCache<string>({ ttlMs: 100, maxStaleMs: 150, now: () => t });
  await cache.get(async () => "good");
  t = 500; // beyond maxStale, so the refresh is awaited
  const hit = await cache.get(async () => {
    throw new Error("HTTP 503");
  });
  assert.equal(hit.data, "good");
  assert.equal(hit.stale, true);
});

test("cache: with nothing cached, a failure surfaces", async () => {
  const cache = new SnapshotCache<string>({ ttlMs: 100, maxStaleMs: 1000 });
  await assert.rejects(() => cache.get(async () => { throw new Error("boom"); }), /boom/);
});

test("limiter: never exceeds the concurrency limit and spaces out starts", async () => {
  const limiter = new Limiter(2, 20);
  let active = 0;
  let peak = 0;
  const starts: number[] = [];
  await Promise.all(
    Array.from({ length: 6 }, () =>
      limiter.run(async () => {
        starts.push(Date.now());
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
      }),
    ),
  );
  assert.ok(peak <= 2, `peak concurrency was ${peak}`);
  const sorted = [...starts].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok((sorted[i] ?? 0) - (sorted[i - 1] ?? 0) >= 15, "starts should be spaced by the minimum gap");
  }
});

test("limiter: a failing task does not leak its slot", async () => {
  const limiter = new Limiter(1, 0);
  await assert.rejects(() => limiter.run(async () => { throw new Error("x"); }));
  assert.equal(await limiter.run(async () => "ok"), "ok");
});

test("htmlToText: handles Greenhouse's escaped HTML", () => {
  const escaped = "&lt;p&gt;Join us &amp;amp; build.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;li&gt;AWS&lt;/li&gt;&lt;/ul&gt;";
  const text = htmlToText(escaped);
  assert.match(text, /Join us & build\./);
  assert.match(text, /- Python/);
  assert.equal(/</.test(text), false);
});

test("htmlToText: plain text passes through", () => {
  assert.equal(htmlToText("WHY HARVEY\n\nAt Harvey, we build."), "WHY HARVEY\n\nAt Harvey, we build.");
});

test("excerpt: short text is untouched; long text is cut cleanly and never returned whole", () => {
  assert.equal(excerpt("Short."), "Short.");
  const long = "First sentence here. ".repeat(100);
  const out = excerpt(long, 100);
  assert.ok(out.length <= 104);
  assert.ok(out.endsWith("..."));
});
