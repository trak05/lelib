const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const a = require("./aide-git");

// Projet à un seul dépôt : tickets/ dans le dépôt (non suivi), distant nu, develop poussé.
function projet(options = {}) {
  const racine = a.racineTemp();
  const { distant, clone } = a.depotAvecDistant(racine);
  a.ecrire(clone, "tickets/bet-007.md", a.ticket(options));
  return { racine, distant, clone };
}
const branche = (clone) => a.git(clone, "rev-parse", "--abbrev-ref", "HEAD");
const fichiersDuCommit = (clone, ref = "HEAD") => a.git(clone, "-c", "core.quotepath=off", "show", "--name-only", "--format=", ref).split("\n").filter(Boolean).sort();
const branchesDistantes = (distant) => a.git(distant, "branch", "--list").split("\n").map((s) => s.replace(/^[*\s]+/, "")).filter(Boolean);

// ---------- preparer ----------

test("preparer : feature-bet-007 est tirée d'un develop mis à jour par un pull", () => {
  const p = projet();
  try {
    a.pousserSurDevelop(p.distant, p.racine);
    assert.ok(!fs.existsSync(path.join(p.clone, "autre.txt")), "avant : develop local est en retard");
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(branche(p.clone), "feature-bet-007");
    assert.ok(fs.existsSync(path.join(p.clone, "autre.txt")), "le commit du collègue est dans la branche");
    assert.deepEqual([r.json.resultats[0].etat, r.json.resultats[0].pull, r.json.ticket.branche], ["creee", "ok", "feature-bet-007"]);
    assert.equal(a.git(p.clone, "rev-parse", "develop"), a.git(p.clone, "rev-parse", "origin/develop"), "develop local = distant");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : develop déjà à jour", () => {
  const p = projet();
  try {
    assert.equal(a.json(p.clone, ["preparer", "bet-007"]).json.resultats[0].pull, "deja-a-jour");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : préfixe fix pour une anomalie, feature pour le reste, id en minuscules", () => {
  for (const [type, id, attendu] of [["anomalie", "bet-007", "fix-bet-007"], ["fonctionnalité", "bet-007", "feature-bet-007"], ["technique", "bet-007", "feature-bet-007"], ["fonctionnalité", "BET-007", "feature-bet-007"], ["Anomalie", "OPA-012", "fix-opa-012"]]) {
    const racine = a.racineTemp();
    try {
      const { clone } = a.depotAvecDistant(racine);
      a.ecrire(clone, "tickets/bet-007.md", a.ticket({ type, id }));
      const r = a.json(clone, ["preparer", "bet-007"]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.equal(branche(clone), attendu, `${type} ${id}`);
    } finally { a.nettoyer(racine); }
  }
});

test("preparer : le ticket se désigne par numéro, identifiant ou chemin", () => {
  for (const cible of ["7", "007", "bet-007", "BET-007", "tickets/bet-007.md"]) {
    const p = projet();
    try {
      const r = a.json(p.clone, ["preparer", cible]);
      assert.equal(r.code, 0, `${cible} : ${r.out}${r.err}`);
      assert.equal(branche(p.clone), "feature-bet-007", cible);
    } finally { a.nettoyer(p.racine); }
  }
});

test("preparer : ticket introuvable ou déjà terminé : code 2, aucune branche", () => {
  const p = projet();
  try {
    assert.equal(a.json(p.clone, ["preparer", "bet-099"]).code, 2);
    fs.renameSync(path.join(p.clone, "tickets", "bet-007.md"), a.ecrire(p.clone, "tickets/done/bet-007.md", a.ticket()));
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 2);
    assert.match(r.json.erreur, /terminé/);
    assert.equal(branche(p.clone), "develop");
    assert.equal(a.lancer(p.clone, []).code, 2, "sans argument : usage");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : un arbre non propre est refusé, rien n'est touché", () => {
  const p = projet();
  try {
    fs.appendFileSync(path.join(p.clone, "README.md"), "modif en cours\n");
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.equal(r.json.resultats[0].etat, "refuse");
    assert.match(r.json.resultats[0].erreur, /README\.md/);
    assert.match(r.json.resultats[0].erreur, /rien n'est caché/);
    assert.equal(branche(p.clone), "develop");
    assert.equal(a.git(p.clone, "branch", "--list", "feature-bet-007"), "", "aucune branche créée");
    assert.match(fs.readFileSync(path.join(p.clone, "README.md"), "utf8"), /modif en cours/, "la modification est intacte");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : les fichiers de tickets/ (suivis ou non) ne comptent pas comme sales", () => {
  const racine = a.racineTemp();
  try {
    const { clone } = a.depotAvecDistant(racine);
    a.ecrire(clone, "tickets/bet-001.md", a.ticket({ id: "bet-001" }));
    a.git(clone, "add", "-A");
    a.git(clone, "commit", "-m", "ticket");
    a.git(clone, "push");
    fs.appendFileSync(path.join(clone, "tickets", "bet-001.md"), "statut modifié\n");
    a.ecrire(clone, "tickets/bet-007.md", a.ticket());
    const r = a.json(clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
  } finally { a.nettoyer(racine); }
});

test("preparer : fichier non suivi hors tickets/ : avertissement, branche créée", () => {
  const p = projet();
  try {
    a.ecrire(p.clone, "notes-perso.txt", "à moi\n");
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 0);
    assert.match(r.json.resultats[0].avertissements.join(" "), /non suivi.*notes-perso\.txt.*pas ajoutés au commit/);
    assert.equal(branche(p.clone), "feature-bet-007");
    assert.equal(a.git(p.clone, "status", "--short", "--ignored").split("\n").filter((l) => /\.lelib/.test(l) && !l.startsWith("!!")).length, 0, "le dossier .lelib ne salit pas git");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : develop introuvable : erreur sans repli ; --base choisit une autre base", () => {
  const racine = a.racineTemp();
  try {
    const { clone, distant } = a.depotAvecDistant(racine);
    a.git(clone, "branch", "-m", "develop", "main");
    a.git(clone, "push", "-u", "origin", "main");
    a.git(distant, "symbolic-ref", "HEAD", "refs/heads/main");
    a.git(clone, "push", "origin", "--delete", "develop");
    a.ecrire(clone, "tickets/bet-007.md", a.ticket());
    const r = a.json(clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.match(r.json.resultats[0].erreur, /develop introuvable.*pas de repli/);
    assert.equal(branche(clone), "main");
    const ok = a.json(clone, ["preparer", "bet-007", "--base", "main"]);
    assert.equal(ok.code, 0, ok.out + ok.err);
    assert.equal(branche(clone), "feature-bet-007");
  } finally { a.nettoyer(racine); }
});

test("preparer : une branche existante est reprise sans pull ni recréation", () => {
  const p = projet();
  try {
    a.git(p.clone, "checkout", "-b", "feature-bet-007");
    a.ecrire(p.clone, "travail.txt", "déjà commencé\n");
    a.git(p.clone, "add", "travail.txt");
    a.git(p.clone, "commit", "-m", "début du travail");
    const sha = a.git(p.clone, "rev-parse", "HEAD");
    a.git(p.clone, "checkout", "develop");
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(r.json.resultats[0].etat, "reprise");
    assert.match(r.json.resultats[0].avertissements.join(" "), /existait déjà.*n'y est pas fusionné/);
    assert.equal(branche(p.clone), "feature-bet-007");
    assert.equal(a.git(p.clone, "rev-parse", "HEAD"), sha, "la branche n'a pas été modifiée");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : sans dépôt distant, la branche part du develop local avec un avertissement", () => {
  const p = projet();
  try {
    a.git(p.clone, "remote", "remove", "origin");
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(r.json.resultats[0].pull, "ignore");
    assert.match(r.json.resultats[0].avertissements.join(" "), /aucun dépôt distant/);
    assert.equal(branche(p.clone), "feature-bet-007");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : develop local divergent : pull refusé, on revient où l'on était, rien n'est fusionné", () => {
  const p = projet();
  try {
    a.pousserSurDevelop(p.distant, p.racine);
    a.ecrire(p.clone, "local.txt", "commit local non poussé\n");
    a.git(p.clone, "add", "local.txt");
    a.git(p.clone, "commit", "-m", "commit local");
    const shaDevelop = a.git(p.clone, "rev-parse", "develop");
    a.git(p.clone, "checkout", "-b", "autre-branche");
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.match(r.json.resultats[0].erreur, /pull --ff-only.*divergé.*Rien n'a été fusionné/);
    assert.equal(branche(p.clone), "autre-branche", "retour à la branche d'origine");
    assert.equal(a.git(p.clone, "rev-parse", "develop"), shaDevelop, "develop local intact");
    assert.equal(a.git(p.clone, "branch", "--list", "feature-bet-007"), "");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : fetch impossible : refusé, on ne devine pas que develop est à jour", () => {
  const p = projet();
  try {
    a.nettoyer(p.distant);
    const r = a.json(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.match(r.json.resultats[0].erreur, /git fetch impossible/);
    assert.equal(a.git(p.clone, "branch", "--list", "feature-bet-007"), "");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : lancé depuis un sous-dossier du dépôt", () => {
  const p = projet();
  try {
    const sous = path.join(p.clone, "src", "main");
    fs.mkdirSync(sous, { recursive: true });
    const r = a.json(sous, ["preparer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(branche(p.clone), "feature-bet-007");
  } finally { a.nettoyer(p.racine); }
});

// Projet comme beta : racine sans git avec tickets/, backend/ et frontend/ sont deux dépôts.
function projetDeuxDepots() {
  const racine = a.racineTemp();
  const projetDir = path.join(racine, "beta");
  fs.mkdirSync(projetDir);
  const back = a.depotAvecDistant(projetDir, "backend");
  const front = a.depotAvecDistant(projetDir, "frontend");
  a.ecrire(projetDir, "tickets/bet-007.md", a.ticket());
  return { racine, projetDir, back: back.clone, front: front.clone };
}

test("preparer : deux dépôts (back, front) : une branche dans chacun, ou seulement celui demandé", () => {
  const p = projetDeuxDepots();
  try {
    let r = a.json(p.projetDir, ["preparer", "bet-007", "--depots", "backend"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(branche(p.back), "feature-bet-007");
    assert.equal(branche(p.front), "develop", "le front n'est pas touché");
    assert.deepEqual(r.json.resultats.map((x) => x.depot), ["backend"]);

    r = a.json(p.projetDir, ["preparer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(branche(p.front), "feature-bet-007");
    assert.deepEqual(r.json.resultats.map((x) => [x.depot, x.etat]), [["backend", "reprise"], ["frontend", "creee"]]);
    assert.equal(a.json(p.projetDir, ["preparer", "bet-007", "--depots", "mobile"]).code, 2, "dépôt inconnu");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : si un dépôt est sale, aucun n'est modifié", () => {
  const p = projetDeuxDepots();
  try {
    fs.appendFileSync(path.join(p.front, "README.md"), "en cours\n");
    const r = a.json(p.projetDir, ["preparer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.equal(branche(p.back), "develop", "le back propre n'a pas été branché");
    assert.deepEqual(r.json.resultats.map((x) => [x.depot, x.etat]), [["frontend", "refuse"], ["backend", "non-traite"]]);
  } finally { a.nettoyer(p.racine); }
});

test("preparer : aucun dépôt git : avertissement, code 0, rien n'est créé", () => {
  const racine = a.racineTemp();
  try {
    a.ecrire(racine, "tickets/bet-007.md", a.ticket());
    const r = a.json(racine, ["preparer", "bet-007"]);
    assert.equal(r.code, 0);
    assert.match(r.json.avertissements[0], /aucun dépôt git/);
    assert.deepEqual(r.json.resultats, []);
  } finally { a.nettoyer(racine); }
});

// ---------- terminer ----------

function projetPrepare(options) {
  const p = projet(options);
  assert.equal(a.json(p.clone, ["preparer", "bet-007"]).code, 0);
  return p;
}

test("terminer : commit ciblé, message du ticket, co-auteur, push reçu par le distant", () => {
  const p = projetPrepare();
  try {
    a.ecrire(p.clone, "src/main/java/Service.java", "class Service {}\n");
    fs.appendFileSync(path.join(p.clone, "README.md"), "documentation\n");
    const r = a.json(p.clone, ["terminer", "bet-007", "--coauteur", "Co-Authored-By: Claude <noreply@anthropic.com>"]);
    assert.equal(r.code, 0, r.out + r.err);
    const res = r.json.resultats[0];
    assert.deepEqual([res.etat, res.push, res.fichiers], ["commite", "ok", 3]);
    assert.deepEqual(fichiersDuCommit(p.clone), ["README.md", "src/main/java/Service.java", "tickets/bet-007.md"], "le fichier du ticket accompagne le code");
    const message = a.git(p.clone, "log", "-1", "--format=%B");
    assert.match(message, /^feature\(bet-007\): Export CSV des compteurs\n\nCo-Authored-By: Claude <noreply@anthropic.com>/);
    assert.ok(branchesDistantes(p.distant).includes("feature-bet-007"), "branche poussée");
    assert.equal(a.git(p.distant, "rev-parse", "feature-bet-007"), a.git(p.clone, "rev-parse", "HEAD"));
    assert.equal(a.git(p.distant, "rev-parse", "develop"), a.git(p.clone, "rev-parse", "develop"), "develop distant intact");
    assert.equal(a.git(p.clone, "status", "--porcelain"), "", "l'arbre est propre ensuite");
  } finally { a.nettoyer(p.racine); }
});

test("terminer : message fix(…) pour une anomalie, sans ligne de co-auteur si absente", () => {
  const p = projetPrepare({ type: "anomalie" });
  try {
    a.ecrire(p.clone, "Correctif.java", "class C {}\n");
    assert.equal(a.json(p.clone, ["terminer", "bet-007"]).code, 0);
    assert.equal(a.git(p.clone, "log", "-1", "--format=%B"), "fix(bet-007): Export CSV des compteurs");
  } finally { a.nettoyer(p.racine); }
});

test("terminer : le ticket traité (déplacé dans done/) est commité, les autres brouillons non", () => {
  const p = projetPrepare();
  try {
    a.ecrire(p.clone, "tickets/bet-008.md", a.ticket({ id: "bet-008" }));
    fs.renameSync(path.join(p.clone, "tickets", "bet-007.md"), a.ecrire(p.clone, "tickets/done/bet-007.md", a.ticket()));
    a.ecrire(p.clone, "Code.java", "class Code {}\n");
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(fichiersDuCommit(p.clone), ["Code.java", "tickets/done/bet-007.md"]);
    assert.ok(fs.existsSync(path.join(p.clone, "tickets", "bet-008.md")), "bet-008 intact");
    assert.match(a.git(p.clone, "status", "--porcelain", "--untracked-files=all"), /\?\? tickets\/bet-008\.md/, "bet-008 reste non suivi");
  } finally { a.nettoyer(p.racine); }
});

test("terminer : un ticket suivi déplacé dans done/ est commité comme un déplacement", () => {
  const racine = a.racineTemp();
  try {
    const { clone } = a.depotAvecDistant(racine);
    a.ecrire(clone, "tickets/bet-007.md", a.ticket());
    a.git(clone, "add", "-A");
    a.git(clone, "commit", "-m", "ticket");
    a.git(clone, "push");
    assert.equal(a.json(clone, ["preparer", "bet-007"]).code, 0);
    fs.renameSync(path.join(clone, "tickets", "bet-007.md"), a.ecrire(clone, "tickets/done/bet-007.md", a.ticket()));
    a.ecrire(clone, "Code.java", "class Code {}\n");
    assert.equal(a.json(clone, ["terminer", "bet-007"]).code, 0);
    const statuts = a.git(clone, "show", "--name-status", "--format=", "-M", "HEAD").split("\n").sort();
    assert.ok(statuts.some((l) => /^R\d*\ttickets\/bet-007\.md\ttickets\/done\/bet-007\.md$/.test(l)), statuts.join(" | "));
  } finally { a.nettoyer(racine); }
});

test("terminer : les fichiers non suivis d'avant le développement ne sont pas embarqués", () => {
  const p = projet();
  try {
    a.ecrire(p.clone, "notes-perso.txt", "à moi\n");
    assert.equal(a.json(p.clone, ["preparer", "bet-007"]).code, 0);
    a.ecrire(p.clone, "Nouveau.java", "class N {}\n");
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(fichiersDuCommit(p.clone), ["Nouveau.java", "tickets/bet-007.md"], "notes-perso.txt reste de côté");
    assert.ok(fs.existsSync(path.join(p.clone, "notes-perso.txt")), "toujours là");
    assert.match(a.git(p.clone, "status", "--porcelain"), /\?\? notes-perso\.txt/);
  } finally { a.nettoyer(p.racine); }
});

test("terminer : suppressions, accents et espaces dans les noms de fichiers", () => {
  const racine = a.racineTemp();
  try {
    const { clone } = a.depotAvecDistant(racine);
    a.ecrire(clone, "A-supprimer.txt", "x\n");
    a.git(clone, "add", "-A");
    a.git(clone, "commit", "-m", "x");
    a.git(clone, "push");
    a.ecrire(clone, "tickets/bet-007.md", a.ticket());
    assert.equal(a.json(clone, ["preparer", "bet-007"]).code, 0);
    fs.unlinkSync(path.join(clone, "A-supprimer.txt"));
    a.ecrire(clone, "src/Rapport été final.txt", "contenu\n");
    const r = a.json(clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(fichiersDuCommit(clone), ["A-supprimer.txt", "src/Rapport été final.txt", "tickets/bet-007.md"]);
    assert.equal(a.git(clone, "ls-files", "A-supprimer.txt"), "");
  } finally { a.nettoyer(racine); }
});

test("terminer : rien à commiter : pas de commit, pas de push", () => {
  const p = projetPrepare();
  try {
    const avant = a.git(p.clone, "rev-parse", "HEAD");
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 0);
    assert.equal(r.json.resultats[0].etat, "rien");
    assert.equal(a.git(p.clone, "rev-parse", "HEAD"), avant);
    assert.ok(!branchesDistantes(p.distant).includes("feature-bet-007"));
  } finally { a.nettoyer(p.racine); }
});

test("terminer : le fichier du ticket seul ne fait pas un commit", () => {
  const p = projetPrepare();
  try {
    fs.appendFileSync(path.join(p.clone, "tickets", "bet-007.md"), "statut modifié\n");
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 0);
    assert.equal(r.json.resultats[0].etat, "rien");
    assert.match(r.json.resultats[0].message, /ticket seul/);
  } finally { a.nettoyer(p.racine); }
});

test("terminer : jamais sur develop, main ou master ni sur une autre branche", () => {
  const p = projet();
  try {
    a.ecrire(p.clone, "Code.java", "class C {}\n");
    let r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 1, "sur develop");
    assert.match(r.json.resultats[0].erreur, /on est sur « develop »/);
    a.git(p.clone, "checkout", "-b", "main");
    assert.equal(a.json(p.clone, ["terminer", "bet-007"]).code, 1, "sur main");
    a.git(p.clone, "checkout", "-b", "autre");
    assert.equal(a.json(p.clone, ["terminer", "bet-007"]).code, 1, "sur une autre branche");
    assert.equal(a.git(p.clone, "log", "--oneline").split("\n").length, 1, "aucun commit créé");
    assert.deepEqual(branchesDistantes(p.distant), ["develop"]);
  } finally { a.nettoyer(p.racine); }
});

test("terminer --sans-push : commit local seulement", () => {
  const p = projetPrepare();
  try {
    a.ecrire(p.clone, "Code.java", "class C {}\n");
    const r = a.json(p.clone, ["terminer", "bet-007", "--sans-push"]);
    assert.equal(r.code, 0);
    assert.equal(r.json.resultats[0].push, "non-demande");
    assert.ok(!branchesDistantes(p.distant).includes("feature-bet-007"));
  } finally { a.nettoyer(p.racine); }
});

test("terminer : push impossible : le commit local est conservé, code 1, problème signalé", () => {
  const p = projetPrepare();
  try {
    a.ecrire(p.clone, "Code.java", "class C {}\n");
    a.nettoyer(p.distant);
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.equal(r.json.resultats[0].etat, "commite");
    assert.match(r.json.resultats[0].push, /^echec/);
    assert.match(r.json.resultats[0].erreur, /commit est conservé en local/);
    assert.deepEqual(fichiersDuCommit(p.clone), ["Code.java", "tickets/bet-007.md"]);
  } finally { a.nettoyer(p.racine); }
});

test("terminer : sans dépôt distant, le push est ignoré", () => {
  const p = projetPrepare();
  try {
    a.ecrire(p.clone, "Code.java", "class C {}\n");
    a.git(p.clone, "remote", "remove", "origin");
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 0);
    assert.match(r.json.resultats[0].push, /^ignore/);
  } finally { a.nettoyer(p.racine); }
});

test("terminer : un hook de commit qui refuse n'est pas contourné", () => {
  const p = projetPrepare();
  try {
    const hook = path.join(p.clone, ".git", "hooks", "pre-commit");
    fs.writeFileSync(hook, "#!/bin/sh\necho 'refusé par le hook' >&2\nexit 1\n", { mode: 0o755 });
    a.ecrire(p.clone, "Code.java", "class C {}\n");
    const avant = a.git(p.clone, "rev-parse", "HEAD");
    const r = a.json(p.clone, ["terminer", "bet-007"]);
    assert.equal(r.code, 1);
    assert.equal(r.json.resultats[0].etat, "echec");
    assert.match(r.json.resultats[0].erreur, /refusé par le hook/);
    assert.equal(a.git(p.clone, "rev-parse", "HEAD"), avant, "aucun commit");
    assert.ok(!branchesDistantes(p.distant).includes("feature-bet-007"), "rien de poussé");
  } finally { a.nettoyer(p.racine); }
});

test("terminer : deux dépôts, seul celui demandé est commité", () => {
  const p = projetDeuxDepots();
  try {
    assert.equal(a.json(p.projetDir, ["preparer", "bet-007"]).code, 0);
    a.ecrire(p.back, "Service.java", "class S {}\n");
    a.ecrire(p.front, "login.ts", "export {};\n");
    const r = a.json(p.projetDir, ["terminer", "bet-007", "--depots", "backend"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(fichiersDuCommit(p.back), ["Service.java"]);
    assert.match(a.git(p.front, "status", "--porcelain"), /\?\? login\.ts/, "le front n'est pas commité");
    const les2 = a.json(p.projetDir, ["terminer", "bet-007"]);
    assert.deepEqual(les2.json.resultats.map((x) => [x.depot, x.etat]), [["backend", "rien"], ["frontend", "commite"]]);
  } finally { a.nettoyer(p.racine); }
});

test("sortie texte lisible", () => {
  const p = projet();
  try {
    const r = a.lancer(p.clone, ["preparer", "bet-007"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /\[\.\] feature-bet-007 : branche créée \(pull deja-a-jour\)/);
  } finally { a.nettoyer(p.racine); }
});
