// Branche par ticket pour /dev : prépare la branche avant de coder, puis commit et push à la fin.
// Sans dépendance (Node + git). N'utilise jamais merge, rebase, reset, stash, --force ni --no-verify.
//
//   node branche-dev.js preparer <ticket> [--depots a,b] [--base develop] [--json]
//     Pour chaque dépôt : arbre propre exigé, git fetch, checkout develop, pull --ff-only, création de
//     feature-<id> (fix-<id> pour une anomalie). Une branche déjà existante est reprise telle quelle.
//   node branche-dev.js terminer <ticket> [--depots a,b] [--coauteur "<ligne>"] [--sans-push] [--json]
//     Pour chaque dépôt : commit ciblé (les changements du ticket, rien d'autre), puis push de la branche.
// <ticket> : numéro (7, 007), identifiant (bet-007) ou chemin du ticket.
// Code de sortie : 0 ok, 1 refus ou échec, 2 ticket introuvable ou usage.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const BASE_DEFAUT = "develop";
const PROTEGEES = ["develop", "main", "master"];

function git(dir, args, input) {
  const r = spawnSync("git", args, { cwd: dir, input, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status === null ? 1 : r.status, out: (r.stdout || "").replace(/\r?\n$/, ""), err: (r.stderr || "").trim() };
}

const aUnGit = (dir) => fs.existsSync(path.join(dir, ".git"));

function sousDossiers(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")).map((e) => path.join(dir, e.name)); } catch { return []; }
}

// Dossier du projet (celui qui contient tickets/) : le dossier courant ou l'un de ses parents.
function racineTickets(depart) {
  let dir = path.resolve(depart);
  const origine = dir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "tickets"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return origine;
    dir = parent;
  }
}

// Dépôts git du projet : le dossier courant s'il en est un, sinon ses sous-dossiers qui en sont (back, front),
// sinon le premier parent qui en est un.
function trouverDepots(depart) {
  const dir = path.resolve(depart);
  if (aUnGit(dir)) return [{ nom: ".", chemin: dir }];
  const enfants = sousDossiers(dir).filter(aUnGit);
  if (enfants.length) return enfants.map((c) => ({ nom: path.basename(c), chemin: c }));
  let parent = path.dirname(dir);
  for (;;) {
    if (aUnGit(parent)) return [{ nom: ".", chemin: parent }];
    const suivant = path.dirname(parent);
    if (suivant === parent) return [];
    parent = suivant;
  }
}

function lireEntete(texte) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texte);
  const entete = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(l); if (kv) entete[kv[1]] = kv[2].trim().replace(/^["'](.*)["']$/, "$1"); }
  return entete;
}

const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function trouverTicket(racine, cible, { aussiTermines }) {
  if (fs.existsSync(cible) && fs.statSync(cible).isFile()) return { fichier: path.resolve(cible) };
  const lister = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f)); } catch { return []; } };
  const numero = /^\d+$/.test(cible) ? Number(cible) : null;
  const correspond = (f) => {
    const nom = path.basename(f).toLowerCase();
    if (numero !== null) { const m = /^[a-z]+-0*(\d+)/.exec(nom); return Boolean(m) && Number(m[1]) === numero; }
    const c = cible.toLowerCase();
    return nom === `${c}.md` || nom.startsWith(`${c}-`) || nom.startsWith(`${c}.`);
  };
  const ouverts = lister(path.join(racine, "tickets")).filter(correspond);
  const termines = lister(path.join(racine, "tickets", "done")).filter(correspond);
  const trouves = aussiTermines ? [...ouverts, ...termines] : ouverts;
  if (trouves.length === 1) return { fichier: trouves[0] };
  if (trouves.length > 1) return { erreur: `plusieurs tickets correspondent à « ${cible} » : ${trouves.map((f) => path.basename(f)).join(", ")}. Donne l'identifiant complet.` };
  if (termines.length) return { erreur: `« ${cible} » est un ticket terminé (tickets/done/) : pas de branche à créer.` };
  return { erreur: `ticket introuvable : ${cible} (cherché dans ${path.join(racine, "tickets")})` };
}

function infosTicket(fichier) {
  return infosTicketTexte(fs.readFileSync(fichier, "utf8"), path.basename(fichier));
}

function infosTicketTexte(texte, nomFichier) {
  const entete = lireEntete(texte);
  const id = (entete.id || (/^([A-Za-z]+-\d+)/.exec(nomFichier) || [])[1] || "").toLowerCase();
  if (!/^[a-z0-9]+-\d+$/.test(id)) return { erreur: `identifiant de ticket introuvable ou invalide dans ${nomFichier} (ligne \`id:\`).` };
  const prefixe = sansAccent(entete.type) === "anomalie" ? "fix" : "feature";
  return { id, titre: entete.titre || id, type: entete.type || null, prefixe, branche: `${prefixe}-${id}` };
}

// État de l'arbre de travail d'un dépôt, avec chemins relatifs à ce dépôt.
function etatArbre(dir, ticketsRel) {
  // Lecture brute : la sortie -z ne doit pas être « nettoyée » comme celle des autres commandes.
  const r = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { erreur: `git status a échoué : ${(r.stderr || "").trim()}` };
  const brut = (r.stdout || "").split("\0");
  const suivis = [];
  const nonSuivis = [];
  for (let i = 0; i < brut.length; i++) {
    const e = brut[i];
    if (!e) continue;
    const xy = e.slice(0, 2);
    const chemin = e.slice(3);
    const renomme = xy[0] === "R" || xy[0] === "C" || xy[1] === "R" || xy[1] === "C";
    const origine = renomme ? brut[++i] : null;
    const entree = { xy, chemin, origine };
    (xy === "??" ? nonSuivis : suivis).push(entree);
  }
  const dansTickets = (c) => ticketsRel !== null && (c === ticketsRel || c.startsWith(`${ticketsRel}/`));
  return { suivis, nonSuivis, dansTickets };
}

const ticketsRelatif = (depot, racine) => {
  const rel = path.relative(depot, path.join(racine, "tickets")).split(path.sep).join("/");
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel;
};

function branchCourante(dir) {
  const r = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.code === 0 ? r.out : null;
}
const existe = (dir, ref) => git(dir, ["rev-parse", "--verify", "--quiet", ref]).code === 0;

function dossierSnapshot(depot) { return path.join(depot, ".lelib", "dev"); }
function ecrireSnapshot(depot, branche, donnees) {
  const dir = dossierSnapshot(depot);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  fs.writeFileSync(path.join(dir, `${branche}.json`), JSON.stringify(donnees));
}
function lireSnapshot(depot, branche) {
  try { return JSON.parse(fs.readFileSync(path.join(dossierSnapshot(depot), `${branche}.json`), "utf8")); } catch { return null; }
}

function choisirDepots(tous, filtre) {
  if (!filtre) return { depots: tous };
  const noms = filtre.split(",").map((s) => s.trim()).filter(Boolean);
  const choisis = tous.filter((d) => noms.includes(d.nom) || noms.includes(path.basename(d.chemin)));
  const inconnus = noms.filter((n) => !tous.some((d) => d.nom === n || path.basename(d.chemin) === n));
  if (inconnus.length) return { erreur: `dépôt inconnu : ${inconnus.join(", ")}. Dépôts trouvés : ${tous.map((d) => d.nom).join(", ") || "aucun"}.` };
  return { depots: choisis };
}

function preparer(racine, depots, ticket, base) {
  const resultats = [];
  // Phase 1 : rien n'est modifié tant que tous les dépôts ne sont pas jugés propres.
  const plans = [];
  for (const d of depots) {
    const r = { depot: d.nom, chemin: d.chemin, branche: ticket.branche, avertissements: [] };
    const arbre = etatArbre(d.chemin, ticketsRelatif(d.chemin, racine));
    if (arbre.erreur) { r.etat = "refuse"; r.erreur = arbre.erreur; resultats.push(r); continue; }
    const sales = arbre.suivis.filter((e) => !arbre.dansTickets(e.chemin));
    if (sales.length) {
      r.etat = "refuse";
      r.erreur = `l'arbre de travail n'est pas propre (${sales.length} fichier(s) modifié(s) : ${sales.slice(0, 5).map((e) => e.chemin).join(", ")}${sales.length > 5 ? ", …" : ""}). Commite ou range ces changements toi-même, puis relance : rien n'est caché ni écarté automatiquement.`;
      resultats.push(r);
      continue;
    }
    const nonSuivis = arbre.nonSuivis.filter((e) => !arbre.dansTickets(e.chemin)).map((e) => e.chemin);
    if (nonSuivis.length) r.avertissements.push(`${nonSuivis.length} fichier(s) non suivi(s) présent(s) avant le développement (${nonSuivis.slice(0, 3).join(", ")}${nonSuivis.length > 3 ? ", …" : ""}) : ils ne seront pas ajoutés au commit.`);
    plans.push({ d, r, nonSuivis });
  }
  if (resultats.some((r) => r.etat === "refuse")) return { code: 1, resultats: [...resultats, ...plans.map((p) => ({ ...p.r, etat: "non-traite" }))] };

  // Phase 2 : préparation de chaque dépôt.
  for (const { d, r, nonSuivis } of plans) {
    resultats.push(r);
    const origineBranche = branchCourante(d.chemin);
    const aOrigin = git(d.chemin, ["remote"]).out.split(/\r?\n/).includes("origin");
    if (aOrigin) {
      const f = git(d.chemin, ["fetch", "origin"]);
      if (f.code !== 0) { r.etat = "echec"; r.erreur = `git fetch impossible (${f.err}) : impossible de garantir un ${base} à jour.`; return { code: 1, resultats }; }
    } else r.avertissements.push("aucun dépôt distant « origin » : pas de pull ni de push, la branche part du " + base + " local.");

    const locale = existe(d.chemin, `refs/heads/${ticket.branche}`);
    const distante = aOrigin && existe(d.chemin, `refs/remotes/origin/${ticket.branche}`);
    if (locale || distante) {
      const c = git(d.chemin, ["checkout", ticket.branche]);
      if (c.code !== 0) { r.etat = "echec"; r.erreur = `checkout de ${ticket.branche} impossible : ${c.err}`; return { code: 1, resultats }; }
      r.etat = "reprise";
      r.avertissements.push(`la branche ${ticket.branche} existait déjà : reprise telle quelle, ${base} n'y est pas fusionné (fais-le toi-même si elle est en retard).`);
    } else {
      if (!existe(d.chemin, `refs/heads/${base}`) && !(aOrigin && existe(d.chemin, `refs/remotes/origin/${base}`))) {
        r.etat = "echec"; r.erreur = `branche ${base} introuvable (ni locale ni sur origin) : pas de repli sur une autre branche. Utilise --base pour en choisir une.`;
        return { code: 1, resultats };
      }
      const c = git(d.chemin, ["checkout", base]);
      if (c.code !== 0) { r.etat = "echec"; r.erreur = `checkout de ${base} impossible : ${c.err}`; return { code: 1, resultats }; }
      if (aOrigin) {
        const p = git(d.chemin, ["pull", "--ff-only", "origin", base]);
        if (p.code !== 0) {
          if (origineBranche && origineBranche !== base) git(d.chemin, ["checkout", origineBranche]);
          r.etat = "echec"; r.erreur = `git pull --ff-only origin ${base} impossible (${p.err.split(/\r?\n/)[0]}) : ${base} local a divergé. Rien n'a été fusionné ni réécrit ; remets ${base} d'aplomb toi-même.`;
          return { code: 1, resultats };
        }
        r.pull = /Already up to date|Déjà à jour/i.test(p.out + p.err) ? "deja-a-jour" : "ok";
      } else r.pull = "ignore";
      const b = git(d.chemin, ["checkout", "-b", ticket.branche]);
      if (b.code !== 0) { r.etat = "echec"; r.erreur = `création de ${ticket.branche} impossible : ${b.err}`; return { code: 1, resultats }; }
      r.etat = "creee";
    }
    r.base = base;
    if (!lireSnapshot(d.chemin, ticket.branche)) ecrireSnapshot(d.chemin, ticket.branche, { base, cree_le: new Date().toISOString(), nonSuivis });
  }
  return { code: 0, resultats };
}

function terminer(racine, depots, ticket, { coauteur, sansPush }) {
  const resultats = [];
  let code = 0;
  for (const d of depots) {
    const r = { depot: d.nom, chemin: d.chemin, branche: ticket.branche };
    resultats.push(r);
    const courante = branchCourante(d.chemin);
    if (courante !== ticket.branche || PROTEGEES.includes(courante)) {
      r.etat = "refuse"; r.erreur = `on est sur « ${courante} » et non sur ${ticket.branche} : rien n'est commité.`;
      code = 1; continue;
    }
    const ticketsRel = ticketsRelatif(d.chemin, racine);
    const arbre = etatArbre(d.chemin, ticketsRel);
    if (arbre.erreur) { r.etat = "echec"; r.erreur = arbre.erreur; code = 1; continue; }
    const snapshot = lireSnapshot(d.chemin, ticket.branche);
    const avantNonSuivis = new Set(snapshot ? snapshot.nonSuivis : []);
    const duTicket = (chemin) => {
      const nom = path.posix.basename(chemin).toLowerCase();
      return nom.startsWith(`${ticket.id}-`) || nom.startsWith(`${ticket.id}.`);
    };
    const aAjouter = new Set();
    for (const e of [...arbre.suivis, ...arbre.nonSuivis]) {
      const chemins = [e.chemin, ...(e.origine ? [e.origine] : [])];
      for (const c of chemins) {
        if (arbre.dansTickets(c)) { if (duTicket(c)) aAjouter.add(c); continue; }
        if (e.xy === "??" && avantNonSuivis.has(c)) continue;
        aAjouter.add(c);
      }
    }
    // Le fichier du ticket seul ne fait pas un commit : il accompagne un changement de code.
    if (![...aAjouter].some((c) => !arbre.dansTickets(c))) { r.etat = "rien"; r.message = "aucun changement de code à commiter (le fichier du ticket seul ne fait pas un commit)."; r.fichiers = 0; continue; }
    const liste = [...aAjouter];
    const entree = `${liste.join("\0")}\0`;
    const add = git(d.chemin, ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], entree);
    if (add.code !== 0) { r.etat = "echec"; r.erreur = `git add a échoué : ${add.err}`; code = 1; continue; }
    const message = `${ticket.prefixe}(${ticket.id}): ${ticket.titre}`;
    const args = ["commit", "--only", "-m", message];
    if (coauteur) args.push("-m", coauteur);
    args.push("--pathspec-from-file=-", "--pathspec-file-nul");
    const c = git(d.chemin, args, entree);
    if (c.code !== 0) { r.etat = "echec"; r.erreur = `git commit a échoué (hooks ou identité git ?) : ${(c.err || c.out).split(/\r?\n/).slice(0, 4).join(" | ")}`; code = 1; continue; }
    r.etat = "commite";
    r.fichiers = liste.length;
    r.commit = git(d.chemin, ["rev-parse", "--short", "HEAD"]).out;
    r.message = message;

    const aOrigin = git(d.chemin, ["remote"]).out.split(/\r?\n/).includes("origin");
    if (sansPush) r.push = "non-demande";
    else if (!aOrigin) r.push = "ignore (pas de dépôt distant origin)";
    else {
      const p = git(d.chemin, ["push", "-u", "origin", ticket.branche]);
      if (p.code === 0) r.push = "ok";
      else { r.push = `echec : ${p.err.split(/\r?\n/).filter(Boolean).slice(-2).join(" | ")}`; r.erreur = "le commit est conservé en local, mais le push a échoué."; code = 1; }
    }
  }
  return { code, resultats };
}

function afficher(commande, ticket, sortie, json) {
  if (json) { console.log(JSON.stringify({ ticket: { id: ticket.id, branche: ticket.branche, prefixe: ticket.prefixe }, ...sortie }, null, 2)); return; }
  for (const r of sortie.resultats) {
    const etat = { creee: "branche créée", reprise: "branche reprise", commite: "commit fait", rien: "rien à commiter", refuse: "refusé", echec: "échec", "non-traite": "non traité" }[r.etat] || r.etat;
    console.log(`[${r.depot}] ${r.branche} : ${etat}${r.pull ? ` (pull ${r.pull})` : ""}${r.commit ? ` ${r.commit}, ${r.fichiers} fichier(s), push ${r.push}` : ""}`);
    if (r.erreur) console.log(`  ✗ ${r.erreur}`);
    if (r.message && r.etat === "rien") console.log(`  ${r.message}`);
    for (const a of r.avertissements || []) console.log(`  ⚠ ${a}`);
  }
}

function main(argv) {
  const commande = argv[0];
  const valeurDe = (nom) => { const i = argv.indexOf(nom); return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined; };
  const avecValeur = new Set(["--depots", "--base", "--coauteur"]);
  const positionnels = argv.slice(1).filter((a, i, tab) => !a.startsWith("--") && !avecValeur.has(tab[i - 1]));
  const cible = positionnels[0];
  const json = argv.includes("--json");
  if (!["preparer", "terminer"].includes(commande) || !cible) {
    console.error("Usage : branche-dev.js preparer <ticket> [--depots a,b] [--base develop]   |   branche-dev.js terminer <ticket> [--depots a,b] [--coauteur \"<ligne>\"] [--sans-push]");
    return 2;
  }
  const racine = racineTickets(process.cwd());
  const t = trouverTicket(racine, cible, { aussiTermines: commande === "terminer" });
  if (t.erreur) { console.log(json ? JSON.stringify({ erreur: t.erreur }) : t.erreur); return 2; }
  const ticket = infosTicket(t.fichier);
  if (ticket.erreur) { console.log(json ? JSON.stringify({ erreur: ticket.erreur }) : ticket.erreur); return 2; }

  const tous = trouverDepots(racine);
  if (!tous.length) {
    const msg = "aucun dépôt git trouvé : pas de branche créée ni de commit. Le développement peut continuer sans git.";
    console.log(json ? JSON.stringify({ ticket: { id: ticket.id, branche: ticket.branche, prefixe: ticket.prefixe }, resultats: [], avertissements: [msg] }) : `⚠ ${msg}`);
    return 0;
  }
  const choix = choisirDepots(tous, valeurDe("--depots"));
  if (choix.erreur) { console.log(json ? JSON.stringify({ erreur: choix.erreur }) : choix.erreur); return 2; }

  const sortie = commande === "preparer"
    ? preparer(racine, choix.depots, ticket, valeurDe("--base") || BASE_DEFAUT)
    : terminer(racine, choix.depots, ticket, { coauteur: valeurDe("--coauteur"), sansPush: argv.includes("--sans-push") });
  afficher(commande, ticket, sortie, json);
  return sortie.code;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`Erreur : ${e.message}`); process.exit(2); }
}
module.exports = { git, existe, racineTickets, trouverDepots, trouverTicket, infosTicket, infosTicketTexte, choisirDepots, lireEntete, etatArbre, ticketsRelatif, BASE_DEFAUT };
