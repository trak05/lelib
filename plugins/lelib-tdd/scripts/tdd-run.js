// Lance une commande de test et enregistre le résultat dans le journal TDD du projet.
// Sans dépendance. Le code de sortie est celui de la commande de test (rouge = non nul), pour qu'elle
// se comporte comme d'habitude ; les modes --refactor, --bilan et --reset sortent avec 0.
//
//   node tdd-run.js -- ./mvnw -q test -Dtest=CompteurServiceTest
//   node tdd-run.js -- "npm test"
//   node tdd-run.js --refactor      déclare une phase de refactor (tests verts, code modifié sans nouveau test)
//   node tdd-run.js --bilan [--json]  résumé des cycles rouge / vert
//   node tdd-run.js --reset         vide le journal (début d'un ticket)
const { spawnSync } = require("child_process");
const path = require("path");
const c = require("./commun");

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const options = sep === -1 ? argv : argv.slice(0, sep);
const commande = sep === -1 ? [] : argv.slice(sep + 1);
const AS_JSON = options.includes("--json");
const racine = c.racineProjet(process.cwd());

function citer(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function bilan() {
  const entrees = c.lireJournal(racine);
  const runs = entrees.filter((e) => e.etat);
  const rougesValides = runs.filter(c.rougeValide).length;
  const verts = runs.filter((e) => e.etat === "vert").length;
  let cycles = 0;
  let attendVert = false;
  for (const e of entrees) {
    if (c.rougeValide(e)) attendVert = true;
    else if (e.etat === "vert" && attendVert) { cycles++; attendVert = false; }
  }
  const refactors = entrees.filter((e) => e.marqueur === "refactor").length;
  const alertes = [];
  if (!runs.length) alertes.push("Aucun lancement de tests enregistré : le TDD n'est pas démontré.");
  else {
    if (!rougesValides) alertes.push("Aucun test rouge valide enregistré : aucun échec de test avant le code.");
    if (runs[0].etat === "vert") alertes.push("Le premier lancement est déjà vert : le test n'a pas échoué avant le code.");
    if (rougesValides && !cycles) alertes.push("Des rouges, mais aucun vert ensuite : la suite ne passe pas encore.");
    const inconnus = runs.filter((e) => e.etat === "rouge" && e.cause === "inconnue").length;
    if (inconnus) alertes.push(`${inconnus} échec(s) de cause inconnue (commande en erreur plutôt que test en échec).`);
    if (runs.at(-1).etat === "rouge") alertes.push("Le dernier lancement est rouge.");
  }
  const resume = { lancements: runs.length, rougesValides, verts, cyclesComplets: cycles, refactors, alertes, entrees };
  if (AS_JSON) { console.log(JSON.stringify(resume, null, 2)); return; }
  console.log(`Journal TDD : ${runs.length} lancement(s), ${rougesValides} rouge(s) valide(s), ${verts} vert(s), ${cycles} cycle(s) rouge → vert, ${refactors} phase(s) refactor.`);
  for (const e of entrees) {
    const heure = e.t.slice(11, 19);
    if (e.marqueur) console.log(`  ${heure}  ${e.marqueur}`);
    else console.log(`  ${heure}  ${e.etat.toUpperCase()}${e.cause ? ` (${e.cause})` : ""}  ${e.cmd}${e.echecs && e.echecs.length ? `\n            en échec : ${e.echecs.join(" ; ")}` : ""}`);
  }
  for (const a of alertes) console.log(`⚠ ${a}`);
}

function main() {
  if (options.includes("--reset")) {
    console.log(c.viderJournal(racine) ? "Journal TDD vidé." : "Aucun journal à vider.");
    return 0;
  }
  if (options.includes("--bilan")) { bilan(); return 0; }
  if (options.includes("--refactor")) {
    const dernier = c.lireJournal(racine).filter((e) => e.etat).at(-1);
    if (!dernier || dernier.etat !== "vert") {
      console.error("Refactor refusé : le dernier lancement de tests n'est pas vert. Fais d'abord passer les tests.");
      return 1;
    }
    c.ajouterAuJournal(racine, { marqueur: "refactor" });
    console.log("Phase refactor enregistrée : modifie le code sans changer le comportement, puis relance les tests.");
    return 0;
  }
  if (!commande.length) {
    console.error("Usage : tdd-run.js -- <commande de test>   (ou --refactor, --bilan, --reset)");
    return 2;
  }

  const ligne = commande.length === 1 ? commande[0] : commande.map(citer).join(" ");
  const debut = Date.now();
  const r = spawnSync(ligne, { shell: true, cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const sortie = `${r.stdout || ""}${r.stderr ? `\n${r.stderr}` : ""}`;
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const code = typeof r.status === "number" ? r.status : 1;
  const etat = code === 0 ? "vert" : "rouge";
  const entree = { cmd: ligne, code, etat, duree_ms: Date.now() - debut };
  if (etat === "rouge") {
    entree.cause = r.error ? "inconnue" : c.classerEchec(sortie);
    entree.echecs = c.testsEnEchec(sortie);
  }
  try { c.ajouterAuJournal(racine, entree); } catch (e) { console.error(`[tdd] journal non écrit : ${e.message}`); }

  const detail = etat === "vert" ? "VERT" : `ROUGE (${entree.cause})${entree.echecs.length ? ` : ${entree.echecs.length} test(s) en échec` : ""}`;
  console.error(`[tdd] ${detail} — journal : ${path.relative(process.cwd(), c.cheminJournal(racine)) || c.cheminJournal(racine)}`);
  if (etat === "rouge" && entree.cause === "inconnue") console.error("[tdd] ⚠ échec non reconnu comme un test en échec : ce n'est pas un rouge valide (commande introuvable, erreur de configuration ?).");
  return code;
}

try { process.exit(main()); } catch (e) { console.error(`[tdd] erreur : ${e.message}`); process.exit(2); }
