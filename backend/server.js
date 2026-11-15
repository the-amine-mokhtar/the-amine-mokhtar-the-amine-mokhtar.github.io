"use strict";

/**
 * Portfolio backend — a small JSON API with zero npm dependencies.
 *
 *   GET /api/health        liveness probe
 *   GET /api/content       everything in frontend/data/content.json
 *   GET /api/profile       ┐
 *   GET /api/projects      │ individual slices of the content file
 *   GET /api/skills        │
 *   GET /api/certificates  ┘
 *   GET /api/github        GitHub profile + repositories, cached in memory
 *
 * Anything that is not under /api/ is served from the frontend folder, so the
 * same process (or container) can host the whole site.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const CONTENT_SECTIONS = ["profile", "projects", "skills", "certificates"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function loadConfig(env = process.env) {
  const frontendDir = path.resolve(__dirname, "..", "frontend");
  return {
    port: Number(env.PORT) || 8080,
    // Comma-separated list of origins allowed to call the API, or "*" for any.
    allowedOrigins: (env.ALLOWED_ORIGINS || "*")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    contentFile: env.CONTENT_FILE || path.join(frontendDir, "data", "content.json"),
    // Set SERVE_STATIC=false to run as a pure API.
    staticDir: env.SERVE_STATIC === "false" ? null : env.STATIC_DIR || frontendDir,
    githubUsername: env.GITHUB_USERNAME || "",
    // Optional: raises the GitHub rate limit from 60 to 5,000 requests/hour.
    githubToken: env.GITHUB_TOKEN || "",
    githubCacheSeconds: Number(env.GITHUB_CACHE_SECONDS) || 600,
  };
}

function createApp(overrides = {}) {
  const { fetch: fetchImpl = globalThis.fetch, ...configOverrides } = overrides;
  const config = { ...loadConfig(), ...configOverrides };
  const githubCache = { data: null, fetchedAt: 0, pending: null };

  function readContent() {
    return JSON.parse(fs.readFileSync(config.contentFile, "utf8"));
  }

  function sendJson(res, status, body, extraHeaders = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
      "Cache-Control": "no-store",
      ...extraHeaders,
    });
    res.end(res.req.method === "HEAD" ? undefined : payload);
  }

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (config.allowedOrigins.includes("*")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  async function githubRequest(pathname) {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "amine-portfolio-backend",
    };
    if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
    const response = await fetchImpl(`https://api.github.com${pathname}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`GitHub API responded with ${response.status}`);
    return response.json();
  }

  async function fetchGithub() {
    const username = encodeURIComponent(config.githubUsername || readContent().profile.github);
    const [user, repos] = await Promise.all([
      githubRequest(`/users/${username}`),
      githubRequest(`/users/${username}/repos?sort=updated&per_page=100`),
    ]);
    // Only the fields the frontend actually displays are passed through.
    return {
      user: {
        login: user.login,
        html_url: user.html_url,
        avatar_url: user.avatar_url,
        followers: user.followers,
        public_repos: user.public_repos,
      },
      repos: repos
        .filter((repo) => !repo.archived)
        .map((repo) => ({
          name: repo.name,
          html_url: repo.html_url,
          description: repo.description,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          fork: repo.fork,
          updated_at: repo.updated_at,
        })),
      cachedAt: new Date().toISOString(),
    };
  }

  /** Cached GitHub data. Concurrent callers share one upstream request. */
  async function getGithub() {
    const age = Date.now() - githubCache.fetchedAt;
    if (githubCache.data && age < config.githubCacheSeconds * 1000) return githubCache.data;
    if (!githubCache.pending) {
      githubCache.pending = fetchGithub()
        .then((data) => {
          githubCache.data = data;
          githubCache.fetchedAt = Date.now();
          return data;
        })
        .finally(() => {
          githubCache.pending = null;
        });
    }
    try {
      return await githubCache.pending;
    } catch (error) {
      // GitHub is down or rate-limited: serve the last good copy if there is one.
      if (githubCache.data) return { ...githubCache.data, stale: true };
      throw error;
    }
  }

  async function handleApi(req, res, pathname) {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" }, { Allow: "GET, HEAD, OPTIONS" });
      return;
    }

    const route = pathname.replace(/\/+$/, "");

    if (route === "/api/health") {
      sendJson(res, 200, { status: "ok", uptimeSeconds: Math.round(process.uptime()) });
      return;
    }
    if (route === "/api/content") {
      sendJson(res, 200, readContent());
      return;
    }
    const section = route.slice("/api/".length);
    if (CONTENT_SECTIONS.includes(section)) {
      sendJson(res, 200, readContent()[section] ?? []);
      return;
    }
    if (route === "/api/github") {
      try {
        sendJson(res, 200, await getGithub());
      } catch (error) {
        console.error("GitHub fetch failed:", error.message);
        sendJson(res, 502, { error: "Could not reach the GitHub API" });
      }
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  }

  function handleStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const notFound = () => {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    };
    if (!config.staticDir) return notFound();

    let relative;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      return notFound();
    }
    if (relative.includes("\0")) return notFound();

    const root = path.resolve(config.staticDir);
    let filePath = path.resolve(root, `.${path.sep}${relative}`);
    // Never serve anything outside the frontend folder.
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return notFound();

    fs.stat(filePath, (statError, stats) => {
      if (!statError && stats.isDirectory()) filePath = path.join(filePath, "index.html");
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()];
      if (!type) return notFound();
      fs.readFile(filePath, (readError, data) => {
        if (readError) return notFound();
        res.writeHead(200, {
          "Content-Type": type,
          "Content-Length": data.length,
          "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=3600",
        });
        res.end(req.method === "HEAD" ? undefined : data);
      });
    });
  }

  return http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      handleApi(req, res, pathname).catch((error) => {
        console.error(error);
        if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
        else res.end();
      });
      return;
    }
    handleStatic(req, res, pathname);
  });
}

if (require.main === module) {
  const config = loadConfig();
  const server = createApp();
  server.listen(config.port, () => {
    console.log(`Portfolio backend listening on http://localhost:${config.port}`);
    console.log(`  API:      http://localhost:${config.port}/api/health`);
    if (config.staticDir) console.log(`  Frontend: served from ${config.staticDir}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

module.exports = { createApp, loadConfig };
