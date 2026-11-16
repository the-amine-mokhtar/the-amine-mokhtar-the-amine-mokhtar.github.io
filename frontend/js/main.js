import { CONFIG } from "./config.js";
import { STRINGS } from "./i18n.js";
import { icon } from "./icons.js";
import { loadContent, loadGithub } from "./api.js";
import { createTerminal } from "./terminal.js";

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
  theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  form: { name: "", email: "", message: "", status: "idle" }, // idle | sending | success | fallback
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

function store(key, value) {
  try {
    localStorage.setItem(key, value);
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
    ["#terminal", n.terminal],
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
          <button type="button" class="theme-toggle" data-action="toggle-theme"
            aria-label="${esc(state.theme === "dark" ? t().theme.toLight : t().theme.toDark)}">
            ${icon(state.theme === "dark" ? "sun" : "moon", 18)}
          </button>
          <a href="${esc(profile.githubUrl)}" ${external} aria-label="GitHub">${icon("github", 18)}</a>
          <a href="${esc(profile.linkedinUrl)}" ${external} aria-label="LinkedIn">${icon("linkedin", 18)}</a>
          <a href="mailto:${esc(profile.email)}" aria-label="Email">${icon("mail", 18)}</a>
        </div>
      </div>
    </nav>`;
}

// Drifting clouds. "back" clouds pass behind the text, "front" ones glide over it.
// Each entry: vertical position, width, seconds to cross the screen, start offset, opacity.
const CLOUDS = {
  back: [
    { y: "12%", w: "34rem", t: 95, s: 0.1, o: 0.9 },
    { y: "38%", w: "26rem", t: 70, s: 0.55, o: 0.75 },
    { y: "62%", w: "40rem", t: 120, s: 0.35, o: 0.85 },
    { y: "80%", w: "30rem", t: 85, s: 0.8, o: 0.8 },
  ],
  front: [
    { y: "30%", w: "30rem", t: 60, s: 0.25, o: 0.38 },
    { y: "56%", w: "38rem", t: 80, s: 0.7, o: 0.34 },
    { y: "6%", w: "22rem", t: 50, s: 0.9, o: 0.42 },
  ],
};

function renderClouds(layer) {
  const clouds = CLOUDS[layer]
    .map(
      (c) =>
        `<span class="cloud" style="--y:${c.y};--w:${c.w};--t:${c.t}s;--delay:${(-c.t * c.s).toFixed(1)}s;--o:${c.o};--x:${Math.round(c.s * 100)}vw"></span>`
    )
    .join("");
  return `<div class="clouds clouds-${layer}" aria-hidden="true">${clouds}</div>`;
}

// Small clouds that float across the profile photo and clear away when it is
// hovered (or tapped). Each puff: top, left, width, seconds per drift, opacity.
const AVATAR_CLOUDS = `<span class="avatar-clouds" aria-hidden="true">${[
  ["6%", "-34%", "92%", 9, 0.95],
  ["38%", "32%", "104%", 12, 0.9],
  ["62%", "-22%", "84%", 10, 0.85],
]
  .map(
    ([top, left, width, seconds, opacity], i) =>
      `<i class="puff" style="top:${top};left:${left};width:${width};--t:${seconds}s;--o:${opacity};--dir:${i % 2 ? -1 : 1}"></i>`
  )
  .join("")}</span>`;

function renderCvButton() {
  const { profile } = state.content;
  if (!profile.cvUrl) return "";
  return `<a href="${esc(profile.cvUrl)}" download class="btn btn-outline">${icon("download", 16)} ${esc(t().hero.cv)}</a>`;
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
      ${renderClouds("back")}
      <div class="hero-content">
        <div class="hero-avatar enter enter-scale" style="--d:.15s">
          <span class="avatar-ring">
            <img id="avatar" src="${esc(state.avatarSrc)}" alt="${esc(profile.firstName)} ${esc(profile.lastName)}" width="160" height="160">
            ${AVATAR_CLOUDS}
          </span>
        </div>
        <p class="hero-greeting enter enter-fade" style="--d:.2s"><span class="typewriter" style="--chars:${h.greeting.length}">${esc(h.greeting)}</span></p>
        <h1 class="hero-title enter enter-up" style="--d:.3s">${esc(profile.firstName)} <span class="text-gradient shimmer">${esc(profile.lastName)}</span></h1>
        <p class="hero-tagline enter enter-up" style="--d:.4s">${esc(pick(profile.tagline))}</p>
        <div class="button-row enter enter-up" style="--d:.5s">
          <a href="#projects" class="btn btn-primary">${esc(h.cta)}</a>
          <a href="${esc(profile.githubUrl)}" ${external} class="btn btn-outline">${icon("github", 16)} GitHub</a>
          <a href="${esc(profile.linkedinUrl)}" ${external} class="btn btn-outline">${icon("linkedin", 16)} LinkedIn</a>
          ${renderCvButton()}
        </div>
        <div class="hero-arrow enter enter-fade" style="--d:1.2s">
          <a href="#projects" aria-label="${esc(h.cta)}">${icon("arrow-down", 24)}</a>
        </div>
      </div>
      ${renderClouds("front")}
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
                ${project.tags.map((tag, i) => `<span class="tag pop" style="--i:${i}">${esc(tag)}</span>`).join("")}
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
          <div class="tags">${group.items.map((item, i) => `<span class="chip pop" style="--i:${i}">${esc(item)}</span>`).join("")}</div>
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
          <div class="tags">${(cert.tags || []).map((tag, i) => `<span class="tag pop" style="--i:${i}">${esc(tag)}</span>`).join("")}</div>
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

function renderContactForm() {
  const f = t().contact.form;
  const { name, email, message, status } = state.form;
  const sending = status === "sending";
  const statusText = status === "success" ? f.success : status === "fallback" ? f.fallback : "";
  return `
    <form id="contact-form" class="card contact-form" novalidate>
      <div class="form-row">
        <label class="field">
          <span>${esc(f.name)}</span>
          <input name="name" type="text" required maxlength="100" autocomplete="name" value="${esc(name)}" placeholder="${esc(f.namePlaceholder)}">
        </label>
        <label class="field">
          <span>${esc(f.email)}</span>
          <input name="email" type="email" required maxlength="200" autocomplete="email" value="${esc(email)}" placeholder="${esc(f.emailPlaceholder)}">
        </label>
      </div>
      <label class="field">
        <span>${esc(f.message)}</span>
        <textarea name="message" required rows="5" maxlength="4000" placeholder="${esc(f.messagePlaceholder)}">${esc(message)}</textarea>
      </label>
      <!-- Hidden from people; bots that fill it in are ignored. -->
      <input class="form-trap" name="_honey" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="form-footer">
        <button type="submit" class="btn btn-primary"${sending ? " disabled" : ""}>${icon("send", 16)} ${esc(sending ? f.sending : f.send)}</button>
        <p class="form-status${status === "success" ? " is-success" : ""}" role="status" aria-live="polite">${esc(statusText)}</p>
      </div>
      ${CONFIG.contactEndpoint ? `<p class="form-note">${esc(f.note)}</p>` : ""}
    </form>`;
}

/** Re-renders just the form (keeps focus elsewhere on the page untouched). */
function refreshContactForm() {
  const form = document.getElementById("contact-form");
  if (form) form.outerHTML = renderContactForm();
}

async function submitContactForm(form) {
  if (state.form.status === "sending") return;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const name = String(data.get("name")).trim();
  const email = String(data.get("email")).trim();
  const message = String(data.get("message")).trim();
  const f = t().contact.form;

  // A filled trap field means a bot: act as if it worked and send nothing.
  if (data.get("_honey")) {
    state.form = { name: "", email: "", message: "", status: "success" };
    refreshContactForm();
    return;
  }

  state.form = { name, email, message, status: "sending" };
  refreshContactForm();

  let delivered = false;
  if (CONFIG.contactEndpoint) {
    try {
      const res = await fetch(CONFIG.contactEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, message, _subject: f.subject(name), _template: "table", _captcha: "false" }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      delivered = res.ok && String(body.success) !== "false";
    } catch (err) {
      console.warn("Contact form delivery failed.", err);
    }
  }

  if (delivered) {
    state.form = { name: "", email: "", message: "", status: "success" };
  } else {
    // No form service, or it failed: hand the message to the visitor's email app.
    const { profile } = state.content;
    const body = `${message}\n\n${name}\n${email}`;
    window.location.href = `mailto:${profile.email}?subject=${encodeURIComponent(f.subject(name))}&body=${encodeURIComponent(body)}`;
    state.form = { name, email, message, status: "fallback" };
  }
  refreshContactForm();
}

function setLang(lang) {
  if (lang !== "en" && lang !== "fr") return;
  if (lang === state.lang) return;
  state.lang = lang;
  store("lang", lang);
  render();
}

function renderTerminalSection() {
  const s = t().terminal;
  return `
    <section id="terminal" class="section">
      <div class="container container-md">
        ${sectionHead(s.eyebrow, s.titleA, s.titleB, `<p class="section-subtitle">${esc(s.subtitle)}</p>`, "mb-12")}
        <div class="reveal" id="terminal-mount"></div>
      </div>
    </section>`;
}

// The terminal is created once and re-attached after every render, so its
// history and the state of the simulated cluster survive a language switch.
let terminal = null;

function mountTerminal() {
  const mount = document.getElementById("terminal-mount");
  if (!mount) return;
  if (!terminal) terminal = createTerminal({ content: state.content, setTheme, setLang });
  mount.replaceChildren(terminal.element);
  terminal.scrollToEnd();
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

function setTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  store("theme", state.theme);
  const button = app.querySelector(".theme-toggle");
  if (!button) return;
  button.innerHTML = icon(state.theme === "dark" ? "sun" : "moon", 18);
  button.setAttribute("aria-label", state.theme === "dark" ? t().theme.toLight : t().theme.toDark);
  button.classList.remove("is-spinning");
  void button.offsetWidth; // restart the icon animation
  button.classList.add("is-spinning");
}

/** Cookie-free visitor counting, only when a GoatCounter code is configured. */
function loadAnalytics() {
  const code = (CONFIG.goatcounterCode || "").trim();
  if (!/^[a-z0-9-]+$/i.test(code)) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(script);
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
          ${renderContactForm()}
          <div class="button-row">
            <a href="mailto:${esc(profile.email)}" class="btn btn-primary">${icon("mail", 16)} ${esc(c.cta)}</a>
            <a href="${esc(profile.githubUrl)}" ${external} class="btn btn-outline">${icon("github", 16)} GitHub</a>
            <a href="${esc(profile.linkedinUrl)}" ${external} class="btn btn-outline">${icon("linkedin", 16)} LinkedIn</a>
            ${renderCvButton()}
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
  app.classList.toggle("swap", !animate);
  app.innerHTML = `
    <div class="page">
      <div class="scroll-progress" aria-hidden="true"></div>
      ${renderNav()}
      ${renderHero()}
      <div class="line-accent"></div>
      ${renderProjects()}
      <div class="line-accent"></div>
      ${renderTerminalSection()}
      <div class="line-accent"></div>
      ${renderGithubSection()}
      <div class="line-accent"></div>
      ${renderSkills()}
      ${renderCertificates()}
      <div class="line-accent"></div>
      ${renderContact()}
    </div>`;
  bindImageFallbacks();
  mountTerminal();
  renderGithubData({ animate });
  if (animate) observeReveals(app);
  setupScrollSpy();
  updateScrollEffects();
}

/* ---------- motion helpers ---------- */

let spyObserver = null;

/** Highlights the nav link of the section currently in the middle of the screen. */
function setupScrollSpy() {
  if (spyObserver) spyObserver.disconnect();
  if (!("IntersectionObserver" in window)) return;
  const links = new Map(
    [...app.querySelectorAll(".nav-links a")].map((link) => [link.getAttribute("href").slice(1), link])
  );
  spyObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((link, id) => link.classList.toggle("is-active", id === entry.target.id));
      }
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  app.querySelectorAll("section[id]").forEach((section) => spyObserver.observe(section));
}

let scrollQueued = false;

/** Reading-progress bar and the nav shadow that appears once the page is scrolled. */
function updateScrollEffects() {
  scrollQueued = false;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
  document.documentElement.style.setProperty("--progress", progress.toFixed(4));
  app.querySelector(".nav")?.classList.toggle("is-scrolled", window.scrollY > 8);
  // Still on the hero: no section is "current" yet.
  if (window.scrollY < window.innerHeight * 0.4) {
    app.querySelectorAll(".nav-links a.is-active").forEach((link) => link.classList.remove("is-active"));
  }
}

window.addEventListener(
  "scroll",
  () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateScrollEffects);
  },
  { passive: true }
);
window.addEventListener("resize", updateScrollEffects, { passive: true });

// Cards get a soft highlight that follows the pointer.
app.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType === "touch") return;
    const card = event.target.closest(".card");
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  },
  { passive: true }
);

// Once a reveal animation has finished, drop it so hover transitions run cleanly.
app.addEventListener("animationend", (event) => {
  const el = event.target;
  if (el.classList.contains("reveal") && el.classList.contains("is-visible")) el.classList.add("is-done");
});

app.addEventListener("click", (event) => {
  const langButton = event.target.closest("[data-lang]");
  if (langButton) {
    const lang = langButton.dataset.lang;
    setLang(lang);
    return;
  }
  if (event.target.closest('[data-action="toggle-repos"]')) {
    state.showAllRepos = !state.showAllRepos;
    renderGithubData();
    return;
  }
  if (event.target.closest('[data-action="toggle-theme"]')) {
    toggleTheme();
    return;
  }
  // Touch screens have no hover: a tap on the photo clears (or brings back) its clouds.
  const avatarRing = event.target.closest(".avatar-ring");
  if (avatarRing) avatarRing.classList.toggle("is-clear");
});

app.addEventListener("submit", (event) => {
  if (event.target.id !== "contact-form") return;
  event.preventDefault();
  submitContactForm(event.target);
});

app.addEventListener("input", (event) => {
  const field = event.target;
  // Keep what the visitor typed, so a language switch doesn't wipe the form.
  if (field.form?.id === "contact-form" && field.name in state.form) {
    state.form[field.name] = field.value;
    if (state.form.status !== "sending") state.form.status = "idle";
    return;
  }
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
  loadAnalytics();

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
