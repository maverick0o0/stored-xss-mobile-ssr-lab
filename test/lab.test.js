import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";

let temporaryDirectory;
let dataFile;
let app;
let ad;

const payload = `</script><script>document.body.dataset.xss='executed';alert('XSS')</script>`;

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const TELEGRAM_UA = "TelegramBot (like TwitterBot)";
const WHATSAPP_UA = "WhatsApp/2.23.20.0";

before(async () => {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "stored-xss-lab-"));
  dataFile = path.join(temporaryDirectory, "ads.json");
  app = createApp({ dataFile, distDirectory: path.resolve("dist") });
  const response = await request(app).post("/api/ads").send({
    title: "آگهی آزمایشی",
    category: "آموزشی",
    description: payload
  });
  assert.equal(response.status, 201);
  ad = response.body;
});

after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

// ─── Input Validation ───

test("rejects incomplete ads", async () => {
  const response = await request(app).post("/api/ads").send({ title: "ناقص" });
  assert.equal(response.status, 400);
});

test("rejects oversized fields", async () => {
  const response = await request(app).post("/api/ads").send({
    title: "a".repeat(121),
    category: "test",
    description: "test"
  });
  assert.equal(response.status, 400);
});

// ─── Persistence ───

test("persists an ad and returns it through the API", async () => {
  const secondApp = createApp({ dataFile, distDirectory: path.resolve("dist") });
  const response = await request(secondApp).get("/api/ads");
  assert.equal(response.status, 200);
  assert.equal(response.body[0].description, payload);
});

// ─── Desktop (Safe) ───

test("desktop user agents receive the safe React shell", async () => {
  const response = await request(app)
    .get(`/ads/${ad.id}`)
    .set("User-Agent", DESKTOP_UA);

  assert.equal(response.status, 200);
  assert.match(response.text, /data-render-mode="spa-shell"/);
  assert.doesNotMatch(response.text, /document\.body\.dataset\.xss/);
});

// ─── Mobile SSR (Vulnerable) ───

test("mobile user agents receive vulnerable SSR with raw description in JSON-LD", async () => {
  const response = await request(app)
    .get(`/ads/${ad.id}`)
    .set("User-Agent", MOBILE_UA);

  assert.equal(response.status, 200);
  assert.match(response.text, /data-render-mode="mobile-ssr"/);
  // The raw </script> breaks out of the JSON-LD block, injected <script> becomes live
  assert.match(response.text, /<script type="application\/ld\+json">.*<\/script><script>document\.body/s);
  // The body (React-rendered) properly escapes the same value
  assert.match(response.text, /&lt;\/script&gt;&lt;script&gt;/);
});

// ─── Crawler SSR (Vulnerable) ───

describe("crawler user agents receive SSR", () => {
  for (const [name, ua] of [
    ["Googlebot", GOOGLEBOT_UA],
    ["TelegramBot", TELEGRAM_UA],
    ["WhatsApp", WHATSAPP_UA],
  ]) {
    test(`${name} receives SSR with raw JSON-LD`, async () => {
      const response = await request(app)
        .get(`/ads/${ad.id}`)
        .set("User-Agent", ua);

      assert.equal(response.status, 200);
      assert.match(response.text, /data-render-mode="mobile-ssr"/);
      assert.match(response.text, /<script type="application\/ld\+json">/);
      assert.match(response.text, /<\/script><script>document\.body/s);
    });
  }
});

// ─── CSP Header ───

test("SSR responses include unsafe-inline CSP", async () => {
  const response = await request(app)
    .get(`/ads/${ad.id}`)
    .set("User-Agent", MOBILE_UA);

  const csp = response.headers["content-security-policy"];
  assert.ok(csp, "CSP header must be present on SSR response");
  assert.match(csp, /'unsafe-inline'/);
});

test("desktop responses do not include the vulnerable CSP", async () => {
  const response = await request(app)
    .get(`/ads/${ad.id}`)
    .set("User-Agent", DESKTOP_UA);

  const csp = response.headers["content-security-policy"];
  assert.equal(csp, undefined, "Desktop responses should not have CSP set by app");
});

// ─── Vary Header (Intentional Defect) ───

test("SSR response does NOT include Vary: User-Agent (intentional defect)", async () => {
  const response = await request(app)
    .get(`/ads/${ad.id}`)
    .set("User-Agent", MOBILE_UA);

  const vary = response.headers["vary"];
  assert.ok(vary, "Vary header should be present");
  assert.doesNotMatch(vary, /User-Agent/i,
    "Vary should NOT mention User-Agent — this is the intentional cache-poisoning defect");
});

// ─── og: Meta Tags ───

test("SSR includes og:title and og:description meta tags", async () => {
  const response = await request(app)
    .get(`/ads/${ad.id}`)
    .set("User-Agent", MOBILE_UA);

  assert.match(response.text, /og:title/);
  assert.match(response.text, /og:description/);
  assert.match(response.text, /twitter:title/);
});

// ─── Health Check ───

test("health endpoint returns ok", async () => {
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});
