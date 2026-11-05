// Prépare l'envoi d'un brouillon de ticket (tickets/<id>.md) vers Jira : valide le brouillon, calcule les
// points Fibonacci, normalise la priorité et construit la description. Écrit aussi la clé Jira obtenue
// dans l'en-tête du brouillon. Ne parle jamais à Jira : l'appel est fait par le skill /jira.
// Sans dépendance.
//
//   node jira-prepare.js <ticket> [--priorite <p>] [--json]
//   node jira-prepare.js <ticket> --enregistrer <CLE> --url <lien>
// <ticket> : numéro (1, 001), identifiant (bet-001) ou chemin du brouillon.
// Code de sortie : 0 prêt, 1 erreur bloquante (non chiffré, déjà créé, priorité inconnue…), 2 brouillon introuvable ou usage.
const fs = require("fs");
const path = require("path");

const ECHELLE = [1, 2, 3, 5, 8, 13];
const PRIORITES = ["Highest", "High", "Medium", "Low", "Lowest"];
const PRIORITE_DEFAUT = "Medium";
const ALIAS_PRIORITE = {
  Highest: ["highest", "critique", "bloquante", "bloquant", "p1"],
  High: ["high", "haute", "haut", "elevee", "importante", "p2"],
  Medium: ["medium", "moyenne", "moyen", "normale", "normal", "p3"],
  Low: ["low", "basse", "bas", "faible", "p4"],
  Lowest: ["lowest", "tres basse", "tres bas", "mineure", "minime", "p5"],
};
const TYPES = {
  fonctionnalite: { souhaite: "Story", candidats: ["Story", "Histoire", "User Story", "Récit"] },
  anomalie: { souhaite: "Bug", candidats: ["Bug", "Bogue", "Anomalie", "Défaut"] },
  technique: { souhaite: "Task", candidats: ["Task", "Tâche", "Technical Task"] },
};
const CLE_JIRA = /^[A-Z][A-Z0-9_]*-\d+$/;

const sansAccent = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Racine du projet : premier dossier parent qui contient .git, sinon le dossier courant.
function racineProjet(depart) {
  let dir = path.resolve(depart);
  const origine = dir;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return origine;
    dir = parent;
  }
}

// Fibonacci de l'échelle d'équipe : plus petite valeur supérieure ou égale à la somme, ou null au-delà de 13.
const fibonacciSuperieur = (somme) => ECHELLE.find((f) => f >= somme) || null;

function normaliserPriorite(saisie) {
  if (saisie === undefined || saisie === "") return { saisie: null, jira: PRIORITE_DEFAUT, defaut: true };
  const cle = sansAccent(saisie);
  for (const [nom, alias] of Object.entries(ALIAS_PRIORITE)) if (alias.includes(cle)) return { saisie, jira: nom, defaut: false };
  return { saisie, jira: null, defaut: false, erreur: `priorité inconnue : « ${saisie} ». Valeurs permises : ${PRIORITES.join(", ")} (ou haute, moyenne, basse, critique…).` };
}

// Lit l'en-tête (entre les deux lignes ---) et le corps d'un brouillon.
function lireBrouillon(texte) {
  const normalise = texte.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalise);
  if (!m) return { entete: {}, corps: normalise, avecEntete: false };
  const entete = {};
  for (const ligne of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(ligne);
    if (kv) entete[kv[1]] = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return { entete, corps: m[2], avecEntete: true };
}

// Sections « ## Titre » du corps : { titre normalisé: contenu }.
function sections(corps) {
  const resultat = {};
  const morceaux = corps.split(/^##\s+/m).slice(1);
  for (const morceau of morceaux) {
    const i = morceau.indexOf("\n");
    const titre = (i === -1 ? morceau : morceau.slice(0, i)).trim();
    resultat[sansAccent(titre)] = { titre, contenu: (i === -1 ? "" : morceau.slice(i + 1)).trim() };
  }
  return resultat;
}

const PLACEHOLDER = /^[-*]?\s*<[^>]*>\s*$/;
const vide = (contenu) => !contenu || contenu.split("\n").every((l) => !l.trim() || PLACEHOLDER.test(l.trim()));

function trouverBrouillon(racine, cible) {
  if (fs.existsSync(cible) && fs.statSync(cible).isFile()) return { fichier: path.resolve(cible) };
  const lister = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f)); } catch { return []; } };
  const termines = lister(path.join(racine, "tickets", "done"));
  const ouverts = lister(path.join(racine, "tickets"));
  const numero = /^\d+$/.test(cible) ? Number(cible) : null;
  const correspond = (f) => {
    const nom = path.basename(f).toLowerCase();
    if (numero !== null) { const m = /^[a-z]+-0*(\d+)/.exec(nom); return Boolean(m) && Number(m[1]) === numero; }
    return nom === `${cible.toLowerCase()}.md` || nom.startsWith(`${cible.toLowerCase()}-`) || nom.startsWith(`${cible.toLowerCase()}.`);
  };
  const trouves = ouverts.filter(correspond);
  if (trouves.length === 1) return { fichier: trouves[0] };
  if (trouves.length > 1) return { erreur: `plusieurs brouillons correspondent à « ${cible} » : ${trouves.map((f) => path.basename(f)).join(", ")}. Donne l'identifiant complet.` };
  if (termines.some(correspond)) return { erreur: `« ${cible} » est un ticket terminé (tickets/done/) : il ne s'envoie pas dans Jira.` };
  return { erreur: `brouillon introuvable : ${cible} (cherché dans ${path.join(racine, "tickets")})` };
}

function entier(valeur) {
  if (valeur === undefined || valeur === "") return { absent: true };
  const m = /^(\d+)(?!\d)/.exec(String(valeur).trim());
  return m ? { valeur: Number(m[1]) } : { invalide: String(valeur) };
}

function preparer(racine, cible, saisiePriorite) {
  const b = trouverBrouillon(racine, cible);
  if (b.erreur) return { code: 2, erreur: b.erreur };
  const texte = fs.readFileSync(b.fichier, "utf8");
  const { entete, corps } = lireBrouillon(texte);
  const erreurs = [];
  const avertissements = [];

  const id = entete.id || (/^([A-Za-z]+-\d+)/.exec(path.basename(b.fichier)) || [])[1] || null;
  const titre = entete.titre || (/^#\s+(?:\S+\s+[—-]\s+)?(.+)$/m.exec(corps) || [])[1] || null;
  if (!titre) erreurs.push("titre introuvable (ligne `titre:` de l'en-tête).");
  if (!id) erreurs.push("identifiant introuvable (ligne `id:` ou nom de fichier).");

  const dejaCree = entete.jira ? { cle: entete.jira, url: entete.jira_url || null } : null;
  if (dejaCree) erreurs.push(`ce brouillon a déjà un ticket Jira (${dejaCree.cle}) : rien n'est créé en double.`);

  const priorite = normaliserPriorite(saisiePriorite);
  if (priorite.erreur) erreurs.push(priorite.erreur);

  // Type de ticket Jira, d'après le champ `type` du brouillon.
  const typeBrut = entete.type ? sansAccent(entete.type) : "";
  let typeJira = TYPES[typeBrut];
  if (!typeJira) {
    typeJira = TYPES.technique;
    avertissements.push(`type « ${entete.type || "absent"} » non reconnu (fonctionnalité, anomalie, technique) : Task par défaut.`);
  }

  // Points : échelle Fibonacci, somme des côtés arrondie au Fibonacci supérieur.
  const back = entier(entete.points_back);
  const front = entier(entete.points_front);
  for (const [nom, p] of [["points_back", back], ["points_front", front]]) {
    if (p.invalide !== undefined) erreurs.push(`${nom} n'est pas un nombre : « ${p.invalide} ».`);
    else if (p.valeur !== undefined && !ECHELLE.includes(p.valeur)) erreurs.push(`${nom} = ${p.valeur} est hors de l'échelle Fibonacci (${ECHELLE.join(", ")}).`);
  }
  const presents = [back, front].filter((p) => p.valeur !== undefined).map((p) => p.valeur);
  let somme = null;
  let retenu = null;
  if (!presents.length && !erreurs.some((e) => /^points_/.test(e))) erreurs.push("brouillon non chiffré : ni `points_back` ni `points_front`. L'estimation est faite par les tech leads (agents techlead-back / techlead-front).");
  if (presents.length && !erreurs.some((e) => /^points_/.test(e))) {
    somme = presents.reduce((a, c) => a + c, 0);
    retenu = fibonacciSuperieur(somme);
    if (retenu === null) erreurs.push(`somme des points = ${somme}, au-delà de ${ECHELLE.at(-1)} : le ticket est trop gros, demande au PO de le découper.`);
  }
  if (/\(provisoire\)/i.test(corps) || /provisoire/i.test(`${entete.points_back || ""}${entete.points_front || ""}`)) avertissements.push("estimation provisoire (des questions restent ouvertes pour le PO).");
  if (entete.statut && sansAccent(entete.statut) !== "estime") avertissements.push(`statut « ${entete.statut} » : le brouillon n'est pas marqué « estimé » par les tech leads.`);
  if (/^##\s+Cadrage technique \(back\)/im.test(corps) && back.valeur === undefined) avertissements.push("un cadrage back existe mais `points_back` est absent : estimation incomplète.");
  if (/^##\s+Cadrage technique \(front\)/im.test(corps) && front.valeur === undefined) avertissements.push("un cadrage front existe mais `points_front` est absent : estimation incomplète.");

  // Description : sections du PO, puis le détail de l'estimation.
  const s = sections(corps);
  const ordre = [["contexte", "Contexte"], ["besoin", "Besoin"], ["criteres d'acceptation", "Critères d'acceptation"], ["hors perimetre", "Hors périmètre"], ["pistes techniques", "Pistes techniques"], ["questions ouvertes", "Questions ouvertes"]];
  const blocs = [];
  for (const [cle, libelle] of ordre) {
    const sec = s[cle];
    if (!sec || vide(sec.contenu)) continue;
    const contenu = cle === "criteres d'acceptation" ? sec.contenu.replace(/^(\s*[-*]\s+)\[[ xX]\]\s*/gm, "$1") : sec.contenu;
    blocs.push(`## ${libelle}\n${contenu}`);
  }
  if (somme !== null) {
    const detail = [back.valeur !== undefined ? `Back : ${back.valeur} pt` : null, front.valeur !== undefined ? `Front : ${front.valeur} pt` : null].filter(Boolean).join(" · ");
    blocs.push(`## Estimation\n${detail} · Total retenu : ${retenu === null ? `${somme} (hors échelle)` : retenu} (échelle Fibonacci)`);
  }
  if (id) blocs.push(`_Brouillon local : ${id}_`);

  let memo = null;
  try { memo = JSON.parse(fs.readFileSync(path.join(racine, "tickets", ".jira.json"), "utf8")); } catch { /* pas de mémo */ }

  return {
    code: erreurs.length ? 1 : 0,
    rapport: {
      ticket: { fichier: path.relative(racine, b.fichier).split(path.sep).join("/"), id, titre, type: entete.type || null, statut: entete.statut || null },
      typeJira,
      priorite: { saisie: priorite.saisie, jira: priorite.jira, defaut: priorite.defaut },
      points: { back: back.valeur ?? null, front: front.valeur ?? null, somme, retenu, echelle: ECHELLE },
      etiquette: id ? `lelib-${id}` : null,
      dejaCree,
      description: blocs.join("\n\n"),
      memo,
      erreurs,
      avertissements,
    },
  };
}

// Ajoute jira, jira_url et jira_cree_le à la fin de l'en-tête, sans toucher au reste du fichier.
function enregistrer(racine, cible, cle, url) {
  if (!CLE_JIRA.test(cle || "")) return { code: 1, erreur: `clé Jira invalide : « ${cle || ""} » (attendu : ABC-123).` };
  if (!/^https:\/\/\S+$/.test(url || "")) return { code: 1, erreur: `lien invalide : « ${url || ""} » (attendu : https://…).` };
  const b = trouverBrouillon(racine, cible);
  if (b.erreur) return { code: 2, erreur: b.erreur };
  const texte = fs.readFileSync(b.fichier, "utf8");
  const nl = texte.includes("\r\n") ? "\r\n" : "\n";
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(texte);
  if (!m) return { code: 2, erreur: "pas d'en-tête (---) dans le brouillon : rien n'est écrit." };
  if (/^jira:\s*\S/m.test(m[2])) return { code: 1, erreur: "le brouillon a déjà une clé Jira : rien n'est écrit." };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const ajout = `${nl}jira: ${cle}${nl}jira_url: ${url}${nl}jira_cree_le: ${aujourdhui}`;
  fs.writeFileSync(b.fichier, texte.slice(0, m.index + m[1].length + m[2].length) + ajout + texte.slice(m.index + m[1].length + m[2].length));
  return { code: 0, message: `${path.relative(racine, b.fichier)} : ${cle} enregistré.` };
}

function main(argv) {
  const valeurDe = (nom) => { const i = argv.indexOf(nom); return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined; };
  const options = new Set(["--priorite", "--enregistrer", "--url"]);
  const positionnels = argv.filter((a, i) => !a.startsWith("--") && !options.has(argv[i - 1]));
  const cible = positionnels[0];
  if (!cible) {
    console.error("Usage : jira-prepare.js <ticket> [--priorite <p>] [--json]   |   jira-prepare.js <ticket> --enregistrer <CLE> --url <lien>");
    return 2;
  }
  const racine = racineProjet(process.cwd());
  const json = argv.includes("--json");

  if (argv.includes("--enregistrer")) {
    const r = enregistrer(racine, cible, valeurDe("--enregistrer"), valeurDe("--url"));
    (r.code === 0 ? console.log : console.error)(r.message || r.erreur);
    return r.code;
  }

  const r = preparer(racine, cible, valeurDe("--priorite"));
  if (r.erreur) {
    console.log(json ? JSON.stringify({ erreurs: [r.erreur] }) : r.erreur);
    return r.code;
  }
  const p = r.rapport;
  if (json) console.log(JSON.stringify(p, null, 2));
  else {
    console.log(`${p.ticket.id} — ${p.ticket.titre}`);
    console.log(`Type Jira : ${p.typeJira.souhaite} (candidats : ${p.typeJira.candidats.join(", ")})`);
    console.log(`Priorité : ${p.priorite.jira || "?"}${p.priorite.defaut ? " (par défaut)" : ""}`);
    console.log(`Points : back ${p.points.back ?? "-"}, front ${p.points.front ?? "-"}, total ${p.points.somme ?? "-"} → ${p.points.retenu ?? "-"}`);
    for (const e of p.erreurs) console.log(`✗ ${e}`);
    for (const a of p.avertissements) console.log(`⚠ ${a}`);
  }
  return r.code;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`Erreur : ${e.message}`); process.exit(2); }
}
module.exports = { fibonacciSuperieur, normaliserPriorite, ECHELLE };
