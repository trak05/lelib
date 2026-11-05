const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const a = require("./aide");

test("une commande qui réussit est enregistrée VERT et garde son code de sortie", () => {
  const p = a.projet();
  try {
    const r = a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: p });
    assert.equal(r.code, 0);
    assert.match(r.err, /\[tdd\] VERT/);
    const [e] = a.lireJournal(p);
    assert.equal(e.etat, "vert");
    assert.equal(e.code, 0);
    assert.equal(e.cause, undefined);
  } finally { a.nettoyer(p); }
});

test("un échec Maven est ROUGE (assertion) et relève le test en échec", () => {
  const p = a.projet();
  try {
    const r = a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "mavenRouge")], { cwd: p });
    assert.equal(r.code, 1, "le code de la commande de test est propagé");
    assert.match(r.out, /AssertionFailedError/, "la sortie des tests reste visible");
    const [e] = a.lireJournal(p);
    assert.equal(e.etat, "rouge");
    assert.equal(e.cause, "assertion");
    assert.ok(e.echecs.includes("fr.x.CompteurServiceTest.refuseUnMotDePasseVide"), JSON.stringify(e.echecs));
    assert.ok(e.echecs.includes("CompteurServiceTest.refuseUnMotDePasseVide"), JSON.stringify(e.echecs));
  } finally { a.nettoyer(p); }
});

test("un échec Vitest est ROUGE (assertion) avec le nom du test", () => {
  const p = a.projet();
  try {
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vitestRouge")], { cwd: p });
    const [e] = a.lireJournal(p);
    assert.equal(e.cause, "assertion");
    assert.deepEqual(e.echecs, ["src/app/login.spec.ts > LoginComponent > refuse un mot de passe vide"]);
  } finally { a.nettoyer(p); }
});

test("une erreur de compilation est classée compilation, pas assertion", () => {
  const p = a.projet();
  try {
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "mavenCompilation")], { cwd: p });
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "tscCompilation")], { cwd: p });
    assert.deepEqual(a.lireJournal(p).map((e) => e.cause), ["compilation", "compilation"]);
  } finally { a.nettoyer(p); }
});

test("un échec qui ne ressemble pas à un test est de cause inconnue et signalé", () => {
  const p = a.projet();
  try {
    const r = a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "inconnue")], { cwd: p });
    assert.equal(r.code, 3);
    assert.equal(a.lireJournal(p)[0].cause, "inconnue");
    assert.match(r.err, /pas un rouge valide/);
  } finally { a.nettoyer(p); }
});

test("une commande introuvable n'est pas un rouge valide", () => {
  const p = a.projet();
  try {
    const r = a.lancer("tdd-run.js", ["--", "commande-qui-nexiste-pas-xyz"], { cwd: p });
    assert.notEqual(r.code, 0);
    assert.equal(a.lireJournal(p)[0].cause, "inconnue");
  } finally { a.nettoyer(p); }
});

test("le journal est à la racine du projet même depuis un sous-dossier, et s'ignore dans git", () => {
  const p = a.projet();
  try {
    const sous = path.join(p, "backend", "src");
    fs.mkdirSync(sous, { recursive: true });
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: sous });
    assert.equal(a.lireJournal(p).length, 1);
    assert.equal(fs.readFileSync(path.join(p, ".lelib", "tdd", ".gitignore"), "utf8"), "*\n");
    assert.ok(!fs.existsSync(path.join(sous, ".lelib")));
  } finally { a.nettoyer(p); }
});

test("une commande donnée en une seule chaîne est exécutée telle quelle", () => {
  const p = a.projet();
  try {
    const f = a.fausseCommande(p, "vert");
    const r = a.lancer("tdd-run.js", ["--", `"${f[0]}" "${f[1]}"`], { cwd: p });
    assert.equal(r.code, 0);
    assert.equal(a.lireJournal(p)[0].etat, "vert");
  } finally { a.nettoyer(p); }
});

test("--refactor est refusé tant que les tests ne sont pas verts, accepté ensuite", () => {
  const p = a.projet();
  try {
    let r = a.lancer("tdd-run.js", ["--refactor"], { cwd: p });
    assert.equal(r.code, 1, "aucun lancement");
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "mavenRouge")], { cwd: p });
    r = a.lancer("tdd-run.js", ["--refactor"], { cwd: p });
    assert.equal(r.code, 1, "dernier lancement rouge");
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: p });
    r = a.lancer("tdd-run.js", ["--refactor"], { cwd: p });
    assert.equal(r.code, 0);
    assert.equal(a.lireJournal(p).at(-1).marqueur, "refactor");
  } finally { a.nettoyer(p); }
});

test("--bilan compte les cycles rouge → vert et signale l'absence de rouge", () => {
  const p = a.projet();
  try {
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: p });
    let b = JSON.parse(a.lancer("tdd-run.js", ["--bilan", "--json"], { cwd: p }).out);
    assert.equal(b.rougesValides, 0);
    assert.equal(b.cyclesComplets, 0);
    assert.ok(b.alertes.some((x) => /premier lancement est déjà vert/.test(x)), b.alertes.join(" | "));
    assert.ok(b.alertes.some((x) => /Aucun test rouge valide/.test(x)));

    a.lancer("tdd-run.js", ["--reset"], { cwd: p });
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "mavenRouge")], { cwd: p });
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: p });
    a.lancer("tdd-run.js", ["--refactor"], { cwd: p });
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: p });
    b = JSON.parse(a.lancer("tdd-run.js", ["--bilan", "--json"], { cwd: p }).out);
    assert.deepEqual([b.lancements, b.rougesValides, b.verts, b.cyclesComplets, b.refactors], [3, 1, 2, 1, 1]);
    assert.deepEqual(b.alertes, []);
  } finally { a.nettoyer(p); }
});

test("--bilan en texte : alerte si le dernier lancement est rouge", () => {
  const p = a.projet();
  try {
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "mavenRouge")], { cwd: p });
    const r = a.lancer("tdd-run.js", ["--bilan"], { cwd: p });
    assert.equal(r.code, 0);
    assert.match(r.out, /ROUGE \(assertion\)/);
    assert.match(r.out, /Le dernier lancement est rouge/);
  } finally { a.nettoyer(p); }
});

test("--bilan sans journal : alerte, pas d'erreur", () => {
  const p = a.projet();
  try {
    const r = a.lancer("tdd-run.js", ["--bilan"], { cwd: p });
    assert.equal(r.code, 0);
    assert.match(r.out, /TDD n'est pas démontré/);
  } finally { a.nettoyer(p); }
});

test("--reset vide le journal", () => {
  const p = a.projet();
  try {
    a.lancer("tdd-run.js", ["--", ...a.fausseCommande(p, "vert")], { cwd: p });
    assert.equal(a.lireJournal(p).length, 1);
    a.lancer("tdd-run.js", ["--reset"], { cwd: p });
    assert.equal(a.lireJournal(p).length, 0);
  } finally { a.nettoyer(p); }
});

test("sans commande : usage et code 2", () => {
  const p = a.projet();
  try {
    const r = a.lancer("tdd-run.js", [], { cwd: p });
    assert.equal(r.code, 2);
    assert.match(r.err, /Usage/);
  } finally { a.nettoyer(p); }
});

test("une ligne abîmée dans le journal est ignorée", () => {
  const p = a.projet();
  try {
    a.journal(p, [{ cmd: "x", code: 1, etat: "rouge", cause: "assertion", echecs: [] }]);
    fs.appendFileSync(path.join(p, ".lelib", "tdd", "journal.jsonl"), "{pas du json\n");
    const b = JSON.parse(a.lancer("tdd-run.js", ["--bilan", "--json"], { cwd: p }).out);
    assert.equal(b.rougesValides, 1);
  } finally { a.nettoyer(p); }
});
