// Interactive demo terminal.
//
// Everything here is SIMULATED in the browser: no command is really executed and
// nothing is sent anywhere. A small fake k3s cluster lives in memory so that
// commands like "kubectl delete pod", "stress" and "chaos" can react to each other.
//
// To add a command, add an entry to COMMANDS near the bottom of createTerminal():
//
//   hello: (args) => {
//     line(`Hello ${args[0] || "world"}`);          // plain line
//     line([{ t: "green text", c: "t-g" }]);        // coloured segment
//   },
//
// Colour classes: t-g green, t-y yellow, t-r red, t-c cyan, t-m purple, t-d dim, t-b bold.
// Use "await sleep(ms)" between lines to animate, and block(n) for lines you update in place.

const DAY = 864e5;
const SPARK = "▁▂▃▄▅▆▇█";
const FILES = ["README.md", "about.txt", "skills.yaml", "projects.md", "certificates.txt", "contact.txt", ".secrets"];
const CHIPS = ["help", "who are you", "neofetch", "kubectl get pods", "docker ps", "grafana", "stress", "chaos node-down", "pipeline"];

class Cancelled extends Error {}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const rand = (min, max) => Math.round(min + Math.random() * (max - min));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const suffix = () => Array.from({ length: 5 }, () => pick([..."bcdfghjklmnpqrstvwxz2456789"])).join("");
const bar = (pct, width = 20) => "█".repeat(Math.round((Math.min(100, pct) / 100) * width)).padEnd(width, "░");
const spark = (values, max) => values.map((v) => SPARK[Math.min(7, Math.floor((v / max) * 8))]).join("");

function age(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Aligns rows of cells into columns. */
function table(rows) {
  const widths = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] || 0, String(cell).length)));
  return rows.map((row) =>
    row.map((cell, i) => (i === row.length - 1 ? String(cell) : String(cell).padEnd(widths[i] + 3))).join("")
  );
}

// Status words are coloured automatically wherever they appear in plain lines.
const HIGHLIGHT =
  /\b(Running|Ready|Active|Healthy|UP|Completed|ok|resolved|passed)\b|\b(Pending|ContainerCreating|Terminating|pending|changed)\b|\b(CrashLoopBackOff|NotReady|Error|firing|DOWN|Failed)\b/g;

function makeCluster() {
  const now = Date.now();
  const cluster = {
    cpu: 24,
    alerts: [],
    nodes: [
      { name: "k3s-server", roles: "control-plane", status: "Ready", ip: "192.168.10.11", born: now - 41 * DAY },
      { name: "k3s-agent-1", roles: "worker", status: "Ready", ip: "192.168.10.12", born: now - 41 * DAY },
      { name: "k3s-agent-2", roles: "worker", status: "Ready", ip: "192.168.10.13", born: now - 41 * DAY },
    ],
    deployments: [
      { name: "cluverse-api", image: "cluverse/api:1.4.2", replicas: 2, hash: "7d9f8b6c5", port: 8080, cpu: 180, mem: 420, rev: 7 },
      { name: "cluverse-web", image: "cluverse/web:1.4.2", replicas: 2, hash: "5c6b7d8f9", port: 80, cpu: 12, mem: 48, rev: 7 },
      { name: "mysql", image: "mysql:8", replicas: 1, hash: "6f7c9d4b8", port: 3306, cpu: 55, mem: 512, rev: 1 },
      { name: "prometheus", image: "prom/prometheus", replicas: 1, hash: "84b5c7d9f", port: 9090, cpu: 40, mem: 310, rev: 2 },
      { name: "grafana", image: "grafana/grafana", replicas: 1, hash: "6c8d5f7b4", port: 3000, cpu: 9, mem: 120, rev: 2 },
      { name: "alertmanager", image: "prom/alertmanager", replicas: 1, hash: "59d7f8c6b", port: 9093, cpu: 4, mem: 32, rev: 1 },
      { name: "remediation-webhook", image: "amine/remediation-webhook:0.3", replicas: 1, hash: "7b6c9d5f8", port: 5000, cpu: 3, mem: 44, rev: 4 },
    ],
    pods: [],
  };
  cluster.deployments.forEach((dep, i) => {
    for (let n = 0; n < dep.replicas; n += 1) {
      cluster.pods.push({
        name: `${dep.name}-${dep.hash}-${suffix()}`,
        dep: dep.name,
        status: "Running",
        restarts: 0,
        born: now - rand(2, 9) * DAY - rand(0, DAY),
        node: cluster.nodes[1 + ((i + n) % 2)].name,
      });
    }
  });
  return cluster;
}

export function createTerminal({ content, setTheme, setLang }) {
  const { profile } = content;
  const cluster = makeCluster();

  const el = document.createElement("div");
  el.className = "term";
  el.innerHTML = `
    <div class="term-bar" aria-hidden="true">
      <span class="term-dot term-dot-r"></span><span class="term-dot term-dot-y"></span><span class="term-dot term-dot-g"></span>
      <span class="term-title">amine@cloud: ~ (simulated)</span>
    </div>
    <div class="term-body">
      <div class="term-output" role="log" aria-live="polite"></div>
      <form class="term-input-row" autocomplete="off">
        <span class="term-prompt"><span class="t-g">amine@cloud</span>:<span class="t-c">~</span>$</span>
        <input class="term-input" type="text" aria-label="Terminal command" autocapitalize="off"
          autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="go">
      </form>
    </div>
    <div class="term-chips"></div>`;

  const body = el.querySelector(".term-body");
  const out = el.querySelector(".term-output");
  const form = el.querySelector("form");
  const input = el.querySelector("input");
  const chips = el.querySelector(".term-chips");

  let busy = false;
  let token = { cancelled: false };
  const history = [];
  let historyIndex = 0;

  /* ---------- output helpers ---------- */

  const scrollToEnd = () => {
    body.scrollTop = body.scrollHeight;
  };

  function addSegment(parent, text, cls, href) {
    const safeHref = href && /^(https?:\/\/|mailto:|assets\/)/i.test(href) ? href : "";
    const node = document.createElement(safeHref ? "a" : "span");
    if (safeHref) {
      node.href = safeHref;
      if (!safeHref.startsWith("mailto:")) {
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      }
    }
    if (cls) node.className = cls;
    node.textContent = text;
    parent.appendChild(node);
  }

  function addHighlighted(parent, text) {
    let last = 0;
    for (const match of text.matchAll(HIGHLIGHT)) {
      if (match.index > last) parent.append(text.slice(last, match.index));
      addSegment(parent, match[0], match[1] ? "t-g" : match[2] ? "t-y" : "t-r");
      last = match.index + match[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  /** Writes content into a line element. Content is a string or a list of strings / { t, c, href }. */
  function fill(node, content_) {
    node.replaceChildren();
    for (const part of [].concat(content_)) {
      if (typeof part === "string") addHighlighted(node, part);
      else addSegment(node, part.t, part.c, part.href);
    }
  }

  function line(content_ = "", cls = "") {
    const node = document.createElement("div");
    node.className = `term-line ${cls}`;
    fill(node, content_);
    out.appendChild(node);
    while (out.childElementCount > 400) out.firstElementChild.remove();
    scrollToEnd();
    return node;
  }

  const lines = (list, cls) => list.forEach((item) => line(item, cls));
  const text = (content_) => line(content_, "wrap");
  const dim = (content_) => line([{ t: content_, c: "t-d" }], "wrap");
  const ok = (content_) => line([{ t: `✔ ${content_}`, c: "t-g" }], "wrap");
  const printTable = (rows) => table(rows).forEach((row, i) => line(i === 0 ? [{ t: row, c: "t-d" }] : row));

  /** n empty lines that can be re-filled in place (for live dashboards). */
  const block = (n) => Array.from({ length: n }, () => line(""));

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const current = token;
      if (current.cancelled) return reject(new Cancelled());
      if (reducedMotion()) return resolve();
      current.reject = reject;
      current.timer = setTimeout(resolve, ms);
    });
  }

  const event = async (tag, cls, message, delay = 500) => {
    line([{ t: `${new Date().toTimeString().slice(0, 8)} `, c: "t-d" }, { t: `[${tag}]`.padEnd(15), c: cls }, message], "wrap");
    await sleep(delay);
  };

  /* ---------- simulated cluster ---------- */

  const dep = (name) => cluster.deployments.find((d) => d.name === name);
  const podsOf = (name) => cluster.pods.filter((p) => p.dep === name);
  const readyNodes = () => cluster.nodes.filter((n) => n.status === "Ready" && n.roles === "worker");

  function spawnPod(depName, status = "Running") {
    const d = dep(depName);
    const nodes = readyNodes();
    const pod = {
      name: `${depName}-${d.hash}-${suffix()}`,
      dep: depName,
      status,
      restarts: 0,
      born: Date.now(),
      node: nodes.length ? nodes[cluster.pods.length % nodes.length].name : "<none>",
    };
    cluster.pods.push(pod);
    return pod;
  }

  function scaleTo(depName, replicas) {
    const d = dep(depName);
    d.replicas = replicas;
    while (podsOf(depName).length < replicas) spawnPod(depName);
    while (podsOf(depName).length > replicas) {
      const extra = podsOf(depName).pop();
      cluster.pods.splice(cluster.pods.indexOf(extra), 1);
    }
  }

  const podRow = (pod, wide) => {
    const row = [pod.name, pod.status === "Running" ? "1/1" : "0/1", pod.status, pod.restarts, age(Date.now() - pod.born)];
    return wide ? [...row, pod.node] : row;
  };
  const podHeader = (wide) => (wide ? ["NAME", "READY", "STATUS", "RESTARTS", "AGE", "NODE"] : ["NAME", "READY", "STATUS", "RESTARTS", "AGE"]);

  /** Prints a pod going through its start-up phases, like "kubectl get pods -w". */
  async function watchStart(pod) {
    for (const [status, delay] of [["Pending", 500], ["ContainerCreating", 900], ["Running", 300]]) {
      pod.status = status;
      line(table([podRow(pod)])[0]);
      await sleep(delay);
    }
  }

  async function deletePod(name) {
    const pod = cluster.pods.find((p) => p.name === name);
    if (!pod) return line(`Error from server (NotFound): pods "${name}" not found`, "wrap");
    const started = Date.now();
    line(`pod "${pod.name}" deleted`);
    cluster.pods.splice(cluster.pods.indexOf(pod), 1);
    await sleep(500);
    dim("# the ReplicaSet sees 1 replica missing and creates a new pod:");
    await watchStart(spawnPod(pod.dep, "Pending"));
    ok(`desired state restored in ${reducedMotion() ? "2.2" : ((Date.now() - started) / 1000).toFixed(1)}s, with no manual action`);
  }

  /* ---------- kubectl ---------- */

  function kubectlGet(what, wide) {
    switch (what) {
      case "pods": case "pod": case "po":
        return printTable([podHeader(wide), ...cluster.pods.map((p) => podRow(p, wide))]);
      case "nodes": case "node": case "no":
        return printTable([
          ["NAME", "STATUS", "ROLES", "AGE", "INTERNAL-IP"],
          ...cluster.nodes.map((n) => [n.name, n.status, n.roles, age(Date.now() - n.born), n.ip]),
        ]);
      case "deployments": case "deployment": case "deploy":
        return printTable([
          ["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "IMAGE"],
          ...cluster.deployments.map((d) => {
            const running = podsOf(d.name).filter((p) => p.status === "Running").length;
            return [d.name, `${running}/${d.replicas}`, d.replicas, running, d.image];
          }),
        ]);
      case "services": case "service": case "svc":
        return printTable([
          ["NAME", "TYPE", "CLUSTER-IP", "PORT(S)"],
          ...cluster.deployments.map((d, i) => {
            const nodePort = { "cluverse-web": 30080, grafana: 30300 }[d.name];
            return [d.name, nodePort ? "NodePort" : "ClusterIP", `10.43.${20 + i * 7}.${11 + i * 23}`, nodePort ? `${d.port}:${nodePort}/TCP` : `${d.port}/TCP`];
          }),
        ]);
      case "hpa":
        return printTable([
          ["NAME", "REFERENCE", "TARGETS", "MINPODS", "MAXPODS", "REPLICAS"],
          ["cluverse-api", "Deployment/cluverse-api", `cpu: ${cluster.cpu}%/70%`, 2, 6, dep("cluverse-api").replicas],
        ]);
      case "all":
        kubectlGet("pods", wide);
        line();
        kubectlGet("deployments");
        line();
        return kubectlGet("services");
      default:
        return text(`error: the server doesn't have a resource type "${what || ""}". Try: pods, nodes, deployments, services, hpa, all`);
    }
  }

  async function kubectl(args) {
    const [verb, a, b] = args;
    const flags = args.filter((x) => x.startsWith("-"));
    const rest = args.filter((x) => !x.startsWith("-")).slice(1);
    switch (verb) {
      case "get":
        return kubectlGet(rest[0], flags.some((f) => f.includes("wide")));
      case "top":
        if (a === "nodes" || a === "node") {
          return printTable([
            ["NAME", "CPU(cores)", "CPU%", "MEMORY(bytes)", "MEMORY%"],
            ...cluster.nodes.map((n, i) => {
              const cpu = n.status === "Ready" ? Math.round(cluster.cpu * (i ? 1 : 0.6)) + rand(0, 5) : 0;
              return [n.name, `${cpu * 20}m`, `${cpu}%`, `${1800 + i * 240 + rand(0, 90)}Mi`, `${46 + i * 6}%`];
            }),
          ]);
        }
        return printTable([
          ["NAME", "CPU(cores)", "MEMORY(bytes)"],
          ...cluster.pods.map((p) => {
            const d = dep(p.dep);
            const load = p.dep === "cluverse-api" ? cluster.cpu / 24 : 1;
            return [p.name, `${Math.round(d.cpu * load) + rand(0, 9)}m`, `${d.mem + rand(0, 20)}Mi`];
          }),
        ]);
      case "describe": {
        const pod = cluster.pods.find((p) => p.name === rest[1]);
        if (!pod) return text(`Error from server (NotFound): pods "${rest[1] || ""}" not found`);
        const d = dep(pod.dep);
        lines([
          `Name:         ${pod.name}`,
          `Node:         ${pod.node}`,
          `Status:       ${pod.status}`,
          `Controlled By: ReplicaSet/${pod.dep}-${d.hash}`,
          `Image:        ${d.image}`,
          `Port:         ${d.port}/TCP`,
          `Liveness:     http-get :${d.port}/health delay=10s period=10s`,
          `Readiness:    http-get :${d.port}/ready  delay=5s  period=5s`,
          `Restart Count: ${pod.restarts}`,
          "Events:       <none>",
        ]);
        return undefined;
      }
      case "logs": {
        const pod = cluster.pods.find((p) => p.name === a);
        if (!pod) return text(`Error from server (NotFound): pods "${a || ""}" not found`);
        const samples = {
          "cluverse-api": [
            "INFO  o.s.b.w.e.tomcat.TomcatWebServer : Tomcat started on port 8080",
            "INFO  c.c.api.CluverseApplication      : Started CluverseApplication in 6.4 seconds",
            "INFO  c.c.api.events.EventController   : GET /api/events 200 (31 ms)",
            "INFO  c.c.api.members.MemberController : POST /api/members 201 (58 ms)",
            "INFO  c.c.api.health.Probe             : readiness ok",
          ],
          "remediation-webhook": [
            "INFO  webhook listening on :5000",
            "INFO  alert received: PodCrashLooping deployment=cluverse-api",
            "INFO  action: rollout restart deployment/cluverse-api -> ok",
            "INFO  audit: action logged to /var/log/remediation/audit.jsonl",
          ],
          prometheus: ["level=info msg=\"Server is ready to receive web requests.\"", "level=info msg=\"Loading configuration file\" file=prometheus.yml"],
          mysql: ["[System] [MY-010931] mysqld: ready for connections. port: 3306"],
        };
        lines(samples[pod.dep] || ["(no recent log lines)"], "wrap");
        return undefined;
      }
      case "delete":
        if (!rest[1]) return text("usage: kubectl delete pod <name>   (Tab completes pod names)");
        return deletePod(rest[1]);
      case "scale": {
        const name = (rest[1] || "").replace(/^deployment\//, "");
        const replicas = Number((args.find((x) => x.startsWith("--replicas")) || "").split("=")[1]);
        if (!dep(name)) return text(`Error from server (NotFound): deployments.apps "${name}" not found`);
        if (!Number.isInteger(replicas) || replicas < 0 || replicas > 8) return text("usage: kubectl scale deployment <name> --replicas=N   (0 to 8 in this demo)");
        scaleTo(name, replicas);
        line(`deployment.apps/${name} scaled`);
        await sleep(400);
        return kubectlGet("deployments");
      }
      case "rollout": {
        const name = (b || "").replace(/^deployment\//, "");
        if (!dep(name)) return text("usage: kubectl rollout status|undo|restart deployment/<name>");
        if (a === "undo") {
          dep(name).rev -= 1;
          line(`deployment.apps/${name} rolled back`);
        } else if (a === "restart") {
          line(`deployment.apps/${name} restarted`);
          for (const pod of podsOf(name)) pod.born = Date.now();
        }
        await sleep(500);
        return line(`deployment "${name}" successfully rolled out`);
      }
      case "apply": case "edit": case "create":
        return text("error: this demo cluster is read-only for manifests. Try: kubectl scale, kubectl delete pod, or chaos");
      default:
        return text("usage: kubectl get|top|describe|logs|delete|scale|rollout ...   (see help)");
    }
  }

  /* ---------- simulations ---------- */

  async function stress() {
    dim("# simulated load test against cluverse-api (think: hey -z 30s -c 200)");
    const live = block(4);
    const draw = (s) => {
      fill(live[0], [{ t: "load      ", c: "t-d" }, { t: bar(s.rps / 15), c: "t-c" }, ` ${String(s.rps).padStart(5)} req/s`]);
      fill(live[1], [{ t: "cpu       ", c: "t-d" }, { t: bar(s.cpu), c: s.cpu > 85 ? "t-r" : s.cpu > 70 ? "t-y" : "t-g" }, ` ${String(s.cpu).padStart(5)}%  (hpa target 70%)`]);
      fill(live[2], [{ t: "replicas  ", c: "t-d" }, { t: "● ".repeat(dep("cluverse-api").replicas), c: "t-g" }, { t: "○ ".repeat(6 - dep("cluverse-api").replicas), c: "t-d" }, ` ${dep("cluverse-api").replicas}/6`]);
      fill(live[3], [{ t: "p95       ", c: "t-d" }, `${s.p95} ms`]);
    };
    const steps = [
      { rps: 120, cpu: 28, p95: 80, ev: ["load", "t-c", "200 virtual users ramping up"] },
      { rps: 480, cpu: 52, p95: 110 },
      { rps: 900, cpu: 78, p95: 190, ev: ["prometheus", "t-m", "HighCpuUsage pending (cpu > 70%)"] },
      { rps: 1300, cpu: 93, p95: 420, alert: true, ev: ["alertmanager", "t-m", "HighCpuUsage firing -> remediation-webhook notified"] },
      { rps: 1450, cpu: 91, p95: 380, scale: 4, ev: ["hpa", "t-c", "cluverse-api scaled 2 -> 4 replicas (cpu 91% / 70%)"] },
      { rps: 1480, cpu: 76, p95: 210, scale: 5, ev: ["hpa", "t-c", "cluverse-api scaled 4 -> 5 replicas"] },
      { rps: 1470, cpu: 61, p95: 120 },
      { rps: 1460, cpu: 58, p95: 105, ev: ["load", "t-c", "holding 1,460 req/s, error rate 0.0%"] },
      { rps: 600, cpu: 34, p95: 85, ev: ["load", "t-c", "test finished"] },
      { rps: 90, cpu: 18, p95: 70, alert: false, ev: ["alertmanager", "t-m", "HighCpuUsage resolved"] },
      { rps: 60, cpu: 24, p95: 68, scale: 2, ev: ["hpa", "t-c", "cluverse-api scaled back 5 -> 2 replicas"] },
    ];
    try {
      for (const step of steps) {
        cluster.cpu = step.cpu;
        if (step.scale) scaleTo("cluverse-api", step.scale);
        if (step.alert !== undefined) cluster.alerts = step.alert ? [{ name: "HighCpuUsage", severity: "warning", target: "cluverse-api" }] : [];
        draw(step);
        if (step.ev) await event(...step.ev, 250);
        await sleep(450);
      }
      ok("peak 1,480 req/s served with 0 errors. Autoscaled 2 -> 5 -> 2 pods, nobody was paged.");
    } finally {
      cluster.cpu = 24;
      cluster.alerts = [];
      scaleTo("cluverse-api", 2);
    }
  }

  async function chaos(args) {
    const scenario = args[0];
    if (scenario === "pod-kill") {
      const victim = pick(podsOf("cluverse-api"));
      if (!victim) return text("no cluverse-api pod to kill. Try: kubectl scale deployment cluverse-api --replicas=2");
      line([{ t: "✖ chaos: ", c: "t-r" }, `killing ${victim.name}`], "wrap");
      await sleep(400);
      return deletePod(victim.name);
    }
    if (scenario === "node-down") {
      const node = cluster.nodes[2];
      const moved = cluster.pods.filter((p) => p.node === node.name);
      try {
        line([{ t: "✖ chaos: ", c: "t-r" }, `powering off VM ${node.name}`], "wrap");
        await sleep(600);
        node.status = "NotReady";
        kubectlGet("nodes");
        await event("prometheus", "t-m", `NodeDown firing instance=${node.name}`);
        await event("kubernetes", "t-c", `${moved.length} pods on ${node.name} marked Terminating, rescheduling`);
        for (const pod of moved) {
          cluster.pods.splice(cluster.pods.indexOf(pod), 1);
          await watchStart(spawnPod(pod.dep, "Pending"));
        }
        await event("webhook", "t-g", "alert received, unhealthy deployments restarted, action written to audit log");
        await event("vm", "t-c", `${node.name} is back online and rejoins the cluster`, 600);
      } finally {
        node.status = "Ready";
      }
      await event("alertmanager", "t-m", "NodeDown resolved", 300);
      kubectlGet("nodes");
      return ok(`all ${cluster.pods.length} pods Running again. The app stayed reachable on the other worker the whole time.`);
    }
    if (scenario === "bad-deploy") {
      const d = dep("cluverse-api");
      const broken = { name: `cluverse-api-6b8c7f9d4-${suffix()}`, dep: "cluverse-api", status: "ContainerCreating", restarts: 0, born: Date.now(), node: "k3s-agent-1" };
      try {
        line([{ t: "✖ chaos: ", c: "t-r" }, "pushing a broken build cluverse/api:1.5.0 through the pipeline"], "wrap");
        await event("ci", "t-c", "build ok, image pushed, rolling update started");
        cluster.pods.push(broken);
        line(table([podRow(broken)])[0]);
        await sleep(700);
        for (let i = 1; i <= 3; i += 1) {
          broken.status = i === 1 ? "Error" : "CrashLoopBackOff";
          broken.restarts = i;
          line(table([podRow(broken)])[0]);
          await sleep(550);
        }
        await event("ci", "t-r", "smoke test: Failed (readiness probe never passed, HTTP 503)");
        await event("ci", "t-y", `automatic rollback to revision ${d.rev} (cluverse/api:1.4.2)`);
      } finally {
        const index = cluster.pods.indexOf(broken);
        if (index >= 0) cluster.pods.splice(index, 1);
      }
      await event("kubernetes", "t-c", "old pods never left: readiness gate kept traffic on 1.4.2", 400);
      return ok("broken release rolled back automatically. Users never saw version 1.5.0.");
    }
    lines([
      "usage: chaos <scenario>",
      "  pod-kill     kill a random API pod and watch it come back",
      "  node-down    power off a worker VM and watch pods move",
      "  bad-deploy   ship a broken build and watch the pipeline roll back",
    ]);
    return undefined;
  }

  async function grafana() {
    line([{ t: "Grafana · cluverse / overview", c: "t-b" }, { t: "   (simulated, refresh 1s)", c: "t-d" }]);
    const live = block(6);
    const series = { cpu: [], mem: [], rps: [], p95: [] };
    const next = (list, base, jitter) => {
      const prev = list.length ? list[list.length - 1] : base;
      // Random walk that is pulled back towards its base value.
      list.push(Math.max(base * 0.5, Math.min(base * 1.6, prev + (base - prev) * 0.25 + rand(-jitter, jitter))));
      if (list.length > 24) list.shift();
    };
    for (let i = 0; i < 24; i += 1) {
      next(series.cpu, cluster.cpu + 10, 6);
      next(series.mem, 58, 2);
      next(series.rps, 210, 40);
      next(series.p95, 90, 18);
    }
    const frames = reducedMotion() ? 1 : 12;
    for (let frame = 0; frame < frames; frame += 1) {
      next(series.cpu, cluster.cpu + 10, 6);
      next(series.mem, 58, 2);
      next(series.rps, 210, 40);
      next(series.p95, 90, 18);
      const last = (list) => Math.round(list[list.length - 1]);
      const running = cluster.pods.filter((p) => p.status === "Running").length;
      fill(live[0], [{ t: "CPU      ", c: "t-d" }, { t: spark(series.cpu, 100), c: "t-g" }, `  ${last(series.cpu)}%`]);
      fill(live[1], [{ t: "Memory   ", c: "t-d" }, { t: spark(series.mem, 100), c: "t-c" }, `  ${last(series.mem)}%`]);
      fill(live[2], [{ t: "Req/s    ", c: "t-d" }, { t: spark(series.rps, 340), c: "t-m" }, `  ${last(series.rps)}`]);
      fill(live[3], [{ t: "p95 ms   ", c: "t-d" }, { t: spark(series.p95, 150), c: "t-y" }, `  ${last(series.p95)}`]);
      fill(live[4], [{ t: "Pods     ", c: "t-d" }, { t: "● ".repeat(running), c: "t-g" }, ` ${running}/${cluster.pods.length} healthy`]);
      fill(live[5], [{ t: "Alerts   ", c: "t-d" }, cluster.alerts.length ? `${cluster.alerts.length} firing` : "0 firing"]);
      await sleep(450);
    }
    dim("# tip: run stress, then grafana again");
  }

  async function steps(title, list, done) {
    line([{ t: title, c: "t-b" }], "wrap");
    for (const [label, detail, delay] of list) {
      const node = line([{ t: "  ◌ ", c: "t-y" }, label]);
      await sleep(delay);
      fill(node, [{ t: "  ✔ ", c: "t-g" }, label.padEnd(26), { t: detail, c: "t-d" }]);
    }
    ok(done);
  }

  /* ---------- profile commands ---------- */

  const en = (value) => (value && typeof value === "object" ? value.en ?? "" : value ?? "");
  const cloudSkills = (content.skills.find((g) => g.key === "cloud") || { items: [] }).items;

  function showProjects() {
    content.projects.forEach((p, i) => {
      line([{ t: `${i + 1}. ${en(p.title)}`, c: "t-b" }, { t: `  ${en(p.period)}`, c: "t-d" }], "wrap");
      line([{ t: `   ${p.tags.join(" · ")}`, c: "t-c" }], "wrap");
      if (p.repoUrl) line(["   ", { t: p.repoUrl, c: "t-link", href: p.repoUrl }], "wrap");
    });
  }

  function showSkills() {
    for (const group of content.skills) line([{ t: `${en(group.title)}: `.padEnd(16), c: "t-c" }, group.items.join(", ")], "wrap hang");
  }

  function showCerts() {
    for (const cert of content.certificates || []) {
      line([{ t: "★ ", c: "t-y" }, { t: en(cert.title), c: "t-b" }], "wrap");
      line([{ t: `  ${cert.issuer}${cert.date ? ` · ${en(cert.date)}` : ""}`, c: "t-d" }], "wrap");
      if (cert.credentialUrl) line(["  ", { t: "verify credential", c: "t-link", href: cert.credentialUrl }]);
    }
  }

  function showContact() {
    line([{ t: "email     ", c: "t-d" }, { t: profile.email, c: "t-link", href: `mailto:${profile.email}` }], "wrap");
    line([{ t: "github    ", c: "t-d" }, { t: profile.githubUrl, c: "t-link", href: profile.githubUrl }], "wrap");
    line([{ t: "linkedin  ", c: "t-d" }, { t: profile.linkedinUrl, c: "t-link", href: profile.linkedinUrl }], "wrap");
  }

  function showAbout() {
    text([{ t: `${profile.firstName} ${profile.lastName}`, c: "t-b" }]);
    text(en(profile.tagline));
    dim(`${content.projects.length} featured projects · ${(content.certificates || []).length} certificates · type projects, certs or skills`);
  }

  // "who are you": the longer bio from content.json (profile.bio), in the site's current language.
  function whoAreYou() {
    const lang = document.documentElement.lang === "fr" ? "fr" : "en";
    const bio = profile.bio && (profile.bio[lang] || profile.bio.en);
    text([{ t: `${profile.firstName} ${profile.lastName}`, c: "t-b" }]);
    text(bio || en(profile.tagline));
    dim("more: skills · projects · certs · contact · cv");
  }

  function help() {
    const groups = [
      ["PROFILE", "who are you · whoami · about · skills · projects · certs · contact · cv · neofetch"],
      ["CONTAINERS", "docker ps · docker images · docker stats"],
      ["KUBERNETES", "kubectl get pods|nodes|deploy|svc|hpa · kubectl top pods|nodes · kubectl logs <pod> · kubectl describe pod <pod> · kubectl delete pod <pod> · kubectl scale deployment <name> --replicas=N   (alias: k)"],
      ["OBSERVE", "prometheus · promql up · alerts · grafana · top"],
      ["SIMULATE", "stress · chaos pod-kill|node-down|bad-deploy · pipeline"],
      ["IAC", "terraform plan · ansible-playbook site.yml"],
      ["SHELL", "ls · cat <file> · history · clear · date · theme dark|light · lang en|fr · open github|linkedin|cv"],
    ];
    for (const [name, commands] of groups) line([{ t: name.padEnd(12), c: "t-c" }, commands], "wrap hang");
    dim("Tab completes · ↑/↓ recalls · Ctrl+C stops · Ctrl+L clears · chain with &&");
  }

  const openTargets = () => ({ github: profile.githubUrl, linkedin: profile.linkedinUrl, cv: profile.cvUrl });

  /* ---------- command table ---------- */

  const COMMANDS = {
    help,
    whoami: () => {
      line("amine");
      dim(`${profile.firstName} ${profile.lastName} · ${en(profile.tagline)}`);
    },
    about: showAbout,
    whoareyou: whoAreYou,
    // "who are you" arrives here as the command "who" with the arguments "are you".
    who: (args) => (/^are\s*you\??$/i.test(args.join(" ")) ? whoAreYou() : line("amine    pts/0    (your browser)")),
    skills: showSkills,
    projects: showProjects,
    certs: showCerts,
    contact: showContact,
    cv: () => {
      if (!profile.cvUrl) return text("no CV published");
      const link = document.createElement("a");
      link.href = profile.cvUrl;
      link.download = "";
      link.click();
      return line(["downloading ", { t: profile.cvUrl, c: "t-link", href: profile.cvUrl }], "wrap");
    },
    neofetch: () => {
      const art = ["      .--.      ", "   .-(    ).    ", "  (___.__)__)   ", "   ' ' ' ' '    ", "                ", "                "];
      const info = [
        [{ t: "amine", c: "t-g" }, "@", { t: "cloud", c: "t-g" }],
        [{ t: "Name    ", c: "t-c" }, `${profile.firstName} ${profile.lastName}`],
        [{ t: "Role    ", c: "t-c" }, "Cloud & DevOps engineering student"],
        [{ t: "Stack   ", c: "t-c" }, cloudSkills.slice(0, 5).join(", ")],
        [{ t: "Cluster ", c: "t-c" }, `k3s · ${cluster.nodes.length} nodes · ${cluster.pods.length} pods`],
        [{ t: "Shell   ", c: "t-c" }, "bash (simulated in your browser)"],
      ];
      art.forEach((row, i) => line([{ t: row, c: "t-c" }, ...info[i]]));
    },
    ls: (args) => line((args.includes("-a") || args.includes("-la") ? FILES : FILES.filter((f) => !f.startsWith("."))).join("  "), "wrap"),
    cat: (args) => {
      const file = args[0];
      const views = {
        "about.txt": showAbout,
        "skills.yaml": showSkills,
        "projects.md": showProjects,
        "certificates.txt": showCerts,
        "contact.txt": showContact,
        "README.md": () => text("A simulated cloud shell. Nothing here runs for real. Start with: help"),
        ".secrets": () => text("cat: .secrets: Permission denied (nice try, they live in a vault)"),
      };
      if (!file) return text("usage: cat <file>   (try: ls)");
      return views[file] ? views[file]() : text(`cat: ${file}: No such file or directory`);
    },
    pwd: () => line("/home/amine"),
    hostname: () => line("cloud"),
    date: () => line(new Date().toString(), "wrap"),
    uptime: () => line(` up ${age(Date.now() - cluster.nodes[0].born)}, load average: ${(cluster.cpu / 40).toFixed(2)}, 0.61, 0.58`),
    uname: () => line("Linux cloud k3s-lab x86_64 GNU/Linux (simulated)", "wrap"),
    echo: (args) => line([{ t: args.join(" ") }], "wrap"),
    history: () => history.forEach((entry, i) => line([{ t: `${String(i + 1).padStart(4)}  ${entry}` }])),
    clear: () => out.replaceChildren(),
    theme: (args) => {
      if (!["dark", "light"].includes(args[0])) return text("usage: theme dark|light");
      setTheme(args[0]);
      return line(`theme set to ${args[0]}`);
    },
    lang: (args) => {
      if (!["en", "fr"].includes(args[0])) return text("usage: lang en|fr");
      setLang(args[0]);
      input.focus({ preventScroll: true });
      return line(`language set to ${args[0]}`);
    },
    open: (args) => {
      const url = openTargets()[args[0]];
      if (!url) return text("usage: open github|linkedin|cv");
      window.open(url, "_blank", "noopener");
      return line(["opening ", { t: url, c: "t-link", href: url }], "wrap");
    },

    docker: (args) => {
      if (args[0] === "ps") {
        return printTable([
          ["CONTAINER ID", "IMAGE", "STATUS", "PORTS", "NAMES"],
          ["a3f1c9d27b10", "gitea/gitea", "Up 5 days", "3000->3000/tcp", "gitea"],
          ["7c2e84b1f0aa", "gitea/act_runner", "Up 5 days", "", "ci-runner"],
          ["e91b7d3c55f2", "registry:2", "Up 5 days", "5000->5000/tcp", "registry"],
          ["4d8a0e6b93c1", "cluverse/api:1.4.2", "Up 2 hours (healthy)", "8080->8080/tcp", "cluverse-api-dev"],
          ["b6f2a1c8d704", "mysql:8", "Up 2 hours (healthy)", "3306/tcp", "mysql-dev"],
        ]);
      }
      if (args[0] === "images") {
        return printTable([
          ["REPOSITORY", "TAG", "SIZE"],
          ["cluverse/api", "1.4.2", "214MB"],
          ["cluverse/web", "1.4.2", "48.3MB"],
          ["amine/remediation-webhook", "0.3", "61.7MB"],
          ["mysql", "8", "583MB"],
        ]);
      }
      if (args[0] === "stats") {
        return printTable([
          ["NAME", "CPU %", "MEM USAGE", "NET I/O"],
          ["cluverse-api-dev", `${(cluster.cpu / 6 + Math.random()).toFixed(2)}%`, `${410 + rand(0, 30)}MiB`, "1.2MB / 3.4MB"],
          ["mysql-dev", `${(1 + Math.random()).toFixed(2)}%`, `${498 + rand(0, 20)}MiB`, "840kB / 2.1MB"],
          ["gitea", `${(0.3 + Math.random()).toFixed(2)}%`, `${150 + rand(0, 12)}MiB`, "5.6MB / 9.8MB"],
          ["registry", "0.02%", "18MiB", "12MB / 220MB"],
        ]);
      }
      return text("usage: docker ps|images|stats");
    },
    kubectl,

    prometheus: () => {
      line([{ t: "Targets", c: "t-b" }]);
      printTable([
        ["JOB", "INSTANCE", "STATE", "LAST SCRAPE"],
        ...cluster.nodes.map((n) => ["node-exporter", `${n.ip}:9100`, n.status === "Ready" ? "UP" : "DOWN", `${rand(1, 14)}s ago`]),
        ...podsOf("cluverse-api").map((p, i) => ["cluverse-api", `10.42.${1 + (i % 2)}.${20 + i}:8080`, p.status === "Running" ? "UP" : "DOWN", `${rand(1, 14)}s ago`]),
        ["mysql-exporter", "10.42.1.31:9104", "UP", `${rand(1, 14)}s ago`],
      ]);
      dim("# rules loaded: HighCpuUsage, PodCrashLooping, NodeDown, DeploymentUnavailable");
    },
    promql: (args) => {
      const expr = args.join(" ");
      if (!expr) return text("usage: promql <expression>   e.g. promql up · promql node_cpu · promql rate(http_requests_total[5m])");
      if (/^up\b/.test(expr)) {
        return cluster.nodes.forEach((n) => line(`up{job="node-exporter", instance="${n.ip}:9100"}  ${n.status === "Ready" ? 1 : 0}`));
      }
      if (/cpu/.test(expr)) return cluster.nodes.forEach((n, i) => line(`{instance="${n.name}"}  ${(cluster.cpu * (i ? 1 : 0.6) + Math.random() * 4).toFixed(1)}`));
      if (/http_requests/.test(expr)) return line(`{job="cluverse-api"}  ${(cluster.cpu * 8.6 + Math.random() * 10).toFixed(1)}`);
      return text("no demo data for that expression. Try: up, node_cpu, rate(http_requests_total[5m])");
    },
    alerts: () => {
      if (!cluster.alerts.length) return line([{ t: "✔ ", c: "t-g" }, "no alerts firing. Alertmanager routes: default -> remediation-webhook"], "wrap");
      return printTable([["ALERT", "SEVERITY", "TARGET", "STATE"], ...cluster.alerts.map((a) => [a.name, a.severity, a.target, "firing"])]);
    },
    grafana,
    top: () => {
      line(`top - load average: ${(cluster.cpu / 40).toFixed(2)}  Tasks: 142 total  %Cpu(s): ${cluster.cpu}.0 us`, "wrap");
      printTable([
        ["PID", "USER", "%CPU", "%MEM", "COMMAND"],
        [2143, "root", (cluster.cpu / 3).toFixed(1), "9.8", "k3s server"],
        [3310, "1000", (cluster.cpu / 5).toFixed(1), "6.4", "java -jar cluverse-api.jar"],
        [2871, "999", "2.1", "7.9", "mysqld"],
        [3402, "65534", "1.4", "4.7", "prometheus"],
        [3555, "472", "0.6", "1.9", "grafana"],
        [3720, "1000", "0.1", "0.7", "python remediation_webhook.py"],
      ]);
    },

    stress,
    overload: stress,
    chaos,
    pipeline: () =>
      steps(
        "CI/CD pipeline · cluverse-api · main",
        [
          ["checkout", "git clone", 350],
          ["unit tests", "mvn test · 212 passed", 800],
          ["build image", "docker build", 700],
          ["push to registry", "registry:5000/cluverse/api", 450],
          ["deploy to k3s", "rolling update, 0 downtime", 800],
          ["smoke test", "GET /health 200", 450],
        ],
        "pipeline passed. Automatic rollback stays armed for the next release."
      ),
    terraform: async (args) => {
      if (args[0] !== "plan") return text(args[0] === "apply" ? "apply is disabled in this demo. Try: terraform plan" : "usage: terraform plan");
      dim("Refreshing state...");
      await sleep(600);
      for (const [name, cpu, mem] of [["k3s-server", 2, 4], ["k3s-agent-1", 2, 4], ["k3s-agent-2", 2, 4], ["ci-runner", 2, 2]]) {
        line([{ t: "  + ", c: "t-g" }, `vm "${name}"`.padEnd(20), { t: `${cpu} vCPU · ${mem} GB · VMware ESXi`, c: "t-d" }]);
        await sleep(200);
      }
      return line([{ t: "Plan: ", c: "t-b" }, { t: "4 to add", c: "t-g" }, ", 0 to change, 0 to destroy."]);
    },
    "ansible-playbook": async () => {
      for (const task of ["Install container runtime", "Install k3s server", "Join k3s agents", "Deploy monitoring stack"]) {
        line([{ t: `TASK [${task}] `, c: "t-b" }, { t: "*".repeat(Math.max(3, 40 - task.length)), c: "t-d" }]);
        await sleep(350);
        line(pick(["ok: [k3s-server]", "changed: [k3s-server]"]));
        line("changed: [k3s-agent-1]");
        line("changed: [k3s-agent-2]");
      }
      line([{ t: "PLAY RECAP", c: "t-b" }]);
      for (const node of cluster.nodes) line(`${node.name.padEnd(14)} ok=4   changed=3   unreachable=0   failed=0`);
    },

    sudo: () => text("amine is not in the sudoers file. This incident will be reported to Grafana."),
    rm: () => text("rm: refused. This cluster heals itself anyway. Try: chaos pod-kill"),
    exit: () => text("logout denied: the uptime SLA says this shell stays up."),
    vim: () => text("no editor here. Everything is declared in Git, as it should be."),
  };
  COMMANDS.nano = COMMANDS.vim;
  COMMANDS.vi = COMMANDS.vim;
  COMMANDS.k = kubectl;

  const HIDDEN = new Set(["whoareyou", "sudo", "rm", "exit", "vim", "nano", "vi", "overload", "k", "pwd", "hostname", "uname", "uptime", "echo"]);

  /* ---------- running commands ---------- */

  function echoPrompt(value) {
    line([{ t: "amine@cloud", c: "t-g" }, ":", { t: "~", c: "t-c" }, "$ ", { t: value }], "wrap");
  }

  async function execute(commandLine) {
    const tokens = (commandLine.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((tok) => tok.replace(/^(["'])(.*)\1$/, "$2"));
    if (!tokens.length) return;
    const handler = Object.hasOwn(COMMANDS, tokens[0]) ? COMMANDS[tokens[0]] : null;
    if (!handler) {
      text(`bash: ${tokens[0]}: command not found. Type help to see what works here.`);
      return;
    }
    await handler(tokens.slice(1));
  }

  async function run(raw) {
    const value = raw.trim();
    echoPrompt(value);
    if (!value) return;
    if (history[history.length - 1] !== value) history.push(value);
    historyIndex = history.length;
    busy = true;
    token = { cancelled: false };
    el.classList.add("is-busy");
    try {
      for (const part of value.split("&&")) await execute(part.trim());
    } catch (error) {
      if (error instanceof Cancelled) line([{ t: "^C", c: "t-d" }]);
      else {
        console.error(error);
        text("bash: something went wrong running that command");
      }
    } finally {
      busy = false;
      el.classList.remove("is-busy");
      scrollToEnd();
    }
  }

  function cancel() {
    token.cancelled = true;
    clearTimeout(token.timer);
    token.reject?.(new Cancelled());
  }

  /* ---------- tab completion ---------- */

  function candidates(previous) {
    const [first, second, third] = previous.map((tok, i) => (i === 0 && tok === "k" ? "kubectl" : tok));
    const pods = cluster.pods.map((p) => p.name);
    const deployments = cluster.deployments.map((d) => d.name);
    if (!first) return Object.keys(COMMANDS).filter((name) => !HIDDEN.has(name));
    if (first === "who") return second ? (third ? [] : ["you"]) : ["are"];
    if (first === "kubectl") {
      if (!second) return ["get", "top", "describe", "logs", "delete", "scale", "rollout"];
      if (second === "get" && !third) return ["pods", "nodes", "deployments", "services", "hpa", "all"];
      if (second === "top" && !third) return ["pods", "nodes"];
      if (second === "logs" && !third) return pods;
      if (second === "delete" || second === "describe") return third ? pods : ["pod"];
      if (second === "scale") return third ? deployments : ["deployment"];
      if (second === "rollout") return third ? deployments.map((d) => `deployment/${d}`) : ["status", "undo", "restart"];
      return [];
    }
    if (second) return [];
    return (
      {
        docker: ["ps", "images", "stats"],
        chaos: ["pod-kill", "node-down", "bad-deploy"],
        cat: FILES,
        theme: ["dark", "light"],
        lang: ["en", "fr"],
        open: ["github", "linkedin", "cv"],
        terraform: ["plan"],
        "ansible-playbook": ["site.yml"],
        promql: ["up", "node_cpu", "rate(http_requests_total[5m])"],
      }[first] || []
    );
  }

  function complete() {
    const value = input.value;
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    const partial = /\s$/.test(value) ? "" : tokens.pop() ?? "";
    const matches = candidates(tokens).filter((c) => c.startsWith(partial));
    if (!matches.length) return;
    if (matches.length === 1) {
      input.value = `${[...tokens, matches[0]].join(" ")} `;
      return;
    }
    let prefix = matches[0];
    for (const match of matches) while (!match.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (prefix.length > partial.length) input.value = [...tokens, prefix].join(" ");
    else {
      echoPrompt(value);
      line(matches.join("  "), "wrap");
    }
  }

  /* ---------- events ---------- */

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const value = input.value;
    input.value = "";
    run(value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      if (busy) cancel();
      else if (input.value) {
        echoPrompt(`${input.value}^C`);
        input.value = "";
      } else return; // nothing to cancel: let the browser copy
      e.preventDefault();
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      out.replaceChildren();
    } else if (busy) {
      if (e.key.length === 1 || e.key === "Enter") e.preventDefault();
    } else if (e.key === "Tab" && input.value) {
      // Only capture Tab while typing, so keyboard users can still tab past the terminal.
      e.preventDefault();
      complete();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!history.length) return;
      e.preventDefault();
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (e.key === "ArrowUp" ? -1 : 1)));
      input.value = history[historyIndex] ?? "";
    }
  });

  body.addEventListener("click", (e) => {
    if (e.target.closest("a") || window.getSelection()?.toString()) return;
    input.focus({ preventScroll: true });
  });

  for (const command of CHIPS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "term-chip";
    chip.textContent = command;
    chip.addEventListener("click", () => {
      if (!busy) run(command);
    });
    chips.appendChild(chip);
  }

  line([{ t: "Welcome to amine-cloud", c: "t-b" }, { t: "  ·  a simulated k3s lab, nothing here runs for real", c: "t-d" }], "wrap");
  line(["Type ", { t: "help", c: "t-c" }, " or tap a command below. Try ", { t: "stress", c: "t-c" }, " or ", { t: "chaos node-down", c: "t-c" }, "."], "wrap");
  line();

  return { element: el, run, scrollToEnd };
}
