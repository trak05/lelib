// Vérifie la compatibilité entre la version d'Angular et de Node du projet et les
// versions de PrimeNG / Bootstrap à utiliser. Sans dépendance.
//
//   node check-compat.js [dossier]          rapport complet (interroge npm), texte
//   node check-compat.js [dossier] --json   même rapport, en JSON
//   node check-compat.js --hook             pour SessionStart : local uniquement, silencieux si tout va bien
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const HOOK = args.includes("--hook");
const AS_JSON = args.includes("--json");
const dirArg = args.find((a) => !a.startsWith("--"));

// ---------- mini-semver (^, ~, >=, >, <=, <, =, x.y.z, x, ||) ----------
const parse = (v) => {
  const m = String(v).match(/(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/);
  return m ? [Number(m[1]), m[2] === undefined || isNaN(m[2]) ? null : Number(m[2]), m[3] === undefined || isNaN(m[3]) ? null : Number(m[3])] : null;
};
const cmp = (a, b) => {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};
function satisfiesToken(version, token) {
  const op = (token.match(/^(\^|~|>=|<=|>|<|=)?/) || [""])[0];
  const base = parse(token.slice(op.length));
  if (!base) return true;
  const [M, m, p] = base;
  const lo = [M, m ?? 0, p ?? 0];
  switch (op) {
    case "^": {
      const hi = M > 0 ? [M + 1, 0, 0] : m > 0 ? [0, m + 1, 0] : [0, 0, (p ?? 0) + 1];
      return cmp(version, lo) >= 0 && cmp(version, hi) < 0;
    }
    case "~": return cmp(version, lo) >= 0 && cmp(version, m === null ? [M + 1, 0, 0] : [M, m + 1, 0]) < 0;
    case ">=": return cmp(version, lo) >= 0;
    case ">": return cmp(version, lo) > 0;
    case "<=": return cmp(version, lo) <= 0;
    case "<": return cmp(version, lo) < 0;
    default:
      if (m === null) return version[0] === M;
      if (p === null) return version[0] === M && version[1] === m;
      return cmp(version, lo) === 0;
  }
}
const satisfies = (version, range) =>
  String(range).split("||").some((set) => set.trim().split(/\s+/).filter(Boolean).every((t) => satisfiesToken(version, t)));
const minOf = (range) => parse(String(range).split("||")[0].replace(/[\^~><=\s]/g, ""));

// ---------- lecture du projet ----------
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const base = dirArg ? path.resolve(dirArg) : process.env.CLAUDE_PROJECT_DIR || process.cwd();
const candidates = [base, ...["frontend", "front", "client", "web", "ui"].map((d) => path.join(base, d))];
let root = null, pkg = null;
for (const dir of candidates) {
  const p = readJson(path.join(dir, "package.json"));
  if (p && { ...p.dependencies, ...p.devDependencies }["@angular/core"]) { root = dir; pkg = p; break; }
}
if (!pkg) {
  if (HOOK) process.exit(0);
  console.log(AS_JSON ? JSON.stringify({ erreur: "Aucun projet Angular trouvé" }) : "Aucun projet Angular trouvé (package.json avec @angular/core) dans " + base);
  process.exit(0);
}

const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const installed = (name) => readJson(path.join(root, "node_modules", name, "package.json"));
const ng = installed("@angular/core");
const angularVersion = parse(ng?.version ?? minOf(deps["@angular/core"]).join("."));
const angularStr = ng?.version ?? angularVersion.map((n) => n ?? 0).join(".");
const angularMajor = angularVersion[0];
const nodeNow = parse(process.version);

// ---------- npm (hors mode hook) ----------
// npm-cli.js livré avec Node : évite le shell (npm.cmd sous Windows) et ses avertissements.
const npmCli = [
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find((p) => fs.existsSync(p));
function npmView(spec, field) {
  const viewArgs = ["view", spec, field, "--json"];
  const opts = { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "ignore"] };
  try {
    const out = npmCli
      ? execFileSync(process.execPath, [npmCli, ...viewArgs], opts)
      : execFileSync("npm", viewArgs, { ...opts, shell: process.platform === "win32" });
    return out.trim() ? JSON.parse(out) : null;
  } catch { return null; }
}
const last = (x) => (Array.isArray(x) ? x[x.length - 1] : x);

const problemes = [];
const notes = [];

// Node requis par Angular
let nodeRequis = ng?.engines?.node ?? null;
if (!nodeRequis && !HOOK) nodeRequis = last(npmView(`@angular/core@${angularStr}`, "engines"))?.node ?? null;
const nodeOk = nodeRequis ? satisfies(nodeNow, nodeRequis) : null;
if (nodeOk === false) problemes.push(`Node ${process.version} ne convient pas à Angular ${angularStr} (requis : ${nodeRequis}). Changer de version de Node.`);

// PrimeNG
const primeInstalled = installed("primeng")?.version ?? null;
let primeReco = null, primeRecoPeer = null;
if (primeInstalled) {
  const peer = installed("primeng")?.peerDependencies?.["@angular/core"];
  if (peer && !satisfies(angularVersion, peer))
    problemes.push(`PrimeNG ${primeInstalled} exige @angular/core ${peer}, le projet est en ${angularStr}. Utiliser la version de PrimeNG alignée sur Angular ${angularMajor}.`);
}
if (!HOOK) {
  primeReco = last(npmView(`primeng@${angularMajor}`, "version"));
  if (!primeReco) {
    problemes.push(`Aucune version de PrimeNG trouvée pour Angular ${angularMajor} (npm injoignable ou version trop récente/ancienne).`);
  } else {
    primeRecoPeer = npmView(`primeng@${primeReco}`, "peerDependencies")?.["@angular/core"] ?? null;
    if (primeRecoPeer && !satisfies(angularVersion, primeRecoPeer))
      problemes.push(`primeng@${primeReco} demande @angular/core ${primeRecoPeer} : la version d'Angular du projet (${angularStr}) est trop ancienne pour cette version. Mettre Angular à jour dans le projet, ou installer une version de PrimeNG plus ancienne.`);
  }
  if (angularMajor < 19) notes.push("Angular < 19 : le thème Aura (@primeuix/themes) n'est pas disponible, PrimeNG utilise les anciens thèmes CSS.");
}

const bootstrapInstalled = installed("bootstrap")?.version ?? null;
const bootstrapReco = HOOK ? null : last(npmView("bootstrap@5", "version"));
const themes = HOOK || angularMajor < 19 ? null : last(npmView("@primeuix/themes", "version"));
const icons = HOOK ? null : last(npmView("primeicons", "version"));

const rapport = {
  projet: root,
  angular: { declare: deps["@angular/core"], installe: ng?.version ?? null },
  node: { actuel: process.version, requis: nodeRequis, ok: nodeOk },
  primeng: { installe: primeInstalled, recommande: primeReco },
  bootstrap: { installe: bootstrapInstalled, recommande: bootstrapReco },
  paquets_a_installer: HOOK ? null : {
    primeng: primeReco, "@primeuix/themes": themes, primeicons: icons, bootstrap: bootstrapReco,
  },
  problemes, notes,
};

if (HOOK) {
  if (problemes.length) process.stdout.write(JSON.stringify({ systemMessage: "⚠️ lelib-angular : " + problemes.join(" ") }));
  process.exit(0);
}
if (AS_JSON) { console.log(JSON.stringify(rapport, null, 2)); process.exit(0); }

const dash = (v) => v ?? "—";
console.log(`Projet Angular : ${root}`);
console.log(`Angular        : ${dash(rapport.angular.installe)} (déclaré ${rapport.angular.declare})`);
console.log(`Node           : ${process.version} — requis par Angular : ${dash(nodeRequis)} ${nodeOk === null ? "" : nodeOk ? "✔" : "✘"}`);
console.log(`PrimeNG        : installé ${dash(primeInstalled)} → recommandé ${dash(primeReco)}`);
console.log(`Bootstrap      : installé ${dash(bootstrapInstalled)} → recommandé ${dash(bootstrapReco)}`);
if (themes) console.log(`@primeuix/themes → ${themes}`);
if (icons) console.log(`primeicons       → ${icons}`);
for (const n of notes) console.log("ℹ " + n);
console.log(problemes.length ? "\nProblèmes :\n" + problemes.map((p) => "✘ " + p).join("\n") : "\n✔ Aucun problème de compatibilité.");
