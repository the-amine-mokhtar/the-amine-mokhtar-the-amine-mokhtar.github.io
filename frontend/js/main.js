import { STRINGS } from "./i18n.js";
import { icon } from "./icons.js";
import { loadContent, loadGithub } from "./api.js";

const REPOS_PREVIEW_COUNT = 6;
const LANGUAGE_COLORS = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Java: "#b07219",
  PHP: "#4F5D95",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  HTML: "#e34c26",
  CSS: "#563d7c",
  HCL: "#844FBA",
  Dockerfile: "#384d54",
  Shell: "#89e051",
};

const app = document.getElementById("app");

const state = {
  lang: readStoredLang(),
  content: null,
  github: { status: "loading", user: null, repos: [] },
  query: "",
  showAllRepos: false,
  heroImageOk: true,
  avatarSrc: "assets/profile.jpg",
};

/* ---------- helpers ---------- */

function readStoredLang() {
  try {
    return localStorage.getItem("lang") === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

function storeLang(lang) {
  try {
    localStorage.setItem("lang", lang);
  } catch {
    /* storage unavailable (private mode): the choice just isn't remembered */
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

/** Picks the current language from a { en, fr } object; plain strings pass through. */
const pick = (value) =>
  value && typeof value === "object" ? value[state.lang] ?? value.en ?? "" : value ?? "";

const t = () => STRINGS[state.lang];

/** Only http(s) and mailto links from content/API data are rendered as links. */
function safeUrl(url) {
  return /^(https?:\/\/|mailto:)/i.test(url || "") ? url : "";
}

const external = 'target="_blank" rel="noopener noreferrer"';

function sectionHead(eyebrow, titleA, titleB, extra = "", marginClass = "mb-16") {
  return `
    <div class="section-head ${marginClass} reveal">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2 class="section-title">${esc(titleA)} <span class="text-gradient">${esc(titleB)}</span></h2>
      ${extra}
    </div>`;
}

/* ---------- sections ---------- */

function renderNav() {
  const { profile } = state.content;
  const n = t().nav;
  const links = [
    ["#projects", n.projects],
    ["#github", n.github],
    ["#skills", n.skills],
    ["#certificates", n.certificates],
    ["#contact", n.contact],
  ];
  const langButton = (code, label) => `
    <button type="button" data-lang="${code}" aria-label="${label}" aria-pressed="${state.lang === code}"
      class="lang-btn${state.lang === code ? " is-active" : ""}">${code}</button>`;
  return `
    <nav class="nav enter enter-down">
      <div class="nav-inner">
        <a href="#" class="logo">AM<span>.</span></a>
        <div class="nav-links">
          ${links.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join("")}
        </div>
        <div class="nav-actions">
          <div class="lang-toggle">
            ${langButton("en", "English")}${langButton("fr", "Français")}
          </div>
          <a href="${esc(profile.githubUrl)}" ${external} aria-label="GitHub">${icon("github", 18)}</a>
          <a href="${esc(profile.linkedinUrl)}" ${external} aria-label="LinkedIn">${icon("linkedin", 18)}</a>
          <a href="mailto:${esc(profile.email)}" aria-label="Email">${icon("mail", 18)}</a>
        </div>
      </div>
    </nav>`;
}

function renderHero() {
  const { profile } = state.content;
  const h = t().hero;
  return `
    <section class="hero">
      <div class="hero-bg">
        ${state.heroImageOk ? '<img id="hero-image" src="assets/hero-clouds.jpg" alt="" width="1920" height="1080">' : ""}
        <div class="hero-overlay"></div>
      </div>
      <div class="hero-content">
        <div class="hero-avatar enter enter-scale" style="--d:.15s">
          <img id="avatar" src="${esc(state.avatarSrc)}" alt="${esc(profile.firstName)} ${esc(profile.lastName)}" width="160" height="160">
        </div>
        <p class="hero-greeting enter enter-up" style="--d:.2s">${esc(h.greeting)}</p>
        <h1 class="hero-title enter enter-up" style="--d:.3s">${esc(profile.firstName)} <span class="text-gradient">${esc(profile.lastName)}</span></h1>
        <p class="hero-tagline enter enter-up" style="--d:.4s">${esc(pick(profile.tagline))}</p>
        <div class="button-row enter enter-up" style="--d:.5s">
          <a href="#projects" class="btn btn-primary">${esc(h.cta)}</a>
          <a href="${esc(profile.githubUrl)}" ${external} class="btn btn-outline">${icon("github", 16)} GitHub</a>
          <a href="${esc(profile.linkedinUrl)}" ${external} class="btn btn-outline">${icon("linkedin", 16)} LinkedIn</a>
        </div>
        <div class="hero-arrow enter enter-fade" style="--d:1.2s">
          <a href="#projects" aria-label="${esc(h.cta)}">${icon("arrow-down", 24)}</a>
        </div>
      </div>
    </section>`;
}

function renderProjects() {
  const p = t().projects;
  const cards = state.content.projects
    .map((project, index) => {
      const repoUrl = safeUrl(project.repoUrl);
      const status = project.status === "in-progress" ? p.inProgress : p.completed;
      return `
        <article class="card project-card reveal reveal-lg" style="--d:${(index * 0.1).toFixed(1)}s">
          <div class="project-layout">
            <div class="icon-box icon-box-lg">${icon(project.icon, 28)}</div>
            <div class="project-body">
              <div class="project-meta">
                <h3>${esc(pick(project.title))}</h3>
                <span class="pill${project.status === "in-progress" ? " pill-active" : ""}">${esc(status)}</span>
                <span class="period">${esc(pick(project.period))}</span>
              </div>
              <p class="project-description">${esc(pick(project.description))}</p>
              <div class="tags">
                ${project.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}
                ${repoUrl ? `<a href="${esc(repoUrl)}" ${external} class="tag-link">${icon("github", 14)} GitHub</a>` : ""}
              </div>
            </div>
          </div>
        </article>`;
    })
    .join("");
  return `
    <section id="projects" class="section">
      <div class="container">
        ${sectionHead(p.eyebrow, p.titleA, p.titleB)}
        <div class="project-grid">${cards}</div>
      </div>
    </section>`;
}

function renderGithubSection() {
  const g = t().githubSection;
  const { profile } = state.content;
  const tabIcons = ["layout-grid", "book", "folder-kanban", "package", "star"];
  const tabs = g.tabs
    .map((label, index) =>
      index === 1
        ? `<span class="gh-tab is-active">${icon(tabIcons[index], 16)}${esc(label)}<span class="gh-count" id="gh-count">…</span></span>`
        : `<span class="gh-tab">${icon(tabIcons[index], 16)}${esc(label)}</span>`
    )
    .join("");
  return `
    <section id="github" class="section section-tinted">
      <div class="container container-md">
        ${sectionHead(g.eyebrow, g.titleA, g.titleB, `<p class="section-subtitle">${esc(g.subtitle)}</p>`, "mb-12")}
        <div class="gh-panel reveal">
          <div class="gh-tabs">${tabs}</div>
          <div id="gh-profile"></div>
          <div class="gh-toolbar">
            <div class="gh-search">
              ${icon("search", 14)}
              <input id="repo-search" type="search" value="${esc(state.query)}" placeholder="${esc(g.search)}" aria-label="${esc(g.search)}" autocomplete="off">
            </div>
            <span class="gh-filter">${esc(g.typeAll)}</span>
            <span class="gh-filter gh-filter-sm">${esc(g.languageAll)}</span>
          </div>
          <div id="gh-list"></div>
        </div>
        <div class="gh-footer">
          <a href="${esc(profile.githubUrl)}?tab=repositories" ${external}>${icon("book-marked", 15)} ${esc(g.fullList)}</a>
        </div>
      </div>
    </section>`;
}

function formatUpdated(iso) {
  const g = t().githubSection;
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 864e5);
  if (days < 1) return g.today;
  if (days < 30) return g.daysAgo(days);
  return date.toLocaleDateString(g.dateLocale, { month: "short", day: "numeric", year: "numeric" });
}

function filteredRepos() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.github.repos;
  return state.github.repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(query) ||
      (repo.description || "").toLowerCase().includes(query)
  );
}

/** Fills the parts of the GitHub panel that depend on API data. */
function renderGithubData({ animate = false } = {}) {
  const g = t().githubSection;
  const { profile } = state.content;
  const { status, user, repos } = state.github;
  const countEl = document.getElementById("gh-count");
  const profileEl = document.getElementById("gh-profile");
  const listEl = document.getElementById("gh-list");
  if (!countEl || !profileEl || !listEl) return;

  countEl.textContent = user ? user.public_repos : "…";

  if (user) {
    const stars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const profileUrl = safeUrl(user.html_url) || profile.githubUrl;
    profileEl.innerHTML = `
      <a href="${esc(profileUrl)}" ${external} class="gh-profile">
        ${safeUrl(user.avatar_url) ? `<img src="${esc(user.avatar_url)}" alt="${esc(profile.github)}" width="32" height="32">` : ""}
        <p>${esc(profile.github)}</p>
        <div class="gh-profile-stats">
          <span>${icon("users", 13)} ${esc(user.followers)} ${esc(g.followers)}</span>
          <span>${icon("star", 13)} ${stars}</span>
          ${icon("external-link", 14)}
        </div>
      </a>`;
  } else {
    profileEl.innerHTML = "";
  }

  if (status === "error") {
    listEl.innerHTML = `
      <div class="gh-error">
        <p>${esc(g.error)}</p>
        <a href="${esc(profile.githubUrl)}?tab=repositories" ${external} class="gh-error-link">${icon("github", 16)} ${esc(g.view)}</a>
      </div>`;
    return;
  }

  if (status === "loading") {
    listEl.innerHTML = `<div aria-busy="true">${'<div class="gh-skeleton"></div>'.repeat(5)}</div>`;
    return;
  }

  const matches = filteredRepos();
  const visible = state.showAllRepos ? matches : matches.slice(0, REPOS_PREVIEW_COUNT);
  const items = visible
    .map((repo, index) => {
      const color = LANGUAGE_COLORS[repo.language] || "#8b949e";
      return `
        <li class="${animate ? "reveal reveal-fade" : ""}" style="--d:${((index % 6) * 0.05).toFixed(2)}s">
          <a href="${esc(safeUrl(repo.html_url))}" ${external} class="gh-repo">
            <div class="gh-repo-head">
              ${icon("book", 15)}
              <span class="gh-repo-name">${esc(repo.name)}</span>
              <span class="gh-badge">${esc(repo.fork ? g.forked : g.public)}</span>
            </div>
            ${repo.description ? `<p class="gh-repo-description">${esc(repo.description)}</p>` : ""}
            <div class="gh-repo-meta">
              ${repo.language ? `<span class="gh-language"><span class="gh-dot" style="background-color:${color}"></span>${esc(repo.language)}</span>` : ""}
              <span>${icon("star", 12)} ${esc(repo.stargazers_count || 0)}</span>
              <span class="gh-updated">${icon("refresh-cw", 11)} ${esc(g.updated)} ${esc(formatUpdated(repo.updated_at))}</span>
            </div>
          </a>
        </li>`;
    })
    .join("");
  const toggle =
    matches.length > REPOS_PREVIEW_COUNT
      ? `<button type="button" class="gh-toggle" data-action="toggle-repos">${esc(state.showAllRepos ? g.showLess : g.showAll(matches.length))}</button>`
      : "";
  listEl.innerHTML = `<ul class="gh-repos">${items}</ul>${toggle}`;
  if (animate) observeReveals(listEl);
}

function renderSkills() {
  const s = t().skills;
  const cards = state.content.skills
    .map(
      (group, index) => `
        <div class="card skill-card reveal" style="--d:${(index * 0.1).toFixed(1)}s">
          <h3>${esc(pick(group.title))}</h3>
          <div class="tags">${group.items.map((item) => `<span class="chip">${esc(item)}</span>`).join("")}</div>
        </div>`
    )
    .join("");
  return `
    <section id="skills" class="section">
      <div class="container">
        ${sectionHead(s.eyebrow, s.titleA, s.titleB)}
        <div class="card-grid">${cards}</div>
      </div>
    </section>`;
}

function renderCertificates() {
  const c = t().certificates;
  const certificates = state.content.certificates || [];
  if (!certificates.length) return "";
  const cards = certificates
    .map((cert, index) => {
      const url = safeUrl(cert.credentialUrl);
      return `
        <article class="card cert-card reveal" style="--d:${(index * 0.1).toFixed(1)}s">
          <div class="cert-top">
            <div class="icon-box">${icon(cert.icon, 24)}</div>
            <span class="pill">${esc(pick(cert.type))}</span>
          </div>
          <h3>${esc(pick(cert.title))}</h3>
          <p class="cert-issuer">${icon("award", 14)} ${esc(cert.issuer)}${cert.date ? ` · ${esc(pick(cert.date))}` : ""}</p>
          <div class="tags">${(cert.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
          ${url ? `<a href="${esc(url)}" ${external} class="tag-link cert-link">${icon("external-link", 14)} ${esc(c.view)}</a>` : ""}
        </article>`;
    })
    .join("");
  return `
    <div class="line-accent"></div>
    <section id="certificates" class="section">
      <div class="container">
        ${sectionHead(c.eyebrow, c.titleA, c.titleB)}
        <div class="card-grid">${cards}</div>
      </div>
    </section>`;
}

function renderContact() {
  const c = t().contact;
  const { profile } = state.content;
  return `
    <section id="contact" class="section">
      <div class="container container-sm text-center">
        <div class="reveal">
          <p class="eyebrow">${esc(c.eyebrow)}</p>
          <h2 class="section-title mb-6">${esc(c.titleA)} <span class="text-gradient">${esc(c.titleB)}</span></h2>
          <p class="contact-body">${esc(c.body)}</p>
          <div class="button-row">
            <a href="mailto:${esc(profile.email)}" class="btn btn-primary">${icon("mail", 16)} ${esc(c.cta)}</a>
            <a href="${esc(profile.githubUrl)}" ${external} class="btn btn-outline">${icon("github", 16)} GitHub</a>
            <a href="${esc(profile.linkedinUrl)}" ${external} class="btn btn-outline">${icon("linkedin", 16)} LinkedIn</a>
          </div>
        </div>
        <footer class="footer reveal reveal-fade">
          <p>${esc(c.footer(new Date().getFullYear()))}</p>
        </footer>
      </div>
    </section>`;
}

/* ---------- rendering & behaviour ---------- */

let revealObserver = null;

function observeReveals(root) {
  const targets = root.querySelectorAll(".reveal:not(.is-visible)");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -40px 0px" }
    );
  }
  targets.forEach((el) => revealObserver.observe(el));
}

function bindImageFallbacks() {
  const { profile } = state.content;
  const hero = document.getElementById("hero-image");
  if (hero) {
    hero.addEventListener("error", () => {
      // No hero photo in assets/: the CSS sky behind it stays visible.
      state.heroImageOk = false;
      hero.remove();
    });
  }
  const avatar = document.getElementById("avatar");
  const fallback = `https://github.com/${encodeURIComponent(profile.github)}.png?size=320`;
  if (avatar) {
    avatar.addEventListener("error", () => {
      // No profile photo in assets/: use the GitHub avatar instead.
      if (state.avatarSrc === fallback) return;
      state.avatarSrc = fallback;
      avatar.src = fallback;
    });
  }
}

/** Renders the whole page. `animate` is true only for the first paint. */
function render({ animate = false } = {}) {
  document.documentElement.lang = state.lang;
  app.classList.toggle("no-anim", !animate);
  app.innerHTML = `
    <div class="page">
      ${renderNav()}
      ${renderHero()}
      <div class="line-accent"></div>
      ${renderProjects()}
      <div class="line-accent"></div>
      ${renderGithubSection()}
      <div class="line-accent"></div>
      ${renderSkills()}
      ${renderCertificates()}
      <div class="line-accent"></div>
      ${renderContact()}
    </div>`;
  bindImageFallbacks();
  renderGithubData({ animate });
  if (animate) observeReveals(app);
}

app.addEventListener("click", (event) => {
  const langButton = event.target.closest("[data-lang]");
  if (langButton) {
    const lang = langButton.dataset.lang;
    if (lang !== state.lang) {
      state.lang = lang;
      storeLang(lang);
      render();
    }
    return;
  }
  if (event.target.closest('[data-action="toggle-repos"]')) {
    state.showAllRepos = !state.showAllRepos;
    renderGithubData();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id !== "repo-search") return;
  state.query = event.target.value;
  renderGithubData();
});

async function start() {
  try {
    state.content = await loadContent();
  } catch (err) {
    console.error(err);
    app.innerHTML =
      '<p class="fatal">The portfolio content could not be loaded. Please refresh the page.</p>';
    return;
  }
  render({ animate: true });

  try {
    const { user, repos } = await loadGithub(state.content.profile.github);
    state.github = { status: "ready", user, repos };
  } catch (err) {
    console.warn(err);
    state.github = { status: "error", user: null, repos: [] };
  }
  renderGithubData({ animate: true });
}

start();
