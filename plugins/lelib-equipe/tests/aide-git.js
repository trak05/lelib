// Outils des tests de branche-dev.js : vrais dépôts git temporaires (un distant nu et des clones).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "branche-dev.js");
const IDENTITE = { GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITE, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0 && !args.includes("--allow-fail")) throw new Error(`git ${args.join(" ")} a échoué dans ${cwd} : ${r.stderr}`);
  return (r.stdout || "").trim();
}

const nettoyer = (dir) => fs.rmSync(dir, { recursive: true, force: true });
function ecrire(dir, relatif, contenu) {
  const f = path.join(dir, relatif);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenu);
  return f;
}

// Dépôt distant nu + clone avec une branche develop déjà poussée. Renvoie { racine, distant, clone }.
function depotAvecDistant(racine, nom = "depot") {
  const distant = path.join(racine, `${nom}-distant.git`);
  const clone = path.join(racine, nom);
  fs.mkdirSync(distant, { recursive: true });
  git(distant, "init", "--bare", "-b", "develop");
  fs.mkdirSync(clone, { recursive: true });
  git(clone, "init", "-b", "develop");
  git(clone, "config", "user.name", "Test");
  git(clone, "config", "user.email", "test@example.com");
  git(clone, "remote", "add", "origin", distant);
  ecrire(clone, "README.md", "# projet\n");
  git(clone, "add", "-A");
  git(clone, "commit", "-m", "initial");
  git(clone, "push", "-u", "origin", "develop");
  return { distant, clone };
}

// Un autre développeur pousse un commit sur develop : le clone principal est alors en retard.
function pousserSurDevelop(distant, racine, fichier = "autre.txt") {
  const tmp = path.join(racine, `autre-dev-${Math.random().toString(36).slice(2, 8)}`);
  git(racine, "clone", distant, tmp);
  git(tmp, "config", "user.name", "Autre");
  git(tmp, "config", "user.email", "autre@example.com");
  ecrire(tmp, fichier, "du travail d'un collègue\n");
  git(tmp, "add", "-A");
  git(tmp, "commit", "-m", "commit d'un collègue");
  git(tmp, "push", "origin", "develop");
}

function racineTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lelib-branche-"));
}

function lancer(cwd, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITE, GIT_TERMINAL_PROMPT: "0" } });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}
function json(cwd, args) {
  const r = lancer(cwd, [...args, "--json"]);
  let donnees = null;
  try { donnees = JSON.parse(r.out); } catch { /* sortie non JSON */ }
  return { code: r.code, json: donnees, out: r.out, err: r.err };
}

function ticket({ id = "bet-007", type = "fonctionnalité", titre = "Export CSV des compteurs" } = {}) {
  return `---\nid: ${id}\ntitre: ${titre}\nstatut: estimé\ntype: ${type}\n---\n\n# ${id} — ${titre}\n\n## Critères d'acceptation\n- [ ] CA-1 : x\n`;
}

module.exports = { git, nettoyer, ecrire, depotAvecDistant, pousserSurDevelop, racineTemp, lancer, json, ticket };
