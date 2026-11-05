// Outils des tests de pr-prepare.js : faux gh (état et journal d'appels dans des fichiers) et lancement du script.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const a = require("./aide-git");

const SCRIPT_PR = path.join(__dirname, "..", "scripts", "pr-prepare.js");

const FAUX_GH = `
const fs = require("fs");
const etatFichier = process.env.FAKE_GH_ETAT;
const etat = JSON.parse(fs.readFileSync(etatFichier, "utf8"));
const args = process.argv.slice(2);
const journal = (o) => fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(o) + "\\n");
if (args[0] === "auth") {
  journal({ cmd: "auth" });
  if (etat.auth === false) { console.error("You are not logged into any GitHub hosts. To log in, run: gh auth login"); process.exit(1); }
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "list") {
  journal({ cmd: "list", args, cwd: process.cwd() });
  if (etat.listeErreur) { console.error(etat.listeErreur); process.exit(1); }
  const head = args[args.indexOf("--head") + 1];
  console.log(JSON.stringify((etat.prs || []).filter((p) => p.head === head).map((p) => ({ number: p.number, url: p.url }))));
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "create") {
  const fichier = args[args.indexOf("--body-file") + 1];
  journal({ cmd: "create", args, cwd: process.cwd(), corps: fs.readFileSync(fichier, "utf8"), fichier });
  if (etat.createErreur && (!etat.createErreurDans || process.cwd().includes(etat.createErreurDans))) { console.error(etat.createErreur); process.exit(1); }
  const n = etat.prochain || 1;
  etat.prochain = n + 1;
  fs.writeFileSync(etatFichier, JSON.stringify(etat));
  console.log("Creating pull request...\\nhttps://github.com/o/r/pull/" + n);
  process.exit(0);
}
console.error("commande gh inattendue : " + args.join(" "));
process.exit(1);
`;

// Installe un faux gh dans dossier ; renvoie l'environnement à passer au script et des accesseurs.
function fauxGh(dossier, etat = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const exe = path.join(dossier, "faux-gh.js");
  const etatFichier = path.join(dossier, "etat.json");
  const log = path.join(dossier, "journal.jsonl");
  fs.writeFileSync(exe, FAUX_GH);
  fs.writeFileSync(etatFichier, JSON.stringify(etat));
  fs.writeFileSync(log, "");
  return {
    env: { LELIB_GH: exe, FAKE_GH_ETAT: etatFichier, FAKE_GH_LOG: log },
    appels: (cmd) => fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => !cmd || e.cmd === cmd),
    definir: (nouveau) => fs.writeFileSync(etatFichier, JSON.stringify({ ...JSON.parse(fs.readFileSync(etatFichier, "utf8")), ...nouveau })),
  };
}

function lancerPr(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT_PR, ...args], { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}
function jsonPr(cwd, args, env) {
  const r = lancerPr(cwd, [...args, "--json"], env);
  let donnees = null;
  try { donnees = JSON.parse(r.out); } catch { /* sortie non JSON */ }
  return { code: r.code, json: donnees, out: r.out, err: r.err };
}

module.exports = { ...a, fauxGh, lancerPr, jsonPr };
