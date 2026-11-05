const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const a = require("./aide-pr");

const TITRE = "Export CSV des compteurs";
function ticketComplet({ type = "fonctionnalité", statut = "terminé", extra = "", corps } = {}) {
  return `---\nid: bet-007\ntitre: ${TITRE}\nstatut: ${statut}\ntype: ${type}\npoints_back: 3\npoints_front: 5\njira: BET-42\njira_url: https://x.atlassian.net/browse/BET-42\n${extra}---\n\n${corps ?? `# bet-007 — ${TITRE}

## Contexte
Les agents veulent exporter.

## Besoin
En tant qu'agent, je veux exporter la liste en CSV afin de la partager.

## Critères d'acceptation
- [x] CA-1 : le fichier contient une ligne par compteur
- [x] CA-2 : les accents (é, è) sont conservés

## Hors périmètre
- <ce qui n'est explicitement pas demandé>
`}`;
}

// Branche développée avec /dev (preparer + terminer) : poussée sur le distant, ticket dans done/.
function prete(options = {}) {
  const racine = a.racineTemp();
  const { distant, clone } = a.depotAvecDistant(racine);
  a.ecrire(clone, "tickets/bet-007.md", ticketComplet(options));
  assert.equal(a.json(clone, ["preparer", "bet-007"]).code, 0);
  a.ecrire(clone, "src/Service.java", "class Service {}\n");
  a.ecrire(clone, "tickets/done/bet-007.md", ticketComplet(options));
  fs.unlinkSync(path.join(clone, "tickets", "bet-007.md"));
  const t = a.json(clone, ["terminer", "bet-007"]);
  assert.equal(t.code, 0, t.out + t.err);
  const gh = a.fauxGh(path.join(racine, "gh"));
  return { racine, distant, clone, gh };
}
const preparer = (p, args = []) => a.jsonPr(p.clone, ["preparer", "bet-007", ...args], p.gh.env);
const creer = (p, args = []) => a.jsonPr(p.clone, ["creer", "bet-007", ...args], p.gh.env);

test("preparer : branche prête : titre, base, commits, corps du ticket, rien n'est créé", () => {
  const p = prete();
  try {
    const r = preparer(p);
    assert.equal(r.code, 0, r.out + r.err);
    const d = r.json.depots[0];
    assert.equal(d.titre, `feature(bet-007): ${TITRE}`);
    assert.deepEqual([d.branche, d.base, d.commits, d.erreurs.length], ["feature-bet-007", "develop", 1, 0]);
    assert.match(d.corps, /^## Ticket\n\*\*bet-007\*\* — Export CSV des compteurs/);
    assert.match(d.corps, /Jira : \[BET-42\]\(https:\/\/x\.atlassian\.net\/browse\/BET-42\)/);
    assert.match(d.corps, /Estimation : back 3 pt, front 5 pt/);
    assert.match(d.corps, /## Besoin\nEn tant qu'agent, je veux exporter la liste en CSV afin de la partager\./);
    assert.match(d.corps, /## Critères d'acceptation\n- \[x\] CA-1 : le fichier contient une ligne par compteur\n- \[x\] CA-2 : les accents \(é, è\) sont conservés/);
    assert.match(d.corps, /## Revue\n`feature-bet-007` → `develop`/);
    assert.ok(!d.corps.includes("Hors périmètre"), "les gabarits vides sont ignorés");
    assert.equal(p.gh.appels("create").length, 0, "aucune PR créée en aperçu");
  } finally { a.nettoyer(p.racine); }
});

test("preparer : une anomalie donne un titre fix(…)", () => {
  const p = prete({ type: "anomalie" });
  try {
    assert.equal(preparer(p).json.depots[0].titre, `fix(bet-007): ${TITRE}`);
  } finally { a.nettoyer(p.racine); }
});

test("creer : gh pr create vers develop avec titre et corps, URL rendue, fichier temporaire supprimé", () => {
  const p = prete();
  try {
    const r = creer(p);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(r.json.crees, [{ depot: ".", url: "https://github.com/o/r/pull/1", numero: 1, brouillon: false }]);
    const [c] = p.gh.appels("create");
    assert.equal(c.args[c.args.indexOf("--base") + 1], "develop");
    assert.equal(c.args[c.args.indexOf("--head") + 1], "feature-bet-007");
    assert.equal(c.args[c.args.indexOf("--title") + 1], `feature(bet-007): ${TITRE}`);
    assert.ok(!c.args.includes("--draft"));
    assert.match(c.corps, /Critères d'acceptation/);
    assert.equal(fs.realpathSync(c.cwd), fs.realpathSync(p.clone), "lancé dans le dépôt");
    assert.ok(!fs.existsSync(c.fichier), "le corps temporaire est supprimé");
  } finally { a.nettoyer(p.racine); }
});

test("creer --brouillon : PR en brouillon", () => {
  const p = prete();
  try {
    const r = creer(p, ["--brouillon"]);
    assert.equal(r.code, 0);
    assert.ok(p.gh.appels("create")[0].args.includes("--draft"));
    assert.equal(r.json.crees[0].brouillon, true);
  } finally { a.nettoyer(p.racine); }
});

test("creer : titre avec guillemets et caractères du shell transmis tel quel (pas de shell)", () => {
  const racine = a.racineTemp();
  try {
    const { clone } = a.depotAvecDistant(racine);
    const titre = 'Export "CSV" & $(whoami) ; `x` | > fichier';
    a.ecrire(clone, "tickets/bet-007.md", ticketComplet().replace(TITRE, titre));
    assert.equal(a.json(clone, ["preparer", "bet-007"]).code, 0);
    a.ecrire(clone, "src/Service.java", "class S {}\n");
    assert.equal(a.json(clone, ["terminer", "bet-007"]).code, 0);
    const gh = a.fauxGh(path.join(racine, "gh"));
    const r = a.jsonPr(clone, ["creer", "bet-007"], gh.env);
    assert.equal(r.code, 0, r.out + r.err);
    const c = gh.appels("create")[0];
    assert.equal(c.args[c.args.indexOf("--title") + 1], `feature(bet-007): ${titre}`);
  } finally { a.nettoyer(racine); }
});

test("gh non connecté : refus avec la consigne de se connecter soi-même, rien n'est créé", () => {
  const p = prete();
  try {
    p.gh.definir({ auth: false });
    const r = creer(p);
    assert.equal(r.code, 1);
    assert.match(r.json.global.erreurs.join(" "), /gh auth login.*aucun jeton n'est demandé/);
    assert.equal(p.gh.appels("create").length, 0);
  } finally { a.nettoyer(p.racine); }
});

test("gh introuvable : refus clair", () => {
  const p = prete();
  try {
    const r = a.jsonPr(p.clone, ["preparer", "bet-007"], { LELIB_GH: "commande-gh-qui-nexiste-pas" });
    assert.equal(r.code, 1);
    assert.match(r.json.global.erreurs.join(" "), /gh introuvable/);
  } finally { a.nettoyer(p.racine); }
});

test("une PR déjà ouverte : refus, aucune PR en double, son lien est rappelé", () => {
  const p = prete();
  try {
    p.gh.definir({ prs: [{ head: "feature-bet-007", number: 12, url: "https://github.com/o/r/pull/12" }] });
    const r = creer(p);
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.depots[0].dejaOuverte, { number: 12, url: "https://github.com/o/r/pull/12" });
    assert.match(r.json.depots[0].erreurs.join(" "), /déjà ouverte.*#12/);
    assert.equal(p.gh.appels("create").length, 0);
  } finally { a.nettoyer(p.racine); }
});

test("une PR ouverte d'une autre branche ne gêne pas", () => {
  const p = prete();
  try {
    p.gh.definir({ prs: [{ head: "feature-bet-099", number: 3, url: "https://github.com/o/r/pull/3" }] });
    assert.equal(creer(p).code, 0);
  } finally { a.nettoyer(p.racine); }
});

test("gh n'arrive pas à interroger GitHub (dépôt non GitHub) : refus avec le message de gh", () => {
  const p = prete();
  try {
    p.gh.definir({ listeErreur: "none of the git remotes configured for this repository point to a known GitHub host" });
    const r = creer(p);
    assert.equal(r.code, 1);
    assert.match(r.json.depots[0].erreurs.join(" "), /gh n'a pas pu interroger GitHub.*known GitHub host/);
    assert.equal(p.gh.appels("create").length, 0);
  } finally { a.nettoyer(p.racine); }
});

test("branche non poussée, commits non poussés, branche absente : refus", () => {
  const p = prete();
  try {
    a.ecrire(p.clone, "Plus.java", "class P {}\n");
    a.git(p.clone, "add", "Plus.java");
    a.git(p.clone, "commit", "-m", "commit local non poussé");
    let r = preparer(p);
    assert.equal(r.code, 1);
    assert.match(r.json.depots[0].erreurs.join(" "), /1 commit\(s\) de feature-bet-007 ne sont pas poussés/);

    a.git(p.clone, "checkout", "develop");
    a.git(p.clone, "branch", "-D", "feature-bet-007");
    a.git(p.clone, "branch", "feature-bet-007", "origin/feature-bet-007");
    a.git(p.clone, "push", "origin", "--delete", "feature-bet-007");
    a.git(p.clone, "fetch", "--prune", "origin");
    r = preparer(p);
    assert.match(r.json.depots[0].erreurs.join(" "), /n'est pas poussée sur origin/);

    a.git(p.clone, "branch", "-D", "feature-bet-007");
    r = preparer(p);
    assert.equal(r.code, 2, "branche supprimée : le ticket terminé n'existe plus nulle part");
    assert.match(r.json.erreur, /ticket introuvable.*repasse sur feature-<id>/);
    assert.equal(p.gh.appels("create").length, 0);
  } finally { a.nettoyer(p.racine); }
});

test("revenu sur develop, le ticket terminé est relu dans sa branche (numéro ou identifiant)", () => {
  const p = prete();
  try {
    a.git(p.clone, "checkout", "develop");
    assert.ok(!fs.existsSync(path.join(p.clone, "tickets", "done", "bet-007.md")), "le ticket n'est pas dans le dossier de travail");
    for (const cible of ["7", "007", "bet-007"]) {
      const r = a.jsonPr(p.clone, ["preparer", cible], p.gh.env);
      assert.equal(r.code, 0, `${cible} : ${r.out}${r.err}`);
      assert.match(r.json.global.avertissements.join(" "), /relu dans la branche feature-bet-007:tickets\/done\/bet-007\.md/);
      assert.match(r.json.depots[0].corps, /Estimation : back 3 pt, front 5 pt/);
      assert.equal(r.json.depots[0].titre, `feature(bet-007): ${TITRE}`);
    }
    assert.equal(creer(p).code, 0, "la PR se crée aussi depuis develop");
    assert.equal(a.git(p.clone, "rev-parse", "--abbrev-ref", "HEAD"), "develop", "aucun changement de branche");
  } finally { a.nettoyer(p.racine); }
});

test("aucun commit à proposer par rapport à develop : refus", () => {
  const racine = a.racineTemp();
  try {
    const { clone } = a.depotAvecDistant(racine);
    a.ecrire(clone, "tickets/bet-007.md", ticketComplet());
    assert.equal(a.json(clone, ["preparer", "bet-007"]).code, 0);
    a.git(clone, "push", "-u", "origin", "feature-bet-007");
    const gh = a.fauxGh(path.join(racine, "gh"));
    const r = a.jsonPr(clone, ["preparer", "bet-007"], gh.env);
    assert.equal(r.code, 1);
    assert.match(r.json.depots[0].erreurs.join(" "), /aucun commit.*à proposer/);
  } finally { a.nettoyer(racine); }
});

test("destination introuvable (--base) : refus ; --base main accepté si elle existe", () => {
  const p = prete();
  try {
    assert.match(preparer(p, ["--base", "release"]).json.depots[0].erreurs.join(" "), /destination release est introuvable/);
    a.git(p.clone, "push", "origin", "develop:main");
    const r = creer(p, ["--base", "main"]);
    assert.equal(r.code, 0, r.out + r.err);
    const c = p.gh.appels("create")[0];
    assert.equal(c.args[c.args.indexOf("--base") + 1], "main");
    assert.match(c.corps, /`feature-bet-007` → `main`/);
  } finally { a.nettoyer(p.racine); }
});

test("sans dépôt distant origin ou fetch impossible : refus", () => {
  const p = prete();
  try {
    a.nettoyer(p.distant);
    assert.match(preparer(p).json.depots[0].erreurs.join(" "), /git fetch impossible/);
    a.git(p.clone, "remote", "remove", "origin");
    assert.match(preparer(p).json.depots[0].erreurs.join(" "), /aucun dépôt distant « origin »/);
  } finally { a.nettoyer(p.racine); }
});

test("ticket avec section Blocage : refus ; non marqué terminé : simple avertissement", () => {
  const p = prete();
  try {
    a.ecrire(p.clone, "tickets/done/bet-007.md", ticketComplet() + "\n## Blocage\nUn test échoue.\n");
    const r = preparer(p);
    assert.equal(r.code, 1);
    assert.match(r.json.global.erreurs.join(" "), /section « Blocage »/);

    a.ecrire(p.clone, "tickets/done/bet-007.md", ticketComplet());
    assert.deepEqual(preparer(p).json.global.avertissements, [], "dans done/ : pas d'avertissement");
    fs.renameSync(path.join(p.clone, "tickets", "done", "bet-007.md"), path.join(p.clone, "tickets", "bet-007.md"));
    fs.writeFileSync(path.join(p.clone, "tickets", "bet-007.md"), ticketComplet({ statut: "en-cours" }));
    const encours = preparer(p);
    assert.equal(encours.code, 0, "pas bloquant");
    assert.match(encours.json.global.avertissements.join(" "), /pas marqué terminé.*en-cours/);
  } finally { a.nettoyer(p.racine); }
});

test("ticket introuvable ou usage : code 2", () => {
  const p = prete();
  try {
    assert.equal(a.jsonPr(p.clone, ["preparer", "bet-099"], p.gh.env).code, 2);
    assert.equal(a.lancerPr(p.clone, [], p.gh.env).code, 2);
    assert.equal(a.lancerPr(p.clone, ["publier", "bet-007"], p.gh.env).code, 2);
    assert.equal(a.jsonPr(p.clone, ["preparer", "bet-007", "--depots", "inconnu"], p.gh.env).code, 2);
  } finally { a.nettoyer(p.racine); }
});

test("changements non commités : avertissement seulement", () => {
  const p = prete();
  try {
    fs.appendFileSync(path.join(p.clone, "README.md"), "en cours\n");
    const r = preparer(p);
    assert.equal(r.code, 0);
    assert.match(r.json.depots[0].avertissements.join(" "), /non commité.*pas dans la PR/);
  } finally { a.nettoyer(p.racine); }
});

test("le corps reprend le résumé du journal TDD s'il existe", () => {
  const p = prete();
  try {
    const dir = path.join(p.clone, ".lelib", "tdd");
    fs.mkdirSync(dir, { recursive: true });
    const t = new Date().toISOString();
    fs.writeFileSync(path.join(dir, "journal.jsonl"), [{ etat: "rouge", cause: "assertion" }, { etat: "vert" }, { etat: "rouge", cause: "inconnue" }].map((e) => JSON.stringify({ t, ...e })).join("\n") + "\n{abîmée\n");
    assert.match(preparer(p).json.depots[0].corps, /## Vérifications\nTDD : 3 lancement\(s\) de tests, 1 rouge\(s\) valide\(s\), 1 cycle\(s\) rouge → vert\./);
  } finally { a.nettoyer(p.racine); }
});

// Deux dépôts comme beta : tickets/ à la racine, backend et frontend séparés.
function preteDeuxDepots() {
  const racine = a.racineTemp();
  const projetDir = path.join(racine, "beta");
  fs.mkdirSync(projetDir);
  const back = a.depotAvecDistant(projetDir, "backend");
  const front = a.depotAvecDistant(projetDir, "frontend");
  a.ecrire(projetDir, "tickets/bet-007.md", ticketComplet());
  assert.equal(a.json(projetDir, ["preparer", "bet-007"]).code, 0);
  a.ecrire(back.clone, "Service.java", "class S {}\n");
  a.ecrire(front.clone, "login.ts", "export {};\n");
  a.ecrire(projetDir, "tickets/done/bet-007.md", ticketComplet());
  fs.unlinkSync(path.join(projetDir, "tickets", "bet-007.md"));
  const t = a.json(projetDir, ["terminer", "bet-007"]);
  assert.equal(t.code, 0, t.out + t.err);
  const gh = a.fauxGh(path.join(racine, "gh"));
  return { racine, projetDir, gh };
}

test("deux dépôts : une PR par dépôt, avec la mention de l'autre ; --depots n'en crée qu'une", () => {
  const p = preteDeuxDepots();
  try {
    let r = a.jsonPr(p.projetDir, ["creer", "bet-007", "--depots", "backend"], p.gh.env);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(r.json.crees.map((c) => c.depot), ["backend"]);
    assert.equal(p.gh.appels("create").length, 1);

    p.gh.definir({ prs: [{ head: "feature-bet-007", number: 1, url: "https://github.com/o/r/pull/1" }] });
    r = a.jsonPr(p.projetDir, ["preparer", "bet-007"], p.gh.env);
    assert.equal(r.code, 1, "la PR existante est détectée dans les deux dépôts");

    p.gh.definir({ prs: [] });
    r = a.jsonPr(p.projetDir, ["creer", "bet-007"], p.gh.env);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(r.json.crees.map((c) => c.depot), ["backend", "frontend"]);
    const creations = p.gh.appels("create");
    assert.equal(creations.length, 3);
    assert.match(creations[1].corps, /Dépôt : backend \(ce ticket touche aussi : frontend, avec sa propre PR\)/);
    assert.match(creations[2].corps, /Dépôt : frontend \(ce ticket touche aussi : backend/);
    assert.ok(creations[2].cwd.endsWith("frontend"));
  } finally { a.nettoyer(p.racine); }
});

test("deux dépôts sans --depots : un dépôt sans branche pour le ticket est ignoré avec un avertissement", () => {
  const racine = a.racineTemp();
  try {
    const projetDir = path.join(racine, "beta");
    fs.mkdirSync(projetDir);
    const back = a.depotAvecDistant(projetDir, "backend");
    a.depotAvecDistant(projetDir, "frontend");
    a.ecrire(projetDir, "tickets/bet-007.md", ticketComplet());
    assert.equal(a.json(projetDir, ["preparer", "bet-007", "--depots", "backend"]).code, 0);
    a.ecrire(back.clone, "Service.java", "class S {}\n");
    a.ecrire(projetDir, "tickets/done/bet-007.md", ticketComplet());
    fs.unlinkSync(path.join(projetDir, "tickets", "bet-007.md"));
    assert.equal(a.json(projetDir, ["terminer", "bet-007", "--depots", "backend"]).code, 0);
    const gh = a.fauxGh(path.join(racine, "gh"));
    const r = a.jsonPr(projetDir, ["creer", "bet-007"], gh.env);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(r.json.crees.map((c) => c.depot), ["backend"]);
    assert.match(r.json.global.avertissements.join(" "), /sans branche feature-bet-007, ignoré\(s\) : frontend/);
    assert.ok(!/ce ticket touche aussi/.test(gh.appels("create")[0].corps), "pas de mention d'un dépôt non concerné");
  } finally { a.nettoyer(racine); }
});

test("deux dépôts : si un dépôt n'est pas prêt, aucune PR n'est créée", () => {
  const p = preteDeuxDepots();
  try {
    a.git(path.join(p.projetDir, "frontend"), "push", "origin", "--delete", "feature-bet-007");
    const r = a.jsonPr(p.projetDir, ["creer", "bet-007"], p.gh.env);
    assert.equal(r.code, 1);
    assert.equal(p.gh.appels("create").length, 0, "même le back, prêt, n'a pas de PR");
    assert.match(r.json.depots.find((d) => d.depot === "frontend").erreurs.join(" "), /n'est pas poussée/);
  } finally { a.nettoyer(p.racine); }
});

test("gh pr create qui échoue : code 1, message de gh, la PR déjà créée est listée", () => {
  const p = preteDeuxDepots();
  try {
    p.gh.definir({ createErreur: "GraphQL: Resource not accessible by personal access token", createErreurDans: "frontend" });
    const r = a.jsonPr(p.projetDir, ["creer", "bet-007"], p.gh.env);
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.crees.map((c) => c.depot), ["backend"]);
    assert.match(r.json.depots.find((d) => d.depot === "frontend").erreurs.join(" "), /gh pr create a échoué.*Resource not accessible/);
  } finally { a.nettoyer(p.racine); }
});

test("sortie texte lisible", () => {
  const p = prete();
  try {
    const r = a.lancerPr(p.clone, ["creer", "bet-007"], p.gh.env);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /\[\.\] feature-bet-007 → develop : feature\(bet-007\): Export CSV des compteurs \(1 commit\(s\)\) — PR créée : https:\/\/github\.com\/o\/r\/pull\/1/);
  } finally { a.nettoyer(p.racine); }
});

test("le script ne pousse rien et ne modifie ni le ticket ni les branches", () => {
  const p = prete();
  try {
    const avant = { ticket: fs.readFileSync(path.join(p.clone, "tickets", "done", "bet-007.md"), "utf8"), distant: a.git(p.distant, "rev-parse", "feature-bet-007"), tete: a.git(p.clone, "rev-parse", "HEAD"), statut: a.git(p.clone, "status", "--porcelain") };
    assert.equal(creer(p).code, 0);
    assert.equal(fs.readFileSync(path.join(p.clone, "tickets", "done", "bet-007.md"), "utf8"), avant.ticket);
    assert.equal(a.git(p.distant, "rev-parse", "feature-bet-007"), avant.distant);
    assert.equal(a.git(p.clone, "rev-parse", "HEAD"), avant.tete);
    assert.equal(a.git(p.clone, "status", "--porcelain"), avant.statut);
  } finally { a.nettoyer(p.racine); }
});
