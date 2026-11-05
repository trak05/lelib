// Outils communs aux tests (sans dépendance) : projets factices, lancement des scripts, fausses commandes de test.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPTS = path.join(__dirname, "..", "scripts");
const script = (nom) => path.join(SCRIPTS, nom);

// Projet factice : dossier temporaire avec un .git (racine du projet).
function projet() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lelib-tdd-"));
  fs.mkdirSync(path.join(dir, ".git"));
  return dir;
}
const nettoyer = (dir) => fs.rmSync(dir, { recursive: true, force: true });

function ecrire(dir, relatif, contenu) {
  const f = path.join(dir, relatif);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenu);
  return f;
}

function lancer(nomScript, args, { cwd, env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [script(nomScript), ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, LELIB_TDD: "", LELIB_TDD_IGNORER: "", LELIB_TDD_VALIDITE_H: "", CLAUDE_PROJECT_DIR: "", ...env },
  });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

// Fausses sorties de commandes de test (exemples écrits à la main, proches de Maven surefire, Vitest et tsc).
const SORTIES = {
  vert: { code: 0, texte: "[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0\n[INFO] BUILD SUCCESS\n" },
  mavenRouge: {
    code: 1,
    texte: [
      "[ERROR] Tests run: 2, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.05 s <<< FAILURE! - in fr.x.CompteurServiceTest",
      "[ERROR] refuseUnMotDePasseVide(fr.x.CompteurServiceTest)  Time elapsed: 0.01 s  <<< FAILURE!",
      "org.opentest4j.AssertionFailedError: expected: <true> but was: <false>",
      "[ERROR] Failures: ",
      "[ERROR]   CompteurServiceTest.refuseUnMotDePasseVide:12 expected: <true> but was: <false>",
      "[INFO] BUILD FAILURE",
    ].join("\n"),
  },
  mavenCompilation: {
    code: 1,
    texte: ["[ERROR] COMPILATION ERROR : ", "[ERROR] /x/CompteurServiceTest.java:[5,9] cannot find symbol", "[INFO] BUILD FAILURE"].join("\n"),
  },
  vitestRouge: {
    code: 1,
    texte: [" FAIL  src/app/login.spec.ts > LoginComponent > refuse un mot de passe vide", "AssertionError: expected true to be false", " Test Files  1 failed (1)", "      Tests  1 failed | 2 passed (3)"].join("\n"),
  },
  tscCompilation: { code: 1, texte: "src/app/login.ts(3,10): error TS2304: Cannot find name 'Foo'." },
  inconnue: { code: 3, texte: "" },
};

// Écrit un script qui imprime une sortie fixe et sort avec le code donné ; renvoie la commande à passer à tdd-run.
function fausseCommande(dir, cle) {
  const { code, texte } = SORTIES[cle];
  const f = ecrire(dir, `faux-${cle}.js`, `process.stdout.write(${JSON.stringify(texte)});process.exit(${code});`);
  return [process.execPath, f];
}

// Écrit directement des entrées dans le journal (t : décalage en minutes par rapport à maintenant).
function journal(dir, entrees) {
  const f = path.join(dir, ".lelib", "tdd", "journal.jsonl");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const lignes = entrees.map((e) => JSON.stringify({ t: new Date(Date.now() - (e.il_y_a_min || 0) * 60000).toISOString(), ...e, il_y_a_min: undefined }));
  fs.writeFileSync(f, lignes.join("\n") + "\n");
  return f;
}
const lireJournal = (dir) => {
  const f = path.join(dir, ".lelib", "tdd", "journal.jsonl");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

module.exports = { projet, nettoyer, ecrire, lancer, fausseCommande, journal, lireJournal, script, SORTIES };
