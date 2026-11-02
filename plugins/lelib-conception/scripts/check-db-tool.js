// Vérifie qu'un projet Java utilise Liquibase, l'outil de schéma standard de la marketplace lelib.
// Signale : Flyway, spring.jpa.hibernate.ddl-auto à update / create / create-drop, et un projet JPA sans Liquibase.
// Sans dépendance, lecture seule, sans réseau.
//
//   node check-db-tool.js [dossier]          rapport en texte
//   node check-db-tool.js [dossier] --json   rapport en JSON
//   node check-db-tool.js --hook             pour SessionStart : silencieux si tout va bien
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const HOOK = args.includes("--hook");
const AS_JSON = args.includes("--json");
const dirArg = args.find((a) => !a.startsWith("--"));
const base = dirArg ? path.resolve(dirArg) : process.env.CLAUDE_PROJECT_DIR || process.cwd();

const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const BUILD_FILES = ["pom.xml", "build.gradle", "build.gradle.kts"];

// Dossier du back : la racine, ou un sous-dossier courant.
const candidates = [base, ...["backend", "back", "server", "api", "service"].map((d) => path.join(base, d))];
let root = null;
let build = "";
for (const dir of candidates) {
  const texts = BUILD_FILES.map((f) => read(path.join(dir, f))).filter(Boolean);
  if (texts.length) { root = dir; build = texts.join("\n"); break; }
}
if (!root) { if (!HOOK) console.log(AS_JSON ? JSON.stringify({ erreur: "Aucun projet Maven ou Gradle trouvé" }) : "Aucun projet Maven ou Gradle trouvé dans " + base); process.exit(0); }

const has = (re) => re.test(build);
const usesJpa = has(/spring-boot-starter-data-jpa|spring-data-jpa|hibernate-core|jakarta\.persistence/i);
const hasLiquibase = has(/liquibase/i);
const hasFlyway = has(/flyway/i);

// Valeurs de ddl-auto dans les fichiers de configuration (lignes commentées ignorées).
const resources = path.join(root, "src", "main", "resources");
const ddl = [];
if (fs.existsSync(resources)) {
  for (const f of fs.readdirSync(resources).filter((n) => /^application.*\.(properties|ya?ml)$/.test(n))) {
    const text = read(path.join(resources, f)) || "";
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*[#!]/.test(line)) continue;
      const m = line.match(/ddl-auto\s*[=:]\s*['"]?([\w-]+)/i);
      if (m) ddl.push({ fichier: f, valeur: m[1].toLowerCase() });
    }
  }
}
const ddlInterdit = ddl.filter((d) => ["update", "create", "create-drop"].includes(d.valeur));

// Un projet qui ne touche ni à JPA, ni à une base, ni à un outil de migration n'est pas concerné.
const concerne = usesJpa || hasFlyway || hasLiquibase || ddl.length > 0;

const problemes = [];
if (concerne) {
  if (hasFlyway) problemes.push("Flyway détecté : la marketplace standardise Liquibase.");
  else if (usesJpa && !hasLiquibase) problemes.push("Pas de Liquibase alors que le projet utilise JPA : le schéma doit être versionné avec Liquibase (skill /db-migration).");
  for (const d of ddlInterdit) problemes.push(`ddl-auto=${d.valeur} dans ${d.fichier} : le schéma doit être piloté par Liquibase, avec ddl-auto=validate.`);
}

const rapport = { projet: root, jpa: usesJpa, liquibase: hasLiquibase, flyway: hasFlyway, ddlAuto: ddl, problemes };

if (HOOK) {
  if (problemes.length) process.stdout.write(JSON.stringify({ systemMessage: "⚠️ lelib-conception : " + problemes.join(" ") }));
  process.exit(0);
}
if (AS_JSON) { console.log(JSON.stringify(rapport, null, 2)); process.exit(0); }
console.log(`Projet : ${root}`);
console.log(`JPA : ${usesJpa ? "oui" : "non"}   Liquibase : ${hasLiquibase ? "oui" : "non"}   Flyway : ${hasFlyway ? "oui" : "non"}`);
if (ddl.length) console.log("ddl-auto : " + ddl.map((d) => `${d.valeur} (${d.fichier})`).join(", "));
console.log(problemes.length ? "\n" + problemes.map((p) => "✘ " + p).join("\n") : concerne ? "\n✔ Liquibase est bien l'outil de schéma." : "\n✔ Projet non concerné (pas de JPA ni d'outil de migration).");
