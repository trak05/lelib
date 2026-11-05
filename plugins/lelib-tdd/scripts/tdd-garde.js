// Hook PreToolUse (Write | Edit | MultiEdit) : avant de modifier du code de production, vérifie que le
// journal TDD contient un test rouge (ou une phase refactor déclarée). Les fichiers de test et de
// configuration passent toujours.
//
// Par défaut le hook AVERTIT (sortie 0, message renvoyé à l'agent). LELIB_TDD=bloquer refuse la
// modification (sortie 2), LELIB_TDD=off désactive le contrôle. Il ne plante jamais : toute erreur
// interne se solde par une sortie 0.
//
//   echo '{"tool_name":"Write","tool_input":{"file_path":"src/main/java/A.java"}}' | node tdd-garde.js
const path = require("path");
const c = require("./commun");

const MODE = (process.env.LELIB_TDD || "avertir").toLowerCase();
const VALIDITE_H = Number(process.env.LELIB_TDD_VALIDITE_H) > 0 ? Number(process.env.LELIB_TDD_VALIDITE_H) : c.VALIDITE_H_DEFAUT;

const PRODUCTION = [/\/src\/main\/java\/.+\.java$/, /\/src\/app\/.+\.ts$/];
const EXCLUS = [
  /\.(spec|test)\.[jt]sx?$/, /\.d\.ts$/, /\/environments?\//, /\/generated(-sources)?\//, /\/api\/generated\//,
  /\/main\.ts$/, /\/app\.config(\.server)?\.ts$/, /\/app\.routes(\.server)?\.ts$/, /package-info\.java$/, /Application\.java$/,
];
const extra = (process.env.LELIB_TDD_IGNORER || "").split(";").map((s) => s.trim()).filter(Boolean);

function estProduction(fichier) {
  const p = `/${fichier.replace(/\\/g, "/")}`.replace(/\/{2,}/g, "/");
  if (!PRODUCTION.some((re) => re.test(p))) return false;
  if (EXCLUS.some((re) => re.test(p))) return false;
  for (const motif of extra) { try { if (new RegExp(motif).test(p)) return false; } catch { /* motif invalide : ignoré */ } }
  return true;
}

// Renvoie null si la modification est autorisée, sinon le message à destination de l'agent.
function verifier(racine, maintenant = Date.now()) {
  const limite = maintenant - VALIDITE_H * 3600 * 1000;
  const entrees = c.lireJournal(racine).filter((e) => Date.parse(e.t) >= limite);
  const dernier = entrees.at(-1);
  const aide = `Écris d'abord un test qui échoue et lance-le avec \`node "${path.join(__dirname, "tdd-run.js")}" -- <commande de test>\`.`;
  if (!dernier) return `TDD : aucun lancement de tests enregistré récemment. ${aide}`;
  if (c.rougeValide(dernier)) return null;
  if (dernier.marqueur === "refactor") {
    const run = entrees.filter((e) => e.etat).at(-1);
    return run && run.etat === "vert" ? null : `TDD : phase refactor déclarée, mais les tests ne sont pas verts. Fais-les passer d'abord.`;
  }
  if (dernier.etat === "rouge") return "TDD : le dernier échec n'est pas un échec de test reconnu (commande en erreur ?). Corrige la commande de test pour obtenir un vrai rouge.";
  return `TDD : les tests sont verts, il n'y a pas de test rouge qui justifie cette modification de code de production. ${aide} Pour un refactor sans nouveau comportement : \`tdd-run.js --refactor\`.`;
}

function main() {
  if (MODE === "off") return 0;
  let entree;
  try { entree = JSON.parse(require("fs").readFileSync(0, "utf8")); } catch { return 0; }
  const outil = entree && entree.tool_name;
  const fichier = entree && entree.tool_input && (entree.tool_input.file_path || entree.tool_input.path);
  if (!["Write", "Edit", "MultiEdit"].includes(outil) || typeof fichier !== "string" || !estProduction(fichier)) return 0;

  const absolu = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd(), fichier);
  const message = verifier(c.racineProjet(path.dirname(absolu)));
  if (!message) return 0;

  const nom = path.basename(fichier);
  if (MODE === "bloquer") {
    console.error(`${message} (modification de ${nom} refusée ; LELIB_TDD=avertir pour ne plus bloquer)`);
    return 2;
  }
  console.log(JSON.stringify({
    systemMessage: `TDD : modification de ${nom} sans test rouge enregistré.`,
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: message },
  }));
  return 0;
}

if (require.main === module) {
  try { process.exit(main()); } catch { process.exit(0); }
}
module.exports = { estProduction, verifier };
