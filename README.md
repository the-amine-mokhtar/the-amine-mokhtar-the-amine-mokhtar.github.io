# Amine Mokhtar — Portfolio

Personal portfolio: hero, featured projects, live GitHub repositories, tech stack,
**certificates**, and contact — in English and French.

- **Frontend** (`frontend/`): plain HTML, CSS and JavaScript. No build step, no dependencies.
  Hosted on **GitHub Pages**.
- **Backend** (`backend/`): a small Node.js JSON API with no npm dependencies. **Optional** —
  the site works fully without it. Hosted anywhere that runs Node or Docker.

Design decisions and trade-offs are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
.
├── frontend/                  the website (this folder is what GitHub Pages publishes)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/main.js             renders every section, language switch, repo search
│   ├── js/i18n.js             interface text, EN + FR
│   ├── js/api.js              loads content and GitHub data (backend or static)
│   ├── js/config.js           switch between static mode and backend mode
│   ├── js/icons.js
│   ├── data/content.json      ← edit projects, skills and certificates here
│   └── assets/                photos and the downloadable CV (cv-amine-mokhtar.pdf)
├── backend/
│   ├── server.js              the API (also serves the frontend for local use)
│   ├── test/api.test.js
│   ├── Dockerfile
│   └── .env.example
├── cv/cv_amine_mokhtar.tex    LaTeX source of the CV
├── scripts/fetch-assets.mjs   copies your two photos from the Lovable site
├── .github/workflows/deploy-pages.yml
├── docker-compose.yml
└── render.yaml
```

## 1. Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer. Nothing to install after that.

```bash
node backend/server.js
```

Open <http://localhost:8080>. The same process serves the site and the API
(try <http://localhost:8080/api/certificates>).

Opening `index.html` by double-clicking will not work: browsers block JavaScript modules
on `file://` pages, so always go through the local server.

With Docker instead: `docker compose up --build`, then open the same address.

## 2. Photos

`frontend/assets/profile.jpg` is the hero portrait. Replace the file to change it.

`frontend/assets/hero-clouds.jpg` is the cloud background. If it is missing, the deployment
workflow copies it from the old Lovable site on the first run and commits it to the
repository. To do the same locally: `node scripts/fetch-assets.mjs`. If the file cannot be
found anywhere, the site shows a soft CSS sky instead, so nothing looks broken.

## 3. Publish on GitHub Pages

1. **Create the repository** on <https://github.com/new>.
   - Name it `the-amine-mokhtar.github.io` to get the address
     `https://the-amine-mokhtar.github.io/`.
   - Any other name (for example `portfolio`) gives
     `https://the-amine-mokhtar.github.io/portfolio/`.
   - Keep it **Public** and do not add a README or .gitignore (this project has them).

2. **Push the project** from this folder:

   ```bash
   git init
   git add .
   git commit -m "Portfolio: frontend, backend and Pages deployment"
   git branch -M main
   git remote add origin https://github.com/the-amine-mokhtar/the-amine-mokhtar.github.io.git
   git push -u origin main
   ```

3. **Turn on Pages**: in the repository, open **Settings → Pages** and under
   **Build and deployment → Source** choose **GitHub Actions**.

4. **Deploy**: open the **Actions** tab. The "Deploy to GitHub Pages" workflow runs on every
   push to `main`. If the first run happened before step 3, open it and click
   **Re-run all jobs**. When it turns green, the site address is shown on the run page.

From then on, every `git push` to `main` runs the backend tests and republishes the site.

### Custom domain (optional)

In **Settings → Pages → Custom domain**, enter your domain and add the DNS records GitHub
shows you. Tick **Enforce HTTPS** once the certificate is ready.

## 4. Deploy the backend (optional)

GitHub Pages only serves static files, so the API has to live somewhere else. Any host that
runs a Docker image or `node backend/server.js` works. Example with Render's free tier
(sleeps after 15 minutes without traffic and takes about a minute to wake up):

1. On <https://render.com>, choose **New → Blueprint** and select this repository.
   `render.yaml` describes the service. (Manual alternative: **New → Web Service**,
   runtime **Docker**, Dockerfile path `./backend/Dockerfile`, Docker context `.`,
   health check path `/api/health`.)
2. Set the environment variables listed in `backend/.env.example`. The important one is
   `ALLOWED_ORIGINS=https://the-amine-mokhtar.github.io`.
3. When it is live, check `https://<your-service>.onrender.com/api/health`.

### Connect the backend to the published site

In the GitHub repository: **Settings → Secrets and variables → Actions → Variables →
New repository variable**

- Name: `API_BASE_URL`
- Value: `https://<your-service>.onrender.com`

Re-run the workflow. It rewrites `frontend/js/config.js` at deploy time so the site calls
your API. If the API is asleep or down, the site falls back to its bundled content and to
the public GitHub API, so visitors never see an error.

## 5. Edit the content

Everything visible on the site comes from two files:

| What | Where |
| --- | --- |
| Projects, skills, certificates, links, tagline | `frontend/data/content.json` |
| Headings, buttons, navigation labels (EN/FR) | `frontend/js/i18n.js` |

### Certificates

Each entry in `certificates` looks like this:

```json
{
  "id": "aws-cloud-operations",
  "icon": "cloud",
  "title": "AWS Academy Graduate - Cloud Operations - Training Badge",
  "issuer": "Amazon Web Services Training and Certification",
  "type": { "en": "Training Badge", "fr": "Badge de formation" },
  "date": "",
  "credentialUrl": "",
  "tags": ["AWS", "Cloud Operations"]
}
```

- `credentialUrl`: paste the public Credly (or issuer) link and a "View credential" button
  appears on the card. Left empty, no button is shown.
- `date`: free text such as `"2026"` or `{ "en": "Oct 2026", "fr": "oct. 2026" }`.
- `icon`: one of the names in `frontend/js/icons.js` (`cloud`, `shield-check`, `bot`, `award`, …).

To add a certificate, copy an entry and change the values. To add a project, do the same in
`projects` (`"status"` is `"completed"` or `"in-progress"`).

## 6. Site features and their settings

All switches are in `frontend/js/config.js`.

**Dark mode.** The moon/sun button in the navigation switches themes and remembers the
choice. First-time visitors get the theme their system uses. Colours for both themes are the
variables at the top of `frontend/css/styles.css`.

**Downloadable CV.** The "Download CV" buttons serve `frontend/assets/cv-amine-mokhtar.pdf`.
To update it, edit `cv/cv_amine_mokhtar.tex`, run `pdflatex cv_amine_mokhtar.tex` in the
`cv/` folder, and copy the PDF over the one in `frontend/assets/`. The path is
`profile.cvUrl` in `content.json`; remove it to hide the buttons.

**Contact form.** The form posts to [FormSubmit](https://formsubmit.co), which forwards the
message to the address in `contactEndpoint`. One-time setup: send yourself a first message
from the live site, then click **Activate Form** in the email FormSubmit sends to that
address. After activation, FormSubmit gives you a random alias you can use in
`contactEndpoint` instead of your address. If delivery fails, the form opens the visitor's
email app with the message filled in. Set `contactEndpoint: ""` to always do that.

**Visitor analytics.** Off until you set `goatcounterCode`. Create a free site at
<https://www.goatcounter.com/signup>, pick a code (for example `amine-mokhtar`), and put it
in `config.js`. GoatCounter uses no cookies; visitors with Do Not Track enabled and visits
on localhost are not counted. Your dashboard is at `https://<code>.goatcounter.com`.

**Motion.** The drifting clouds are defined by the `CLOUDS` list in `frontend/js/main.js`
(position, size, speed, opacity). All animation is disabled for visitors whose system asks
for reduced motion.

## 7. Tests

```bash
cd backend
npm test
```

Nine tests cover the API routes, CORS, GitHub caching and failure handling, static file
serving and path-traversal protection. They also run in the deployment workflow; a failing
test blocks the publish.

## API reference

| Route | Returns |
| --- | --- |
| `GET /api/health` | `{ "status": "ok", "uptimeSeconds": 12 }` |
| `GET /api/content` | the whole content file |
| `GET /api/profile` · `/api/projects` · `/api/skills` · `/api/certificates` | one section |
| `GET /api/github` | `{ user, repos, cachedAt }`, cached for 10 minutes |

Icons are from [Lucide](https://lucide.dev) (ISC licence).
