"use strict";

// Run with:  cd backend && npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server.js");

const fakeUser = {
  login: "the-amine-mokhtar",
  html_url: "https://github.com/the-amine-mokhtar",
  avatar_url: "https://avatars.githubusercontent.com/u/1",
  followers: 4,
  public_repos: 3,
  email: "should-not-be-forwarded@example.com",
};
const fakeRepos = [
  { name: "active", html_url: "https://github.com/x/active", description: "d", language: "Java", stargazers_count: 2, fork: false, archived: false, updated_at: "2026-09-28T10:00:00Z" },
  { name: "old", html_url: "https://github.com/x/old", description: null, language: null, stargazers_count: 0, fork: false, archived: true, updated_at: "2024-01-01T10:00:00Z" },
];

/** Starts the app on a random port with a fake GitHub API behind it. */
async function startApp(overrides = {}) {
  const calls = [];
  const state = { failing: false };
  const fakeFetch = async (url) => {
    calls.push(String(url));
    if (state.failing) return { ok: false, status: 503, json: async () => ({}) };
    const body = String(url).includes("/repos") ? fakeRepos : fakeUser;
    return { ok: true, status: 200, json: async () => body };
  };
  const server = createApp({ fetch: fakeFetch, ...overrides });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, state, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("health endpoint reports ok", async () => {
  const app = await startApp();
  const res = await fetch(`${app.base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "ok");
  await app.close();
});

test("certificates endpoint returns the three certificates", async () => {
  const app = await startApp();
  const certificates = await (await fetch(`${app.base}/api/certificates`)).json();
  assert.deepEqual(
    certificates.map((cert) => cert.title),
    [
      "AWS Academy Graduate - Cloud Operations - Training Badge",
      "AWS Academy Graduate - Cloud Security Foundations - Training Badge",
      "Building RAG Agents with LLMs",
    ]
  );
  await app.close();
});

test("content endpoint exposes every section, in both languages", async () => {
  const app = await startApp();
  const content = await (await fetch(`${app.base}/api/content`)).json();
  assert.equal(content.projects.length, 4);
  assert.equal(content.skills.length, 6);
  assert.ok(content.profile.tagline.en && content.profile.tagline.fr);
  for (const project of content.projects) {
    assert.ok(project.description.en && project.description.fr, project.id);
  }
  await app.close();
});

test("unknown API routes return a JSON 404 and writes are rejected", async () => {
  const app = await startApp();
  const missing = await fetch(`${app.base}/api/nope`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /application\/json/);
  const post = await fetch(`${app.base}/api/content`, { method: "POST", body: "{}" });
  assert.equal(post.status, 405);
  await app.close();
});

test("CORS only allows configured origins", async () => {
  const app = await startApp({ allowedOrigins: ["https://the-amine-mokhtar.github.io"] });
  const allowed = await fetch(`${app.base}/api/health`, {
    headers: { Origin: "https://the-amine-mokhtar.github.io" },
  });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://the-amine-mokhtar.github.io");
  const denied = await fetch(`${app.base}/api/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const preflight = await fetch(`${app.base}/api/health`, { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  await app.close();
});

test("github endpoint trims fields, hides archived repos and caches", async () => {
  const app = await startApp();
  const first = await (await fetch(`${app.base}/api/github`)).json();
  assert.equal(first.user.login, "the-amine-mokhtar");
  assert.equal(first.user.email, undefined);
  assert.deepEqual(first.repos.map((repo) => repo.name), ["active"]);
  assert.equal(app.calls.length, 2);
  await fetch(`${app.base}/api/github`);
  assert.equal(app.calls.length, 2, "second request must be served from cache");
  await app.close();
});

test("github endpoint serves stale data when GitHub fails, 502 when it has none", async () => {
  const warm = await startApp({ githubCacheSeconds: 0.001 });
  await fetch(`${warm.base}/api/github`);
  warm.state.failing = true;
  await new Promise((resolve) => setTimeout(resolve, 10));
  const stale = await fetch(`${warm.base}/api/github`);
  assert.equal(stale.status, 200);
  assert.equal((await stale.json()).stale, true);
  await warm.close();

  const cold = await startApp();
  cold.state.failing = true;
  assert.equal((await fetch(`${cold.base}/api/github`)).status, 502);
  await cold.close();
});

test("frontend is served, and paths outside it are not", async () => {
  const app = await startApp();
  const index = await fetch(`${app.base}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Amine Mokhtar/);
  const css = await fetch(`${app.base}/css/styles.css`);
  assert.match(css.headers.get("content-type"), /text\/css/);
  for (const attempt of ["/..%2Fbackend%2Fserver.js", "/%2e%2e/backend/server.js", "/../README.md"]) {
    const res = await fetch(`${app.base}${attempt}`);
    assert.equal(res.status, 404, attempt);
  }
  await app.close();
});

test("static serving can be switched off", async () => {
  const app = await startApp({ staticDir: null });
  assert.equal((await fetch(`${app.base}/`)).status, 404);
  assert.equal((await fetch(`${app.base}/api/health`)).status, 200);
  await app.close();
});
