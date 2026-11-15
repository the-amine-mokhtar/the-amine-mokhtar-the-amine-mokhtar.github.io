// Frontend configuration.
//
// useApi: false -> fully static mode (what GitHub Pages serves by default).
//                  Content comes from ./data/content.json and repositories are
//                  fetched straight from the public GitHub API in the browser.
// useApi: true  -> content and repositories are requested from the backend
//                  (backend/server.js). If the backend is unreachable the site
//                  silently falls back to static mode, so it never breaks.
//
// apiBase: the backend's origin, without a trailing slash,
//          e.g. "https://amine-portfolio-api.onrender.com".
//          Leave it "" when the backend itself serves this frontend (same origin).
//
// The GitHub Pages workflow overwrites this file automatically when the
// repository variable API_BASE_URL is set (see README, "Connect the backend").
export const CONFIG = {
  useApi: false,
  apiBase: "",
};
