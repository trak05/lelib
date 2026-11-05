// Fonctions partagées par tdd-run.js, tdd-garde.js et check-criteres.js.
// Sans dépendance. Le journal vit dans <racine du projet>/.lelib/tdd/journal.jsonl.
const fs = require("fs");
const path = require("path");

const VALIDITE_H_DEFAUT = 8;

// Racine du projet : premier dossier parent qui contient .git, sinon le dossier de départ.
function racineProjet(depart) {
  let dir = path.resolve(depart || process.cwd());
  const origine = dir;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return origine;
    dir = parent;
  }
}

const dossierJournal = (racine) => path.join(racine, ".lelib", "tdd");
const cheminJournal = (racine) => path.join(dossierJournal(racine), "journal.jsonl");

// Lit le journal : une entrée JSON par ligne, les lignes illisibles sont ignorées.
function lireJournal(racine) {
  let texte;
  try { texte = fs.readFileSync(cheminJournal(racine), "utf8"); } catch { return []; }
  const entrees = [];
  for (const ligne of texte.split("\n")) {
    if (!ligne.trim()) continue;
    try {
      const e = JSON.parse(ligne);
      if (e && typeof e === "object" && !Number.isNaN(Date.parse(e.t))) entrees.push(e);
    } catch { /* ligne abîmée : ignorée */ }
  }
  return entrees;
}

function ajouterAuJournal(racine, entree) {
  const dir = dossierJournal(racine);
  fs.mkdirSync(dir, { recursive: true });
  // Le dossier s'ignore lui-même dans git : aucun .gitignore de projet à modifier.
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  fs.appendFileSync(cheminJournal(racine), JSON.stringify({ t: new Date().toISOString(), ...entree }) + "\n");
}

function viderJournal(racine) {
  try { fs.unlinkSync(cheminJournal(racine)); return true; } catch { return false; }
}

// Cause d'un échec de commande de test : "assertion" (vrai rouge), "compilation" (code ou test qui ne
// compile pas : classe ou fonction absente) ou "inconnue" (la commande a échoué, mais pas comme un test).
function classerEchec(sortie) {
  const compilationForte = /COMPILATION ERROR/.test(sortie);
  const assertion = /Tests run:.*(Failures|Errors): [1-9]|AssertionError|AssertionFailedError|Tests:\s+(\d+ failed|.*\d+ failed)|^\s*FAIL\b|✗|×|\(\d+ FAILED\)|expected .{0,80} (to|but)|Expected:.*[\r\n]+\s*Received:/m.test(sortie);
  const compilation = /COMPILATION ERROR|cannot find symbol|error TS\d+|Cannot find module|Module not found|SyntaxError|Could not resolve|could not be resolved/i.test(sortie);
  if (assertion && !compilationForte) return "assertion";
  if (compilation) return "compilation";
  if (assertion) return "assertion";
  return "inconnue";
}

// Noms des tests en échec, relevés dans les sorties Maven (surefire), Vitest / Jest et Karma.
function testsEnEchec(sortie) {
  const noms = new Set();
  for (const m of sortie.matchAll(/^\[ERROR\]\s+([\w$]+)\(([\w.$]+)\)\s+.*<<<\s+(?:FAILURE|ERROR)/gm)) noms.add(`${m[2]}.${m[1]}`);
  for (const m of sortie.matchAll(/^\[ERROR\]\s{2,}([A-Za-z_][\w$]*(?:\.[\w$]+)*[.#][\w$]+)(?::\d+)?\s/gm)) noms.add(m[1]);
  for (const m of sortie.matchAll(/^\s*FAIL\s+(.+?)\s*$/gm)) noms.add(m[1].trim());
  for (const m of sortie.matchAll(/^\s*[✗×✕]\s+(.+?)\s*$/gm)) noms.add(m[1].trim());
  for (const m of sortie.matchAll(/^.*?\)\s+(.+?)\s+FAILED\s*$/gm)) noms.add(m[1].trim());
  return [...noms].slice(0, 20);
}

// Un rouge est valide quand il vient d'un échec de test ou d'une compilation manquante (cas normal en Java).
const rougeValide = (e) => e && e.etat === "rouge" && (e.cause === "assertion" || e.cause === "compilation");

module.exports = { racineProjet, cheminJournal, lireJournal, ajouterAuJournal, viderJournal, classerEchec, testsEnEchec, rougeValide, VALIDITE_H_DEFAUT };
