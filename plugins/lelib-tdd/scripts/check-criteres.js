// Vérifie que chaque critère d'acceptation d'un ticket est cité par au moins un test.
// Les critères sont numérotés CA-1, CA-2… dans le ticket ; un test les cite dans son nom, avec l'identifiant
// du ticket : `[bet-003 CA-2] refuse un mot de passe vide`. Sans dépendance, lecture seule.
//
//   node check-criteres.js <ticket>          chemin du ticket ou identifiant (bet-003)
//   node check-criteres.js                   tous les tickets de tickets/ (hors done/)
//   node check-criteres.js <ticket> --json   rapport en JSON
// Code de sortie : 0 tout est couvert, 1 critère sans test, 2 ticket introuvable ou illisible.
const fs = require("fs");
const path = require("path");
const c = require("./commun");

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const cible = args.find((a) => !a.startsWith("--"));
const racine = c.racineProjet(process.cwd());

const IGNORES = new Set(["node_modules", ".git", "target", "dist", ".angular", ".lelib", "tickets", "build", "out"]);
const FICHIER_TEST = /(\.(spec|test|e2e|cy)\.[jt]sx?|(Test|Tests|IT)\.java)$/;
const DOSSIER_TEST = /[\\/](src[\\/]test|e2e|tests?)[\\/]/;

function* fichiers(dir) {
  let entrees;
  try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entrees) {
    if (IGNORES.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* fichiers(p);
    else if (e.isFile()) yield p;
  }
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lireTicket(fichier) {
  const texte = fs.readFileSync(fichier, "utf8").replace(/\r\n/g, "\n");
  const id = (/^id:\s*(\S+)/m.exec(texte) || [])[1] || (/^([A-Za-z]+-\d+)/.exec(path.basename(fichier)) || [])[1];
  const debut = /^##\s+Crit[èe]res d'acceptation[^\n]*\n/m.exec(texte);
  let section = "";
  if (debut) {
    const reste = texte.slice(debut.index + debut[0].length);
    const fin = reste.search(/^##\s/m);
    section = fin === -1 ? reste : reste.slice(0, fin);
  }
  const criteres = [];
  let implicite = 0;
  for (const ligne of section.split("\n")) {
    const m = /^\s*[-*]\s+\[[ xX]\]\s*(.*)$/.exec(ligne);
    if (!m) continue;
    implicite++;
    const num = /\bCA-?(\d+)\b/i.exec(m[1]);
    criteres.push({ numero: num ? Number(num[1]) : implicite, numerote: Boolean(num), texte: m[1].replace(/^\**CA-?\d+\**\s*[:.)-]?\s*/i, "").trim() });
  }
  return { fichier, id, criteres };
}

function trouverTickets() {
  const dossier = path.join(racine, "tickets");
  if (cible) {
    if (fs.existsSync(cible) && fs.statSync(cible).isFile()) return [path.resolve(cible)];
    const trouves = [];
    for (const sous of [dossier, path.join(dossier, "done")]) {
      try {
        for (const f of fs.readdirSync(sous)) if (f.toLowerCase().startsWith(cible.toLowerCase()) && f.endsWith(".md")) trouves.push(path.join(sous, f));
      } catch { /* dossier absent */ }
    }
    return trouves;
  }
  try { return fs.readdirSync(dossier).filter((f) => f.endsWith(".md")).map((f) => path.join(dossier, f)); } catch { return []; }
}

function verifier(ticket, tests) {
  const resultat = [];
  for (const cr of ticket.criteres) {
    const re = new RegExp(`\\b${echapper(ticket.id)}\\b[\\s:/,._\\]\\[-]*CA-?${cr.numero}\\b`, "i");
    const dans = tests.filter((t) => re.test(t.texte)).map((t) => path.relative(racine, t.fichier).split(path.sep).join("/"));
    resultat.push({ ...cr, couvert: dans.length > 0, tests: dans });
  }
  return resultat;
}

function main() {
  const tickets = trouverTickets();
  if (!tickets.length) {
    const msg = cible ? `Ticket introuvable : ${cible}` : "Aucun ticket dans tickets/";
    console.log(AS_JSON ? JSON.stringify({ erreur: msg }) : msg);
    return 2;
  }
  const tests = [];
  for (const f of fichiers(racine)) {
    if (!FICHIER_TEST.test(f) && !DOSSIER_TEST.test(f)) continue;
    try { if (fs.statSync(f).size < 2 * 1024 * 1024) tests.push({ fichier: f, texte: fs.readFileSync(f, "utf8") }); } catch { /* illisible */ }
  }

  const rapports = [];
  let manque = false;
  for (const f of tickets) {
    let t;
    try { t = lireTicket(f); } catch (e) { console.error(`Ticket illisible : ${f} (${e.message})`); return 2; }
    const avertissements = [];
    if (!t.id) avertissements.push("identifiant du ticket introuvable (ligne `id:` ou nom de fichier)");
    if (!t.criteres.length) avertissements.push("aucun critère d'acceptation (cases `- [ ]`) : rien à vérifier");
    if (t.criteres.some((x) => !x.numerote)) avertissements.push("critères non numérotés : écris `CA-1 : …` pour que les tests puissent les citer (numéros déduits de l'ordre)");
    const criteres = t.id ? verifier(t, tests) : [];
    if (criteres.some((x) => !x.couvert)) manque = true;
    rapports.push({ ticket: path.relative(racine, f).split(path.sep).join("/"), id: t.id || null, criteres, avertissements });
  }

  if (AS_JSON) console.log(JSON.stringify(rapports, null, 2));
  else {
    for (const r of rapports) {
      const couverts = r.criteres.filter((x) => x.couvert).length;
      console.log(`${r.ticket} : ${couverts}/${r.criteres.length} critère(s) couvert(s)`);
      for (const x of r.criteres) console.log(`  ${x.couvert ? "✓" : "✗"} CA-${x.numero}  ${x.texte.slice(0, 80)}${x.couvert ? `  → ${x.tests.join(", ")}` : "  → aucun test ne le cite"}`);
      for (const a of r.avertissements) console.log(`  ⚠ ${a}`);
    }
  }
  return manque ? 1 : 0;
}

try { process.exit(main()); } catch (e) { console.error(`Erreur : ${e.message}`); process.exit(2); }
