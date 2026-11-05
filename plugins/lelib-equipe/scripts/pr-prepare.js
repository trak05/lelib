// Pull request d'un ticket : vérifie que la branche feature-<id> / fix-<id> est prête, construit le titre et le
// corps de la PR à partir du ticket, puis la crée avec la CLI GitHub (gh) vers develop.
// Sans dépendance (Node, git, gh). Ne pousse rien, ne fusionne rien, ne modifie ni le ticket ni la PR d'un autre.
//
//   node pr-prepare.js preparer <ticket> [--depots a,b] [--base develop] [--json]
//     Contrôles et aperçu, sans rien créer.
//   node pr-prepare.js creer <ticket> [--depots a,b] [--base develop] [--brouillon] [--json]
//     Mêmes contrôles, puis `gh pr create` dans chaque dépôt prêt.
// <ticket> : numéro (7, 007), identifiant (bet-007) ou chemin ; le ticket peut être dans tickets/ ou tickets/done/.
// LELIB_GH : chemin d'un autre exécutable gh (un fichier .js est lancé avec node).
// Code de sortie : 0 ok, 1 refus ou échec, 2 ticket introuvable ou usage.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const b = require("./branche-dev");

function gh(args, cwd) {
  const exe = process.env.LELIB_GH || "gh";
  const [cmd, cmdArgs] = exe.endsWith(".js") ? [process.execPath, [exe, ...args]] : [exe, args];
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", GIT_TERMINAL_PROMPT: "0" } });
  if (r.error) return { code: 127, out: "", err: r.error.code === "ENOENT" ? "gh introuvable (CLI GitHub non installée)" : r.error.message };
  return { code: r.status === null ? 1 : r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

const PLACEHOLDER = /^[-*]?\s*<[^>]*>\s*$/;
const vide = (contenu) => !contenu || contenu.split("\n").every((l) => !l.trim() || PLACEHOLDER.test(l.trim()));

function sectionsDe(texte) {
  const resultat = {};
  for (const morceau of texte.replace(/\r\n/g, "\n").split(/^##\s+/m).slice(1)) {
    const i = morceau.indexOf("\n");
    const titre = (i === -1 ? morceau : morceau.slice(0, i)).trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    resultat[titre] = (i === -1 ? "" : morceau.slice(i + 1)).trim();
  }
  return resultat;
}

// Résumé du journal TDD du dépôt (lelib-tdd), s'il existe : lancements, rouges valides, cycles rouge → vert.
function resumeTdd(depot) {
  let texte;
  try { texte = fs.readFileSync(path.join(depot, ".lelib", "tdd", "journal.jsonl"), "utf8"); } catch { return null; }
  const runs = [];
  for (const l of texte.split("\n")) { try { const e = JSON.parse(l); if (e && e.etat) runs.push(e); } catch { /* ligne abîmée */ } }
  if (!runs.length) return null;
  const valide = (e) => e.etat === "rouge" && (e.cause === "assertion" || e.cause === "compilation");
  let cycles = 0;
  let attend = false;
  for (const e of runs) { if (valide(e)) attend = true; else if (e.etat === "vert" && attend) { cycles++; attend = false; } }
  return `TDD : ${runs.length} lancement(s) de tests, ${runs.filter(valide).length} rouge(s) valide(s), ${cycles} cycle(s) rouge → vert.`;
}

function construireCorps({ ticket, entete, texte, depot, autresDepots, base, tdd }) {
  const s = sectionsDe(texte);
  const blocs = [];
  const points = [entete.points_back ? `back ${entete.points_back} pt` : null, entete.points_front ? `front ${entete.points_front} pt` : null].filter(Boolean).join(", ");
  const jira = entete.jira ? (entete.jira_url ? `[${entete.jira}](${entete.jira_url})` : entete.jira) : null;
  const lignes = [`**${ticket.id}** — ${ticket.titre}`];
  if (jira) lignes.push(`Jira : ${jira}`);
  if (ticket.type) lignes.push(`Type : ${ticket.type}`);
  if (points) lignes.push(`Estimation : ${points}`);
  if (autresDepots.length) lignes.push(`Dépôt : ${depot} (ce ticket touche aussi : ${autresDepots.join(", ")}, avec sa propre PR)`);
  blocs.push(`## Ticket\n${lignes.join("\n\n")}`);
  if (s.besoin && !vide(s.besoin)) blocs.push(`## Besoin\n${s.besoin}`);
  const criteres = s["criteres d'acceptation"];
  if (criteres && !vide(criteres)) blocs.push(`## Critères d'acceptation\n${criteres}`);
  if (tdd) blocs.push(`## Vérifications\n${tdd}`);
  blocs.push(`## Revue\n\`${ticket.branche}\` → \`${base}\`. Les tests passent selon le compte rendu de \`/dev\` : relire le code, les tests et la couverture des critères ci-dessus.`);
  return blocs.join("\n\n");
}

function preparerDepot(d, ctx) {
  const { ticket, base, racine, entete, texte, autres } = ctx;
  const r = { depot: d.nom, chemin: d.chemin, branche: ticket.branche, base, titre: `${ticket.prefixe}(${ticket.id}): ${ticket.titre}`, corps: null, commits: 0, dejaOuverte: null, erreurs: [], avertissements: [] };
  const git = (...args) => b.git(d.chemin, args);
  if (!git("remote").out.split(/\r?\n/).includes("origin")) { r.erreurs.push("aucun dépôt distant « origin » : pas de PR possible."); return r; }
  const f = git("fetch", "origin");
  if (f.code !== 0) { r.erreurs.push(`git fetch impossible (${f.err}) : impossible de vérifier que la branche est poussée.`); return r; }
  if (!b.existe(d.chemin, `refs/heads/${ticket.branche}`)) { r.erreurs.push(`la branche ${ticket.branche} n'existe pas dans ce dépôt : lance /dev ${ticket.id} d'abord.`); return r; }
  if (!b.existe(d.chemin, `refs/remotes/origin/${ticket.branche}`)) { r.erreurs.push(`la branche ${ticket.branche} n'est pas poussée sur origin : pousse-la d'abord (/dev le fait à la clôture d'un ticket terminé).`); return r; }
  const nonPousses = Number(git("rev-list", "--count", `origin/${ticket.branche}..${ticket.branche}`).out);
  if (nonPousses > 0) r.erreurs.push(`${nonPousses} commit(s) de ${ticket.branche} ne sont pas poussés sur origin : pousse-les, la PR n'en tiendrait pas compte.`);
  if (!b.existe(d.chemin, `refs/remotes/origin/${base}`)) { r.erreurs.push(`la branche de destination ${base} est introuvable sur origin.`); return r; }
  r.commits = Number(git("rev-list", "--count", `origin/${base}..origin/${ticket.branche}`).out) || 0;
  if (!r.commits) r.erreurs.push(`aucun commit de ${ticket.branche} à proposer par rapport à ${base} : rien à relire.`);

  const arbre = b.etatArbre(d.chemin, b.ticketsRelatif(d.chemin, racine));
  if (!arbre.erreur) {
    const sales = arbre.suivis.filter((e) => !arbre.dansTickets(e.chemin));
    if (sales.length) r.avertissements.push(`${sales.length} fichier(s) modifié(s) non commité(s) dans ce dépôt : ils ne seront pas dans la PR.`);
  }
  const ouvertes = gh(["pr", "list", "--head", ticket.branche, "--base", base, "--state", "open", "--json", "number,url"], d.chemin);
  if (ouvertes.code !== 0) { r.erreurs.push(`gh n'a pas pu interroger GitHub pour ce dépôt : ${ouvertes.err.split(/\r?\n/)[0] || "erreur inconnue"}.`); return r; }
  let liste = [];
  try { liste = JSON.parse(ouvertes.out || "[]"); } catch { r.erreurs.push("réponse de gh illisible (pr list)."); return r; }
  if (liste.length) { r.dejaOuverte = liste[0]; r.erreurs.push(`une PR est déjà ouverte pour ${ticket.branche} vers ${base} : #${liste[0].number} ${liste[0].url}. Aucune PR en double n'est créée.`); }

  r.corps = construireCorps({ ticket, entete, texte, depot: d.nom, autresDepots: autres, base, tdd: resumeTdd(d.chemin) });
  return r;
}

// Un ticket terminé n'existe que sur sa branche une fois qu'on est revenu sur develop : on le relit alors
// dans feature-<id> ou fix-<id> (identifiant ou numéro donné), sans changer de branche.
function ticketDepuisBranches(depots, cible) {
  const numero = /^\d+$/.test(cible) ? Number(cible) : null;
  const trouves = [];
  for (const d of depots) {
    const refs = b.git(d.chemin, ["for-each-ref", "--format=%(refname:short)", "refs/heads/feature-*", "refs/heads/fix-*"]).out.split(/\r?\n/).filter(Boolean);
    for (const ref of refs) {
      const id = ref.replace(/^(feature|fix)-/, "").toLowerCase();
      const m = /-0*(\d+)$/.exec(id);
      if (numero !== null ? !(m && Number(m[1]) === numero) : id !== cible.toLowerCase()) continue;
      const fichiers = b.git(d.chemin, ["-c", "core.quotepath=off", "ls-tree", "-r", "--name-only", ref, "--", "tickets"]).out.split(/\r?\n/).filter(Boolean);
      const fichier = fichiers.find((f) => { const nom = path.posix.basename(f).toLowerCase(); return nom.startsWith(`${id}-`) || nom.startsWith(`${id}.`); });
      if (!fichier) continue;
      const texte = b.git(d.chemin, ["show", `${ref}:${fichier}`]).out;
      trouves.push({ texte, nom: path.posix.basename(fichier), termine: /(^|\/)done\//.test(fichier), source: `${ref}:${fichier}`, ref });
    }
  }
  const refs = [...new Set(trouves.map((t) => t.ref))];
  return refs.length === 1 ? trouves.find((t) => t.ref === refs[0]) : null;
}

function preparer(racine, cible, options) {
  let source;
  const t = b.trouverTicket(racine, cible, { aussiTermines: true });
  if (!t.erreur) source = { texte: fs.readFileSync(t.fichier, "utf8"), nom: path.basename(t.fichier), termine: /[\\/]done[\\/]/.test(t.fichier) };
  else {
    const repli = ticketDepuisBranches(b.trouverDepots(racine), cible);
    if (!repli) return { code: 2, erreur: `${t.erreur}. Si le ticket a été terminé sur sa branche, repasse sur feature-<id> ou fix-<id> (ou donne l'identifiant complet, par exemple bet-007).` };
    source = repli;
  }
  const ticket = b.infosTicketTexte(source.texte, source.nom);
  if (ticket.erreur) return { code: 2, erreur: ticket.erreur };
  const texte = source.texte;
  const entete = b.lireEntete(texte);
  const global = { erreurs: [], avertissements: [] };
  if (source.source) global.avertissements.push(`ticket relu dans la branche ${source.source} (il n'est pas dans le dossier de travail courant).`);

  if (/^##\s+Blocage/m.test(texte)) global.erreurs.push("le ticket contient une section « Blocage » : le travail n'est pas terminé, pas de PR.");
  const termine = source.termine || /^termin/i.test((entete.statut || "").normalize("NFD").replace(/[̀-ͯ]/g, ""));
  if (!termine) global.avertissements.push(`le ticket n'est pas marqué terminé (statut « ${entete.statut || "?"} », hors de tickets/done/).`);

  const tous = b.trouverDepots(racine);
  if (!tous.length) { global.erreurs.push("aucun dépôt git trouvé : pas de PR possible."); return { code: 1, ticket, global, depots: [] }; }
  const choix = b.choisirDepots(tous, options.depots);
  if (choix.erreur) return { code: 2, erreur: choix.erreur };

  // Sans --depots, un dépôt où le ticket n'a pas de branche n'est simplement pas concerné.
  let aTraiter = choix.depots;
  if (!options.depots && aTraiter.length > 1) {
    const avecBranche = aTraiter.filter((d) => b.existe(d.chemin, `refs/heads/${ticket.branche}`) || b.existe(d.chemin, `refs/remotes/origin/${ticket.branche}`));
    if (avecBranche.length && avecBranche.length < aTraiter.length) {
      global.avertissements.push(`dépôt(s) sans branche ${ticket.branche}, ignoré(s) : ${aTraiter.filter((d) => !avecBranche.includes(d)).map((d) => d.nom).join(", ")}.`);
      aTraiter = avecBranche;
    }
  }
  const auth = gh(["auth", "status"], aTraiter[0].chemin);
  if (auth.code !== 0) global.erreurs.push(`gh n'est pas utilisable : ${auth.err.split(/\r?\n/)[0] || "non connecté"}. Installe la CLI GitHub et lance toi-même \`gh auth login\` : aucun jeton n'est demandé ici.`);

  const depots = [];
  if (!auth.code) {
    for (const d of aTraiter) {
      const autres = aTraiter.filter((x) => x !== d).map((x) => x.nom);
      depots.push(preparerDepot(d, { ticket, base: options.base, racine, entete, texte, autres }));
    }
  }
  const erreur = global.erreurs.length > 0 || depots.some((d) => d.erreurs.length > 0);
  return { code: erreur ? 1 : 0, ticket, global, depots };
}

function creer(racine, cible, options) {
  const p = preparer(racine, cible, options);
  if (p.code !== 0) return p;
  const crees = [];
  for (const d of p.depots) {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "lelib-pr-"));
    const fichier = path.join(dossier, "corps.md");
    try {
      fs.writeFileSync(fichier, d.corps);
      const args = ["pr", "create", "--base", d.base, "--head", d.branche, "--title", d.titre, "--body-file", fichier];
      if (options.brouillon) args.push("--draft");
      const r = gh(args, d.chemin);
      const url = (/https?:\/\/\S+\/pull\/\d+/.exec(`${r.out}\n${r.err}`) || [])[0];
      if (r.code !== 0 || !url) {
        d.erreurs.push(`gh pr create a échoué : ${(r.err || r.out || "pas d'URL renvoyée").split(/\r?\n/).slice(0, 3).join(" | ")}`);
        return { ...p, code: 1, crees };
      }
      d.pr = { url, numero: Number(url.split("/").pop()), brouillon: Boolean(options.brouillon) };
      crees.push({ depot: d.depot, ...d.pr });
    } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
  }
  return { ...p, crees };
}

function afficher(sortie, json) {
  if (json) { console.log(JSON.stringify({ ticket: sortie.ticket && { id: sortie.ticket.id, branche: sortie.ticket.branche }, global: sortie.global, crees: sortie.crees, depots: sortie.depots }, null, 2)); return; }
  for (const e of sortie.global.erreurs) console.log(`✗ ${e}`);
  for (const a of sortie.global.avertissements) console.log(`⚠ ${a}`);
  for (const d of sortie.depots) {
    console.log(`[${d.depot}] ${d.branche} → ${d.base} : ${d.titre} (${d.commits} commit(s))${d.pr ? ` — PR créée : ${d.pr.url}` : ""}`);
    for (const e of d.erreurs) console.log(`  ✗ ${e}`);
    for (const a of d.avertissements) console.log(`  ⚠ ${a}`);
  }
}

function main(argv) {
  const commande = argv[0];
  const valeurDe = (nom) => { const i = argv.indexOf(nom); return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined; };
  const avecValeur = new Set(["--depots", "--base"]);
  const cible = argv.slice(1).filter((a, i, tab) => !a.startsWith("--") && !avecValeur.has(tab[i - 1]))[0];
  const json = argv.includes("--json");
  if (!["preparer", "creer"].includes(commande) || !cible) {
    console.error("Usage : pr-prepare.js preparer|creer <ticket> [--depots a,b] [--base develop] [--brouillon] [--json]");
    return 2;
  }
  const racine = b.racineTickets(process.cwd());
  const options = { depots: valeurDe("--depots"), base: valeurDe("--base") || b.BASE_DEFAUT, brouillon: argv.includes("--brouillon") };
  const sortie = commande === "preparer" ? preparer(racine, cible, options) : creer(racine, cible, options);
  if (sortie.erreur) { console.log(json ? JSON.stringify({ erreur: sortie.erreur }) : sortie.erreur); return sortie.code; }
  afficher(sortie, json);
  return sortie.code;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`Erreur : ${e.message}`); process.exit(2); }
}
module.exports = { construireCorps };
