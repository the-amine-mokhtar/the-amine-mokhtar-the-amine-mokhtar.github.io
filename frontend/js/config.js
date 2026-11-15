// Frontend configuration.
export const CONFIG = {
  // --- Backend (optional) -------------------------------------------------
  // useApi: false -> fully static mode (what GitHub Pages serves by default).
  // useApi: true  -> content and repositories come from backend/server.js; if
  //                  it is unreachable the site falls back to static mode.
  // apiBase: the backend's origin without a trailing slash, or "" when the
  //          backend itself serves this frontend.
  // The deployment workflow fills these two in when the repository variable
  // API_BASE_URL is set (see README).
  useApi: false,
  apiBase: "",

  // --- Contact form -------------------------------------------------------
  // Where the form posts its JSON. FormSubmit forwards it to the address in
  // the URL. The very first message triggers an activation email to that
  // address: click the link in it once and the form is live. FormSubmit then
  // gives you a random alias you can paste here instead of the address.
  // Leave "" to make the form open the visitor's email app instead.
  contactEndpoint: "https://formsubmit.co/ajax/aminemokhtar2003@gmail.com",

  // --- Visitor analytics --------------------------------------------------
  // Your GoatCounter site code (the "mycode" part of mycode.goatcounter.com).
  // GoatCounter sets no cookies and stores no personal data. Leave "" to
  // load no analytics at all. Visitors with "Do Not Track" on are never counted.
  goatcounterCode: "amine-mokhtar",
};
