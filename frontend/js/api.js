import { CONFIG } from "./config.js";

const apiBase = (CONFIG.apiBase || "").replace(/\/+$/, "");

async function getJson(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Site content: backend first (if enabled), bundled JSON otherwise. */
export async function loadContent() {
  if (CONFIG.useApi) {
    try {
      return await getJson(`${apiBase}/api/content`);
    } catch (err) {
      console.warn("Backend unavailable, using bundled content.", err);
    }
  }
  return getJson("./data/content.json");
}

/** GitHub profile + repositories: backend cache first (if enabled), public GitHub API otherwise. */
export async function loadGithub(username) {
  if (CONFIG.useApi) {
    try {
      return await getJson(`${apiBase}/api/github`);
    } catch (err) {
      console.warn("Backend unavailable, calling the GitHub API directly.", err);
    }
  }
  const user = encodeURIComponent(username);
  const [profile, repos] = await Promise.all([
    getJson(`https://api.github.com/users/${user}`),
    getJson(`https://api.github.com/users/${user}/repos?sort=updated&per_page=100`),
  ]);
  return { user: profile, repos: repos.filter((repo) => !repo.archived) };
}
