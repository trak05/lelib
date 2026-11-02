// Contrôle les migrations Liquibase (SQL formaté) d'un projet par rapport à la branche de base.
// Sans dépendance. Les migrations déjà présentes dans la branche de base sont considérées comme
// appliquées : elles ne doivent ni changer, ni disparaître, ni être renommées.
//
//   node check-migrations.js [dossier-du-projet] [--base <réf git>] [--dir <dossier des changesets>] [--json]
//
// Code de sortie : 0 s'il n'y a aucune erreur (les avertissements ne bloquent pas), 1 sinon.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((a, i) => !a.startsWith("--") && !["--base", "--dir"].includes(args[i - 1]));
const start = path.resolve(positional[0] || process.cwd());

const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const gitOk = (cwd, ...a) => { try { return git(cwd, ...a); } catch { return null; } };
const normalize = (s) => s.replace(/\r\n/g, "\n");

// ---------- racine git et dossier des changesets ----------
const gitRoot = gitOk(start, "rev-parse", "--show-toplevel");
if (!gitRoot) fail("Ce dossier n'est pas dans un dépôt git : impossible de savoir quelles migrations sont déjà appliquées.");
const root = path.resolve(gitRoot.trim());

function findChangesDir() {
  const given = flag("--dir");
  if (given) return path.resolve(start, given);
  const SKIP = new Set(["node_modules", "target", "build", "dist", ".git", ".idea", ".angular"]);
  const found = [];
  (function walk(dir, depth) {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (p.replace(/\\/g, "/").endsWith("db/changelog/changes")) found.push(p);
      else walk(p, depth + 1);
    }
  })(start, 0);
  return found[0] || null;
}
const dir = findChangesDir();
if (!dir) fail("Aucun dossier db/changelog/changes trouvé (utilise --dir pour l'indiquer).");
const relDir = path.relative(root, dir).replace(/\\/g, "/");

// ---------- branche de base ----------
const candidates = [flag("--base"), "origin/main", "origin/master", "main", "master"].filter(Boolean);
let base = candidates.find((r) => gitOk(root, "rev-parse", "--verify", "--quiet", r + "^{commit}") !== null) || null;
const avertissements = [];
const erreurs = [];
if (!base) {
  base = "HEAD";
  avertissements.push("Aucune branche de base trouvée (origin/main, main…) : les migrations déjà commitées sont considérées comme appliquées.");
}

// ---------- fichiers de la base et fichiers actuels ----------
const inBase = new Set();
const baseList = gitOk(root, "ls-tree", "-r", "--name-only", base, "--", relDir);
for (const f of (baseList || "").split("\n").filter(Boolean)) inBase.add(f);
const here = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()) : [];
const hereRel = new Set(here.map((f) => `${relDir}/${f}`));

const NOM_VALIDE = /^(\d{12})-[a-z0-9]+(-[a-z0-9]+)+\.sql$/;
const existants = [...inBase].map((f) => path.posix.basename(f)).sort();
const nouveaux = here.filter((f) => !inBase.has(`${relDir}/${f}`)).sort();

// 1. Une migration déjà appliquée ne change pas, ne disparaît pas, n'est pas renommée.
for (const f of inBase) {
  const name = path.posix.basename(f);
  if (!hereRel.has(f)) { erreurs.push(`${name} : migration déjà appliquée, supprimée ou renommée. Ne touche jamais à une migration existante : écris-en une nouvelle.`); continue; }
  const before = normalize(gitOk(root, "show", `${base}:${f}`) ?? "");
  const now = normalize(fs.readFileSync(path.join(root, f), "utf8"));
  if (before !== now) erreurs.push(`${name} : migration déjà appliquée et modifiée (le checksum Liquibase changera et le démarrage échouera). Remets-la à l'identique et écris une nouvelle migration.`);
}

// 2. Règles sur les nouvelles migrations.
const lastExisting = existants.map((f) => (f.match(/^(\d{12})-/) || [])[1]).filter(Boolean).sort().pop();
const seen = new Map();
for (const name of nouveaux) {
  const text = normalize(fs.readFileSync(path.join(dir, name), "utf8"));
  const lines = text.split("\n");
  const m = name.match(NOM_VALIDE);

  if (!m) erreurs.push(`${name} : nom non conforme. Attendu : AAAAMMJJHHMM-verbe-objet.sql (minuscules, tirets), par exemple 202611021015-create-table-compteurs-gaz.sql.`);
  else {
    const ts = m[1];
    if (lastExisting && ts <= lastExisting) erreurs.push(`${name} : horodatage ${ts} pas plus récent que la dernière migration existante (${lastExisting}). Les migrations s'appliquent dans l'ordre des noms.`);
    if (seen.has(ts)) erreurs.push(`${name} : même horodatage que ${seen.get(ts)}.`);
    seen.set(ts, name);
  }

  if (!/^--\s*liquibase formatted sql\s*$/i.test(lines[0] || "")) erreurs.push(`${name} : la première ligne doit être « --liquibase formatted sql ».`);

  const changesets = lines.filter((l) => /^--\s*changeset\s/i.test(l));
  if (changesets.length === 0) erreurs.push(`${name} : aucun « --changeset auteur:id ».`);
  if (changesets.length > 1) erreurs.push(`${name} : ${changesets.length} changesets dans un seul fichier. Une migration = un changement.`);
  const cs = changesets[0];
  const csm = cs && cs.match(/^--\s*changeset\s+([^:\s]+):(\S+)(.*)$/i);
  if (cs && !csm) erreurs.push(`${name} : changeset mal formé (attendu « --changeset auteur:id »).`);
  if (csm && m && csm[2] !== name.replace(/\.sql$/, "")) erreurs.push(`${name} : l'id du changeset (« ${csm[2]} ») doit être le nom du fichier sans extension.`);
  const csOptions = csm ? csm[3] : "";

  const rollback = lines.some((l) => /^--\s*rollback\s+\S/i.test(l));
  const sansRollback = lines.find((l) => /^--\s*sans-rollback:\s*\S/i.test(l));
  if (!rollback && !sansRollback) erreurs.push(`${name} : pas de rollback. Ajoute « --rollback <SQL inverse> » (ou, si c'est vraiment irréversible, « -- sans-rollback: <raison> »).`);
  if (!rollback && sansRollback) avertissements.push(`${name} : migration irréversible déclarée (${sansRollback.replace(/^--\s*sans-rollback:\s*/i, "").trim()}). Liquibase refusera de la défaire.`);

  const sql = lines.filter((l) => !/^\s*--/.test(l)).join("\n");
  if (/\bCREATE\s+(UNIQUE\s+)?INDEX\b(?!\s+CONCURRENTLY)/i.test(sql)) avertissements.push(`${name} : CREATE INDEX sans CONCURRENTLY (verrou en écriture sur la table). À éviter sur une table déjà remplie.`);
  if (/\bCONCURRENTLY\b/i.test(sql) && !/runInTransaction\s*:\s*false/i.test(csOptions)) erreurs.push(`${name} : CONCURRENTLY exige « runInTransaction:false » sur la ligne --changeset, sinon PostgreSQL refuse de l'exécuter.`);
  if (/\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE)\b/i.test(sql)) avertissements.push(`${name} : opération destructive (DROP ou TRUNCATE). Sauvegarde vérifiée et accord explicite requis.`);
  if (/\bDELETE\s+FROM\s+\S+\s*;/i.test(sql)) avertissements.push(`${name} : DELETE sans WHERE.`);
}

// 3. Le fichier maître inclut bien le dossier.
const masterDir = path.dirname(dir);
const masters = fs.existsSync(masterDir) ? fs.readdirSync(masterDir).filter((f) => /^db\.changelog-master\.(ya?ml|xml)$/.test(f)) : [];
if (!masters.length) avertissements.push(`Aucun db.changelog-master.(yaml|xml) à côté de ${path.basename(dir)}/ : Liquibase ne trouvera pas les migrations.`);
else if (!/includeAll/.test(fs.readFileSync(path.join(masterDir, masters[0]), "utf8"))) avertissements.push(`${masters[0]} n'utilise pas includeAll : chaque nouvelle migration doit y être ajoutée à la main.`);

// ---------- sortie ----------
const rapport = { base, dossier: relDir, existantes: existants.length, nouvelles: nouveaux, erreurs, avertissements };
if (AS_JSON) console.log(JSON.stringify(rapport, null, 2));
else {
  console.log(`Dossier : ${relDir}   Base : ${base}`);
  console.log(`${existants.length} migration(s) déjà appliquée(s), ${nouveaux.length} nouvelle(s)${nouveaux.length ? " : " + nouveaux.join(", ") : ""}`);
  for (const e of erreurs) console.log("✘ " + e);
  for (const a of avertissements) console.log("⚠ " + a);
  console.log(erreurs.length ? `\n${erreurs.length} erreur(s).` : "\n✔ Aucune erreur.");
}
process.exit(erreurs.length ? 1 : 0);

function fail(message) {
  if (AS_JSON) console.log(JSON.stringify({ erreurs: [message] }));
  else console.error("✘ " + message);
  process.exit(1);
}
