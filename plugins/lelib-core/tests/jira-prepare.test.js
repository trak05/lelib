const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { fibonacciSuperieur, normaliserPriorite } = require("../scripts/jira-prepare");

const SCRIPT = path.join(__dirname, "..", "scripts", "jira-prepare.js");

function projet() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lelib-jira-"));
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
function lancer(dir, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}
function preparer(dir, args) {
  const r = lancer(dir, [...args, "--json"]);
  let json = null;
  try { json = JSON.parse(r.out); } catch { /* sortie non JSON */ }
  return { code: r.code, json, out: r.out, err: r.err };
}

// Brouillon type, tel que le produisent /ticket puis les tech leads.
function brouillon({ id = "bet-001", type = "fonctionnalité", statut = "estimé", back, front, extra = "", corps } = {}) {
  const entete = [`id: ${id}`, "titre: Connexion par e-mail", `statut: ${statut}`, `type: ${type}`, "cree_le: 2026-11-05", "source: description"];
  if (back !== undefined) entete.push(`points_back: ${back}`);
  if (front !== undefined) entete.push(`points_front: ${front}`);
  if (extra) entete.push(extra);
  return `---\n${entete.join("\n")}\n---\n\n${corps ?? `# ${id} — Connexion par e-mail

## Contexte
Les agents d'accueil veulent se connecter.

## Besoin
En tant qu'agent, je veux me connecter afin d'accéder à mes compteurs.

## Critères d'acceptation
- [ ] CA-1 : un agent valide se connecte
- [x] CA-2 : un mot de passe vide est refusé

## Hors périmètre
- <ce qui n'est explicitement pas demandé, ou « À préciser »>

## Pistes techniques
- À analyser

## Questions ouvertes
- Faut-il un « mot de passe oublié » ?
`}`;
}

test("fibonacciSuperieur : arrondi au Fibonacci supérieur, null au-delà de 13", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(fibonacciSuperieur), [1, 2, 3, 5, 5, 8, 8, 8, 13, 13, 13, 13, 13]);
  assert.equal(fibonacciSuperieur(14), null);
});

test("normaliserPriorite : défaut Medium, anglais, français, accents et majuscules", () => {
  assert.deepEqual(normaliserPriorite(undefined), { saisie: null, jira: "Medium", defaut: true });
  assert.equal(normaliserPriorite("").jira, "Medium");
  for (const [saisie, attendu] of [["High", "High"], ["haute", "High"], ["HAUTE", "High"], ["Élevée", "High"], ["critique", "Highest"], ["moyenne", "Medium"], ["basse", "Low"], ["très basse", "Lowest"], ["p1", "Highest"]]) {
    assert.equal(normaliserPriorite(saisie).jira, attendu, saisie);
    assert.equal(normaliserPriorite(saisie).defaut, false);
  }
  const inconnue = normaliserPriorite("urgentissime");
  assert.equal(inconnue.jira, null);
  assert.match(inconnue.erreur, /Highest, High, Medium, Low, Lowest/);
});

test("brouillon chiffré des deux côtés : somme arrondie au Fibonacci supérieur", () => {
  const p = projet();
  try {
    for (const [back, front, somme, retenu] of [[3, 5, 8, 8], [5, 5, 10, 13], [2, 1, 3, 3], [1, 2, 3, 3], [8, 5, 13, 13]]) {
      ecrire(p, "tickets/bet-001.md", brouillon({ back, front }));
      const r = preparer(p, ["bet-001"]);
      assert.equal(r.code, 0, `${back}+${front} : ${r.out}`);
      assert.deepEqual([r.json.points.somme, r.json.points.retenu], [somme, retenu], `${back}+${front}`);
    }
  } finally { nettoyer(p); }
});

test("un seul côté chiffré : ses points sont retenus tels quels", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 5 }));
    const r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 0);
    assert.deepEqual([r.json.points.back, r.json.points.front, r.json.points.retenu], [5, null, 5]);
    assert.match(r.json.description, /Back : 5 pt · Total retenu : 5/);
  } finally { nettoyer(p); }
});

test("somme supérieure à 13 : refusé, à découper", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 8, front: 8 }));
    const r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 1);
    assert.match(r.json.erreurs.join(" "), /somme des points = 16.*découper/);
  } finally { nettoyer(p); }
});

test("brouillon non chiffré : refusé, l'estimation revient aux tech leads", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ statut: "brouillon" }));
    const r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 1);
    assert.match(r.json.erreurs.join(" "), /non chiffré/);
    assert.match(r.json.erreurs.join(" "), /tech leads/);
  } finally { nettoyer(p); }
});

test("points hors échelle ou illisibles : refusés", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 4 }));
    let r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 1);
    assert.match(r.json.erreurs.join(" "), /points_back = 4 est hors de l'échelle Fibonacci \(1, 2, 3, 5, 8, 13\)/);
    ecrire(p, "tickets/bet-001.md", brouillon({ back: "beaucoup" }));
    r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 1);
    assert.match(r.json.erreurs.join(" "), /pas un nombre/);
  } finally { nettoyer(p); }
});

test("estimation provisoire, statut non estimé et cadrage sans points : avertissements, pas d'erreur", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: "5 pt (provisoire)", statut: "brouillon" }));
    let r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 0);
    assert.equal(r.json.points.retenu, 5);
    assert.ok(r.json.avertissements.some((a) => /provisoire/.test(a)));
    assert.ok(r.json.avertissements.some((a) => /statut « brouillon »/.test(a)));

    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3, corps: "# x\n\n## Cadrage technique (front)\nUn composant.\n\n## Cadrage technique (back)\nUn service.\n" }));
    r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 0);
    assert.ok(r.json.avertissements.some((a) => /cadrage front existe mais `points_front` est absent/.test(a)));
    assert.ok(!r.json.avertissements.some((a) => /cadrage back/.test(a)));
  } finally { nettoyer(p); }
});

test("priorité : Medium par défaut, saisie normalisée, valeur inconnue refusée", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3 }));
    assert.deepEqual(preparer(p, ["bet-001"]).json.priorite, { saisie: null, jira: "Medium", defaut: true });
    assert.deepEqual(preparer(p, ["bet-001", "--priorite", "haute"]).json.priorite, { saisie: "haute", jira: "High", defaut: false });
    const r = preparer(p, ["bet-001", "--priorite", "urgentissime"]);
    assert.equal(r.code, 1);
    assert.match(r.json.erreurs.join(" "), /priorité inconnue/);
  } finally { nettoyer(p); }
});

test("type du ticket : fonctionnalité, anomalie, technique, inconnu", () => {
  const p = projet();
  try {
    for (const [type, souhaite] of [["fonctionnalité", "Story"], ["fonctionnalite", "Story"], ["anomalie", "Bug"], ["technique", "Task"]]) {
      ecrire(p, "tickets/bet-001.md", brouillon({ back: 3, type }));
      const r = preparer(p, ["bet-001"]);
      assert.equal(r.json.typeJira.souhaite, souhaite, type);
      assert.ok(r.json.typeJira.candidats.includes(souhaite));
    }
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3, type: "épopée" }));
    const r = preparer(p, ["bet-001"]);
    assert.equal(r.json.typeJira.souhaite, "Task");
    assert.ok(r.json.avertissements.some((a) => /non reconnu/.test(a)));
    assert.ok(preparer(p, ["bet-001"]).json.typeJira.candidats.includes("Tâche"), "noms français candidats");
  } finally { nettoyer(p); }
});

test("le brouillon se désigne par numéro, identifiant ou chemin", () => {
  const p = projet();
  try {
    const f = ecrire(p, "tickets/bet-012-export.md", brouillon({ id: "bet-012", back: 3 }));
    for (const cible of ["12", "012", "bet-012", "BET-012", f, "tickets/bet-012-export.md"]) {
      const r = preparer(p, [cible]);
      assert.equal(r.code, 0, cible);
      assert.equal(r.json.ticket.id, "bet-012", cible);
      assert.equal(r.json.ticket.fichier, "tickets/bet-012-export.md");
    }
  } finally { nettoyer(p); }
});

test("brouillon introuvable, ambigu ou terminé", () => {
  const p = projet();
  try {
    assert.equal(preparer(p, ["bet-099"]).code, 2);
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3 }));
    ecrire(p, "tickets/opa-001.md", brouillon({ id: "opa-001", back: 3 }));
    const ambigu = preparer(p, ["1"]);
    assert.equal(ambigu.code, 2);
    assert.match(ambigu.json.erreurs[0], /plusieurs brouillons/);
    ecrire(p, "tickets/done/bet-005.md", brouillon({ id: "bet-005", back: 3 }));
    const termine = preparer(p, ["bet-005"]);
    assert.equal(termine.code, 2);
    assert.match(termine.json.erreurs[0], /terminé/);
    assert.equal(lancer(p, []).code, 2, "sans argument : usage");
  } finally { nettoyer(p); }
});

test("déjà créé dans Jira : refusé, la clé existante est rappelée", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3, extra: "jira: BET-42\njira_url: https://x.atlassian.net/browse/BET-42" }));
    const r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.dejaCree, { cle: "BET-42", url: "https://x.atlassian.net/browse/BET-42" });
    assert.match(r.json.erreurs.join(" "), /BET-42/);
  } finally { nettoyer(p); }
});

test("description : sections utiles, cases à cocher retirées, gabarits vides ignorés, accents conservés", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3, front: 2 }));
    const { description } = preparer(p, ["bet-001"]).json;
    assert.match(description, /## Contexte\nLes agents d'accueil veulent se connecter\./);
    assert.match(description, /## Critères d'acceptation\n- CA-1 : un agent valide se connecte\n- CA-2 : un mot de passe vide est refusé/);
    assert.ok(!description.includes("[ ]") && !description.includes("[x]"));
    assert.ok(!description.includes("Hors périmètre"), "section de gabarit non remplie");
    assert.match(description, /## Questions ouvertes\n- Faut-il un « mot de passe oublié » \?/);
    assert.match(description, /## Estimation\nBack : 3 pt · Front : 2 pt · Total retenu : 5 \(échelle Fibonacci\)/);
    assert.match(description, /_Brouillon local : bet-001_$/);
  } finally { nettoyer(p); }
});

test("étiquette, titre, mémo du projet Jira et fins de ligne Windows", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3 }).replace(/\n/g, "\r\n"));
    ecrire(p, "tickets/.jira.json", JSON.stringify({ projet: "BET", site: "https://x.atlassian.net" }));
    const r = preparer(p, ["bet-001"]);
    assert.equal(r.code, 0);
    assert.equal(r.json.ticket.titre, "Connexion par e-mail");
    assert.equal(r.json.etiquette, "lelib-bet-001");
    assert.deepEqual(r.json.memo, { projet: "BET", site: "https://x.atlassian.net" });
    assert.ok(!r.json.description.includes("\r"));
  } finally { nettoyer(p); }
});

test("sortie texte lisible", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3, front: 5 }));
    const r = lancer(p, ["bet-001", "--priorite", "basse"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /Type Jira : Story/);
    assert.match(r.out, /Priorité : Low\n/);
    assert.match(r.out, /total 8 → 8/);
  } finally { nettoyer(p); }
});

test("--enregistrer ajoute la clé, le lien et la date sans toucher au reste", () => {
  const p = projet();
  try {
    const original = brouillon({ back: 3 });
    const f = ecrire(p, "tickets/bet-001.md", original);
    const r = lancer(p, ["bet-001", "--enregistrer", "BET-42", "--url", "https://x.atlassian.net/browse/BET-42"]);
    assert.equal(r.code, 0, r.err);
    const apres = fs.readFileSync(f, "utf8");
    assert.match(apres, /\njira: BET-42\njira_url: https:\/\/x\.atlassian\.net\/browse\/BET-42\njira_cree_le: \d{4}-\d{2}-\d{2}\n---/);
    assert.ok(apres.includes("statut: estimé"), "le statut local ne change pas");
    const sansAjout = apres.replace(/\njira: .*\njira_url: .*\njira_cree_le: .*(?=\n---)/, "");
    assert.equal(sansAjout, original, "le reste du fichier est identique, octet pour octet");
    assert.equal(preparer(p, ["bet-001"]).code, 1, "ensuite le brouillon est signalé comme déjà créé");
  } finally { nettoyer(p); }
});

test("--enregistrer garde les fins de ligne Windows", () => {
  const p = projet();
  try {
    const f = ecrire(p, "tickets/bet-001.md", brouillon({ back: 3 }).replace(/\n/g, "\r\n"));
    assert.equal(lancer(p, ["bet-001", "--enregistrer", "BET-7", "--url", "https://x.atlassian.net/browse/BET-7"]).code, 0);
    const apres = fs.readFileSync(f, "utf8");
    assert.ok(apres.includes("\r\njira: BET-7\r\njira_url: https://x.atlassian.net/browse/BET-7\r\njira_cree_le: "));
    assert.ok(!/[^\r]\n/.test(apres), "aucune fin de ligne mélangée");
  } finally { nettoyer(p); }
});

test("--enregistrer refuse une clé ou un lien invalides, et un second enregistrement", () => {
  const p = projet();
  try {
    const f = ecrire(p, "tickets/bet-001.md", brouillon({ back: 3 }));
    const avant = fs.readFileSync(f, "utf8");
    for (const args of [["--enregistrer", "bet-42", "--url", "https://x/y"], ["--enregistrer", "42", "--url", "https://x/y"], ["--enregistrer", "BET-42", "--url", "http://x/y"], ["--enregistrer", "BET-42"], ["--enregistrer", "BET-42; rm", "--url", "https://x/y"]]) {
      assert.equal(lancer(p, ["bet-001", ...args]).code, 1, args.join(" "));
    }
    assert.equal(fs.readFileSync(f, "utf8"), avant, "rien n'est écrit en cas d'erreur");
    assert.equal(lancer(p, ["bet-001", "--enregistrer", "BET-42", "--url", "https://x/y"]).code, 0);
    const deuxieme = lancer(p, ["bet-001", "--enregistrer", "BET-43", "--url", "https://x/z"]);
    assert.equal(deuxieme.code, 1);
    assert.match(deuxieme.err, /déjà une clé Jira/);
    assert.ok(!fs.readFileSync(f, "utf8").includes("BET-43"));
  } finally { nettoyer(p); }
});

test("--enregistrer sans en-tête : refusé sans rien écrire", () => {
  const p = projet();
  try {
    const f = ecrire(p, "tickets/bet-001.md", "# bet-001 — sans en-tête\n");
    const r = lancer(p, ["bet-001", "--enregistrer", "BET-1", "--url", "https://x/y"]);
    assert.equal(r.code, 2);
    assert.equal(fs.readFileSync(f, "utf8"), "# bet-001 — sans en-tête\n");
  } finally { nettoyer(p); }
});

test("le racine du projet est trouvée depuis un sous-dossier", () => {
  const p = projet();
  try {
    ecrire(p, "tickets/bet-001.md", brouillon({ back: 3 }));
    const sous = path.join(p, "backend", "src");
    fs.mkdirSync(sous, { recursive: true });
    assert.equal(preparer(sous, ["bet-001"]).code, 0);
  } finally { nettoyer(p); }
});
