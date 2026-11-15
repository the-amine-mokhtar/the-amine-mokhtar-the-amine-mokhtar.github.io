# Architecture

## 1. Requirements

**Functional**

- Reproduce the existing portfolio: fixed navigation, hero, featured projects, live GitHub
  repositories with search, tech stack, contact, EN/FR switch.
- Add a certificates section.
- Be hosted on GitHub by its owner, with a backend included in the project.

**Non-functional**

- Free to host; no server to keep alive for the site to be reachable.
- The site must still work when the backend or the GitHub API is down.
- Editable without touching layout code.
- Low traffic (a personal portfolio): tens to hundreds of visits per day.

**Constraint that shapes everything:** GitHub Pages serves static files only. It cannot run
a backend. So the backend is a separate, optional service, and the frontend must be complete
without it.

## 2. High-level design

```
                        ┌──────────────────────────────────────────┐
  git push ──► GitHub   │ GitHub Actions: test backend → publish   │
               repo     │ frontend/ to GitHub Pages                │
                        └──────────────────┬───────────────────────┘
                                           ▼
  Visitor ──► GitHub Pages (static: HTML, CSS, JS, content.json)
                 │
                 │ static mode (default)             backend mode (optional)
                 ├─► ./data/content.json             ├─► API /api/content
                 └─► api.github.com (from browser)   └─► API /api/github ──► api.github.com
                                                          (10-minute cache)

  Backend: backend/server.js in a Docker container on any Node/Docker host.
  Fallback: if an API call fails, the frontend uses the static-mode path instead.
```

**Components**

| Component | Role | Hosted on |
| --- | --- | --- |
| `frontend/` | Renders the site in the browser from `content.json` | GitHub Pages |
| `frontend/data/content.json` | Single source of truth for projects, skills, certificates | with the frontend; also read by the backend |
| `backend/server.js` | JSON API, GitHub cache, optional static server | Render / any Docker host / localhost |
| `.github/workflows/deploy-pages.yml` | Tests, then publishes | GitHub Actions |

## 3. Details

### Data model

One JSON file with four sections: `profile`, `projects`, `skills`, `certificates`.
Translatable fields are `{ "en": "...", "fr": "..." }` objects; plain strings are shown in
both languages. There is no database: the content changes a few times a year and is edited
by one person, so a version-controlled file gives history, review and rollback for free.

### API

Read-only REST, JSON, `GET`/`HEAD`/`OPTIONS` only. Routes are listed in the README.
Other methods get `405`; unknown routes get a JSON `404`.

### Caching

`/api/github` keeps the last GitHub response in memory for 10 minutes. Concurrent requests
during a refresh share one upstream call. If GitHub fails or rate-limits, the last good copy
is served (marked `"stale": true`); with no copy at all the API returns `502` and the
frontend falls back to calling GitHub directly.

### Error handling

| Failure | What the visitor sees |
| --- | --- |
| Backend down or asleep | Nothing: content and repos load through the static path |
| GitHub API down / rate-limited | "Couldn't load repositories right now" with a link to GitHub; rest of the site unaffected |
| Photos missing from `assets/` | CSS sky background and the GitHub avatar |
| `localStorage` blocked | Language choice is not remembered; everything else works |

### Security

- No secrets in the frontend. The optional `GITHUB_TOKEN` exists only as a backend
  environment variable.
- CORS allow-list (`ALLOWED_ORIGINS`).
- Static file serving resolves paths inside `frontend/` only (path-traversal tests included).
- All content and API data is HTML-escaped before rendering; only `http(s)` and `mailto`
  URLs become links.
- The container runs as the unprivileged `node` user and has a health check.
- No user input is stored and there are no write endpoints, so there is nothing to
  authenticate.

## 4. Scale and reliability

- **Frontend:** served from GitHub's CDN; no capacity planning needed.
- **Backend:** one small instance is far more than enough. Upstream GitHub usage is capped
  at 2 requests per 10 minutes regardless of traffic (unauthenticated limit: 60/hour).
- **Availability:** the backend is not on the critical path. Its uptime does not affect the
  site's uptime.
- **Monitoring:** `/api/health` for the host's health check; GitHub Actions emails on a
  failed deployment.

## 5. Trade-offs

| Decision | Why | Cost |
| --- | --- | --- |
| Plain HTML/CSS/JS instead of React + Vite + Tailwind (what Lovable generated) | No build step, no dependencies to update, publishes as-is to Pages, easy to read end to end | No component framework; a much larger site would want one |
| Backend optional, with automatic fallback | Free static hosting stays the critical path; a sleeping free-tier API can never break the site | Two code paths for loading data |
| Zero-dependency Node backend instead of Spring Boot | Starts instantly on free tiers, tiny image, no supply chain to patch | Routing and static serving are hand-written (covered by tests) |
| Content in a JSON file instead of a database | Versioned, free, no migrations | Editing means a commit, not a form |
| Content rendered by JavaScript | One template for both languages and both data sources | Search engines that do not run JavaScript see only the page title and description |
| Mailto contact instead of a form | Same as the original; no spam handling, no stored personal data | No message history |

## 6. What to revisit as it grows

- **Contact form:** add `POST /api/contact` with rate limiting and a mail provider; this is
  the first feature that genuinely needs the backend.
- **Many more projects or a blog:** move to a static site generator or a framework with
  pre-rendering so content is in the HTML for search engines.
- **Frequent content edits by non-developers:** put a headless CMS or an authenticated admin
  endpoint behind the same `/api/content` contract; the frontend would not change.
- **Always-on API:** move off a sleeping free tier, or run the container on your own
  Kubernetes cluster.
