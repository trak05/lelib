// Exporte une base PostgreSQL (schéma et données) dans db/database/export-<AAAAMMJJ-HHMM>/ à la racine du projet.
// Sans dépendance. Utilise pg_dump : celui d'un conteneur Docker Compose si la base y tourne, sinon un client local.
//
//   node db-export.js [dossier-du-projet] [options]
//     --schema            schéma seulement            --donnees          données seulement
//     --profil <nom>      lit aussi application-<nom>.(properties|yml)
//     --service <nom>     service Docker Compose PostgreSQL à utiliser
//     --autoriser-hote-distant   obligatoire pour une base qui n'est pas locale (accord explicite de l'utilisateur)
//     --dry-run           affiche ce qui serait fait, sans rien écrire     --json   sortie en JSON
//     --horodatage <AAAAMMJJ-HHMM>   impose l'horodatage du dossier (tests)
//
// Variables : LELIB_PG_DUMP et LELIB_DOCKER indiquent un exécutable précis (un script .js est lancé avec node).
// Le mot de passe n'est jamais affiché ni écrit dans un fichier. Code de sortie : 0 si l'export est complet, 1 sinon.
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const VALUE_OPTS = ["--profil", "--service", "--horodatage"];
const positional = args.filter((a, i) => !a.startsWith("--") && !VALUE_OPTS.includes(args[i - 1]));
const AS_JSON = flag("--json");
const DRY = flag("--dry-run");
const start = path.resolve(positional[0] || process.cwd());

function fail(message, extra = {}) {
  if (AS_JSON) console.log(JSON.stringify({ ok: false, erreur: message, ...extra }, null, 2));
  else console.error("✘ " + message);
  process.exit(1);
}
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };

// ---------- racine du projet (racine git, sinon dossier courant) et dossier du back ----------
function gitRoot(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? path.resolve(r.stdout.trim()) : null;
}
const root = gitRoot(start) || start;
const backCandidates = [start, root, ...["backend", "back", "server", "api"].flatMap((d) => [path.join(start, d), path.join(root, d)])];
const backDir = backCandidates.find((d) => ["pom.xml", "build.gradle", "build.gradle.kts"].some((f) => fs.existsSync(path.join(d, f)))) || start;

// ---------- lecture de la configuration ----------
const resolveEnv = (v) => (v == null ? v : String(v).replace(/\$\{([^}:]+)(?::-?([^}]*))?\}/g, (_, n, d) => process.env[n] ?? d ?? ""));
const unquote = (v) => String(v).trim().replace(/^['"]|['"]$/g, "");

function flattenProps(text, isYaml) {
  const out = {};
  if (!isYaml) {
    for (const l of text.split(/\r?\n/)) {
      if (/^\s*[#!]/.test(l) || !l.includes("=")) continue;
      const i = l.indexOf("=");
      out[l.slice(0, i).trim()] = unquote(l.slice(i + 1));
    }
    return out;
  }
  const stack = [];
  for (const l of text.split(/\r?\n/)) {
    if (/^\s*#/.test(l) || !l.trim() || l.trim().startsWith("---")) continue;
    const m = l.match(/^(\s*)([\w.\-\[\]]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const key = [...stack.map((s) => s.key), m[2]].join(".");
    const val = m[3].replace(/\s+#.*$/, "");
    if (val === "") stack.push({ indent, key: m[2] });
    else out[key] = unquote(val);
  }
  return out;
}
function readConfig() {
  const dir = path.join(backDir, "src", "main", "resources");
  const names = ["application"]; if (opt("--profil")) names.push("application-" + opt("--profil"));
  const merged = {};
  for (const n of names) for (const ext of ["properties", "yml", "yaml"]) {
    const t = read(path.join(dir, `${n}.${ext}`));
    if (t != null) Object.assign(merged, flattenProps(t, ext !== "properties"));
  }
  return merged;
}

// Mini-lecteur de docker-compose.yml : le premier service dont l'image contient « postgres ».
function readCompose() {
  for (const d of [backDir, root, start]) {
    for (const f of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
      const file = path.join(d, f);
      const text = read(file);
      if (text == null) continue;
      const lines = text.split(/\r?\n/);
      let inServices = false, current = null;
      const services = {};
      for (const l of lines) {
        if (/^services\s*:/.test(l)) { inServices = true; continue; }
        if (/^\S/.test(l) && inServices) inServices = false;
        if (!inServices) continue;
        const s = l.match(/^  ([\w.\-]+)\s*:\s*$/);
        if (s) { current = services[s[1]] = { name: s[1], lines: [] }; continue; }
        if (current) current.lines.push(l);
      }
      for (const svc of Object.values(services)) {
        const body = svc.lines.join("\n");
        const image = (body.match(/^\s+image\s*:\s*(\S+)/m) || [])[1];
        if (!image || !/postgres/i.test(image)) continue;
        const env = {};
        for (const l of svc.lines) {
          const kv = l.match(/^\s+(?:-\s*)?(POSTGRES_(?:DB|USER|PASSWORD))\s*[:=]\s*(.*)$/);
          if (kv) env[kv[1]] = resolveEnv(unquote(kv[2]));
        }
        const port = (body.match(/^\s+-\s*["']?(?:[\d.]+:)?(\d+):5432["']?/m) || [])[1];
        return { file, service: svc.name, image, db: env.POSTGRES_DB, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, port: port ? Number(port) : 5432 };
      }
    }
  }
  return null;
}

const props = readConfig();
const compose = readCompose();
const url = resolveEnv(props["spring.datasource.url"] || "");
let conn;
if (url) {
  const m = url.match(/^jdbc:postgresql:\/\/([^/:?]*)(?::(\d+))?\/([^?]+)/i);
  if (!m) {
    const kind = (url.match(/^jdbc:(\w+)/i) || [])[1] || "inconnu";
    fail(`La base configurée n'est pas PostgreSQL (jdbc:${kind}) : export non pris en charge. Une base en mémoire (H2) n'existe plus une fois l'application arrêtée.`);
  }
  conn = { host: m[1] || "localhost", port: Number(m[2] || 5432), db: m[3], user: resolveEnv(props["spring.datasource.username"]) || compose?.user, password: resolveEnv(props["spring.datasource.password"]) ?? compose?.password, source: "propriétés Spring" };
} else if (compose) {
  conn = { host: "localhost", port: compose.port, db: compose.db, user: compose.user, password: compose.password, source: "docker-compose" };
} else {
  fail("Aucune base PostgreSQL trouvée : ni spring.datasource.url dans src/main/resources, ni service postgres dans un docker-compose.yml.");
}
if (!conn.db || !conn.user) fail("Nom de base ou utilisateur introuvable dans la configuration.");

// ---------- sécurité : base locale seulement, sauf accord explicite ----------
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres"];
const estLocale = LOCAL_HOSTS.includes(conn.host.toLowerCase()) || (compose && conn.host.toLowerCase() === compose.service.toLowerCase());
if (!estLocale && !flag("--autoriser-hote-distant"))
  fail(`La base est sur un hôte distant (${conn.host}). L'exporter copie des données réelles : demande l'accord explicite de l'utilisateur, puis relance avec --autoriser-hote-distant.`, { hote: conn.host, accordRequis: true });

// ---------- outils ----------
function which(cmd) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    for (const ext of ["", ...exts]) {
      const p = path.join(dir, cmd + ext);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  return null;
}
function findPgDump() {
  if (process.env.LELIB_PG_DUMP) return process.env.LELIB_PG_DUMP;
  const onPath = which("pg_dump");
  if (onPath) return onPath;
  if (process.platform === "win32") {
    const base = path.join(process.env.ProgramFiles || "C:\\Program Files", "PostgreSQL");
    try {
      const v = fs.readdirSync(base).filter((n) => /^\d+/.test(n)).sort((a, b) => parseFloat(b) - parseFloat(a));
      for (const n of v) { const p = path.join(base, n, "bin", "pg_dump.exe"); if (fs.existsSync(p)) return p; }
    } catch { /* pas installé */ }
  }
  return null;
}
function run(bin, argv, opts = {}) {
  const [cmd, cmdArgs] = bin.endsWith(".js") ? [process.execPath, [bin, ...argv]] : [bin, argv];
  return spawnSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}
const docker = process.env.LELIB_DOCKER || which("docker");
let mode = null, composeInfo = null;
if (compose && docker && estLocale) {
  const ps = run(docker, ["compose", "-f", compose.file, "ps", "--status", "running", "--services"]);
  const wanted = opt("--service") || compose.service;
  if (ps.status === 0 && ps.stdout.split(/\r?\n/).map((s) => s.trim()).includes(wanted)) { mode = "docker"; composeInfo = { file: compose.file, service: wanted }; }
}
const pgDump = mode ? null : findPgDump();
if (!mode && pgDump) mode = "client";
if (!mode) {
  const hints = [];
  if (compose && !docker) hints.push("Docker n'est pas installé ou pas dans le PATH");
  else if (compose && docker) hints.push(`le service « ${compose.service} » de ${path.basename(compose.file)} ne tourne pas (docker compose up -d)`);
  hints.push("pg_dump est introuvable (installe les outils clients PostgreSQL, par exemple « winget install PostgreSQL.PostgreSQL.17 », ou indique son chemin avec LELIB_PG_DUMP)");
  fail("Impossible d'exporter : " + hints.join(" ; et ") + ".");
}

// ---------- dossier de sortie ----------
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const stamp = opt("--horodatage") || `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const parent = path.join(root, "db", "database");
let outDir = path.join(parent, `export-${stamp}`);
for (let n = 2; fs.existsSync(outDir); n++) outDir = path.join(parent, `export-${stamp}-${n}`);

const wantSchema = !flag("--donnees") || flag("--schema");
const wantData = !flag("--schema") || flag("--donnees");
const jobs = [];
if (wantSchema) jobs.push({ nom: "schema.sql", options: ["--schema-only"] });
if (wantData) jobs.push({ nom: "donnees.sql", options: ["--data-only"] });
const COMMUN = ["--no-owner", "--no-privileges", "--encoding=UTF8"];

const mask = (s) => String(s).split(String(conn.password || "\u0000")).join("***");
if (DRY) {
  const plan = { ok: true, dryRun: true, mode, base: conn.db, hote: `${conn.host}:${conn.port}`, source: conn.source, dossier: outDir, fichiers: jobs.map((j) => j.nom) };
  if (AS_JSON) console.log(JSON.stringify(plan, null, 2));
  else console.log(`(simulation) mode ${mode} · base ${conn.db} sur ${conn.host}:${conn.port} (${conn.source})\n→ ${outDir}\n  ${plan.fichiers.join(", ")}`);
  process.exit(0);
}

// ---------- export ----------
fs.mkdirSync(outDir, { recursive: true });
const abandon = (msg, extra) => { fs.rmSync(outDir, { recursive: true, force: true }); fail(msg, extra); };
const env = { ...process.env, ...(conn.password ? { PGPASSWORD: conn.password } : {}) };
let version = "";

for (const job of jobs) {
  const dest = path.join(outDir, job.nom);
  let r;
  if (mode === "client") {
    r = run(pgDump, [...job.options, ...COMMUN, "-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.db, "-f", dest], { env });
    if (!version) version = (run(pgDump, ["--version"]).stdout || "").trim();
  } else {
    const tmp = `/tmp/lelib-${stamp}-${job.nom}`;
    const base = ["compose", "-f", composeInfo.file];
    const envArgs = conn.password ? ["-e", `PGPASSWORD=${conn.password}`] : [];
    r = run(docker, [...base, "exec", "-T", ...envArgs, composeInfo.service, "pg_dump", ...job.options, ...COMMUN, "-U", conn.user, "-d", conn.db, "-f", tmp]);
    if (r.status === 0) r = run(docker, [...base, "cp", `${composeInfo.service}:${tmp}`, dest]);
    run(docker, [...base, "exec", "-T", composeInfo.service, "rm", "-f", tmp]);
    if (!version) version = (run(docker, [...base, "exec", "-T", composeInfo.service, "pg_dump", "--version"]).stdout || "").trim();
  }
  if (r.error || r.status !== 0)
    abandon(`pg_dump a échoué pour ${job.nom} : ${mask((r.stderr || r.error?.message || "erreur inconnue").trim().slice(-600))}`);
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) abandon(`${job.nom} est vide ou absent : export abandonné.`);
}

// ---------- vérification et résumé ----------
function inspect(file) {
  const text = fs.readFileSync(file, "utf8");
  const complet = /PostgreSQL database dump complete/.test(text.slice(-2000));
  const tables = {};
  let courant = null;
  for (const l of text.split(/\r?\n/)) {
    const c = l.match(/^COPY\s+(\S+)\s/);
    if (c) { courant = c[1]; tables[courant] = 0; continue; }
    if (courant) { if (l === "\\.") courant = null; else tables[courant]++; }
  }
  return { text, complet, creates: (text.match(/^CREATE TABLE\s/gm) || []).length, tables };
}
const fichiers = [];
let tablesDonnees = {};
let nbCreate = null;
for (const job of jobs) {
  const f = path.join(outDir, job.nom);
  const info = inspect(f);
  if (!info.complet) abandon(`${job.nom} est incomplet (la ligne de fin de pg_dump manque) : export abandonné.`);
  if (job.nom === "schema.sql") { nbCreate = info.creates; if (!info.creates) abandon("schema.sql ne contient aucun CREATE TABLE : la base est vide ou l'export a échoué."); }
  else tablesDonnees = info.tables;
  fichiers.push({ nom: job.nom, octets: fs.statSync(f).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") });
}
const changesets = tablesDonnees["public.databasechangelog"];

const taille = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko");
const gitIgnore = (() => { const r = spawnSync("git", ["-C", root, "check-ignore", "-q", path.join("db", "database", "x")]); return r.status === 0; })();
const lisezmoi = [
  `# Export de la base « ${conn.db} »`, "",
  `- **Date** : ${d.toLocaleString("fr-FR")}`,
  `- **Base** : ${conn.db} sur ${conn.host}:${conn.port} (configuration : ${conn.source})`,
  `- **Méthode** : ${mode === "docker" ? "pg_dump dans le conteneur Docker Compose" : "pg_dump local"}${version ? " · " + version : ""}`,
  `- **Contenu** : ${[wantSchema && "schéma", wantData && "données"].filter(Boolean).join(" et ")}`,
  ...(changesets != null ? [`- **Liquibase** : ${changesets} changeset(s) appliqué(s) au moment de l'export (la table \`databasechangelog\` est incluse)`] : []), "",
  "## Fichiers", "", "| Fichier | Taille | SHA-256 |", "|---|---|---|",
  ...fichiers.map((f) => `| ${f.nom} | ${taille(f.octets)} | \`${f.sha256}\` |`), "",
  ...(Object.keys(tablesDonnees).length ? ["## Lignes par table", "", "| Table | Lignes |", "|---|---|", ...Object.entries(tablesDonnees).map(([t, n]) => `| ${t} | ${n} |`), ""] : []),
  "## Restaurer", "",
  "Sur une base **vide** :", "", "```bash",
  `createdb ${conn.db}_restauration`,
  ...(wantSchema ? [`psql -d ${conn.db}_restauration -f schema.sql`] : []),
  ...(wantData ? [`psql -d ${conn.db}_restauration -f donnees.sql`] : []),
  "```", "",
  "## Attention", "",
  "Ces fichiers contiennent les **données réelles** de la base. Ne les commite pas, ne les envoie pas à un tiers, et supprime-les quand ils ne servent plus.", "",
].join("\n");
fs.writeFileSync(path.join(outDir, "LISEZMOI.md"), lisezmoi);

const rapport = { ok: true, dossier: outDir, mode, base: conn.db, hote: `${conn.host}:${conn.port}`, fichiers, tablesCreees: nbCreate, tablesAvecDonnees: Object.keys(tablesDonnees).length, lignes: Object.values(tablesDonnees).reduce((a, b) => a + b, 0), changesetsLiquibase: changesets ?? null, gitIgnore };
if (AS_JSON) console.log(JSON.stringify(rapport, null, 2));
else {
  console.log(`✔ Export terminé : ${outDir}`);
  for (const f of fichiers) console.log(`   ${f.nom}  ${taille(f.octets)}`);
  console.log(`   ${nbCreate ?? "—"} table(s) dans le schéma · ${rapport.tablesAvecDonnees} avec données · ${rapport.lignes} ligne(s)`);
  if (!gitIgnore) console.log("⚠ db/database/ n'est pas dans le .gitignore : ces fichiers contiennent des données réelles.");
}
