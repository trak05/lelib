'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { exec } = require('node:child_process');

const MAX_SORTIE = 20000;
const MAX_RESULTATS = 100;
const DELAI_COMMANDE_MS = 120000;
const DOSSIERS_IGNORES = new Set(['node_modules', '.git', 'target', 'dist', '.angular']);

// Définitions envoyées au modèle (schémas JSON).
const DEFINITIONS = {
  read_file: {
    description: 'Lit un fichier texte du projet. Renvoie les lignes numérotées.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif au dossier du projet' },
        start: { type: 'integer', description: 'Première ligne (1 par défaut)' },
        end: { type: 'integer', description: 'Dernière ligne (fin du fichier par défaut)' },
      },
      required: ['path'],
    },
  },
  list_files: {
    description: 'Liste les fichiers du projet qui correspondent à un motif glob (par exemple src/**/*.java). node_modules et .git sont ignorés.',
    input_schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  },
  search: {
    description: 'Cherche une expression régulière dans les fichiers texte du projet. Renvoie fichier:ligne:texte.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Expression régulière' },
        path: { type: 'string', description: 'Dossier ou fichier de départ (racine du projet par défaut)' },
      },
      required: ['pattern'],
    },
  },
  write_file: {
    description: 'Crée un fichier ou remplace son contenu. Les dossiers manquants sont créés.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  edit_file: {
    description: "Remplace une occurrence unique d'un texte par un autre dans un fichier existant.",
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } },
      required: ['path', 'old', 'new'],
    },
  },
  run_command: {
    description: `Exécute une commande shell dans le dossier du projet (délai ${DELAI_COMMANDE_MS / 1000} s). Renvoie le code de sortie et la sortie.`,
    input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
  load_skill: {
    description: "Charge les instructions d'un skill de la liste. À faire avant d'appliquer ce skill.",
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, arguments: { type: 'string', description: 'Texte qui remplace $ARGUMENTS' } },
      required: ['name'],
    },
  },
  delegate: {
    description: "Confie une tâche à un agent spécialisé de la liste. Il travaille seul et renvoie son compte rendu : donne-lui toute l'information utile.",
    input_schema: { type: 'object', properties: { agent: { type: 'string' }, task: { type: 'string' } }, required: ['agent', 'task'] },
  },
};

const OUTILS_ECRITURE = new Set(['write_file', 'edit_file', 'run_command']);

function tronquer(texte) {
  return texte.length > MAX_SORTIE ? `${texte.slice(0, MAX_SORTIE)}\n[… sortie tronquée, ${texte.length - MAX_SORTIE} caractères en plus]` : texte;
}

// Résout un chemin et refuse tout ce qui sort du dossier du projet.
function confiner(cwd, chemin) {
  const absolu = path.resolve(cwd, String(chemin || '.'));
  const rel = path.relative(cwd, absolu);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`chemin hors du projet refusé : ${chemin}`);
  return absolu;
}

function* parcourir(dossier) {
  let entrees;
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    if (DOSSIERS_IGNORES.has(e.name)) continue;
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) yield* parcourir(p);
    else if (e.isFile()) yield p;
  }
}

function globVersRegex(motif) {
  let r = '';
  const m = motif.replace(/\\/g, '/');
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '*' && m[i + 1] === '*') {
      i++;
      if (m[i + 1] === '/') i++;
      r += '(?:.*/)?';
    } else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
}

const relatif = (cwd, p) => path.relative(cwd, p).split(path.sep).join('/');

const EXECUTEURS = {
  read_file({ cwd }, { path: chemin, start, end }) {
    const lignes = fs.readFileSync(confiner(cwd, chemin), 'utf8').split('\n');
    const debut = Math.max(1, start || 1);
    const fin = Math.min(lignes.length, end || lignes.length);
    return tronquer(lignes.slice(debut - 1, fin).map((l, i) => `${debut + i}\t${l}`).join('\n'));
  },

  list_files({ cwd }, { pattern }) {
    const re = globVersRegex(String(pattern));
    const trouves = [];
    for (const f of parcourir(cwd)) {
      const rel = relatif(cwd, f);
      if (re.test(rel)) trouves.push(rel);
      if (trouves.length >= MAX_RESULTATS) break;
    }
    return trouves.length ? trouves.join('\n') : 'Aucun fichier.';
  },

  search({ cwd }, { pattern, path: depart }) {
    const re = new RegExp(pattern);
    const base = confiner(cwd, depart);
    const fichiers = fs.statSync(base).isDirectory() ? parcourir(base) : [base];
    const sortie = [];
    for (const f of fichiers) {
      if (fs.statSync(f).size > 1024 * 1024) continue;
      const texte = fs.readFileSync(f, 'utf8');
      if (texte.includes('\0')) continue;
      const lignes = texte.split('\n');
      for (let i = 0; i < lignes.length; i++) {
        if (re.test(lignes[i])) sortie.push(`${relatif(cwd, f)}:${i + 1}:${lignes[i].trim().slice(0, 200)}`);
        if (sortie.length >= MAX_RESULTATS) return `${sortie.join('\n')}\n[limite de ${MAX_RESULTATS} résultats atteinte]`;
      }
    }
    return sortie.length ? sortie.join('\n') : 'Aucun résultat.';
  },

  write_file({ cwd }, { path: chemin, content }) {
    const absolu = confiner(cwd, chemin);
    fs.mkdirSync(path.dirname(absolu), { recursive: true });
    fs.writeFileSync(absolu, String(content));
    return `Fichier écrit : ${relatif(cwd, absolu)} (${String(content).length} caractères).`;
  },

  edit_file({ cwd }, { path: chemin, old, new: nouveau }) {
    const absolu = confiner(cwd, chemin);
    const texte = fs.readFileSync(absolu, 'utf8');
    const occurrences = old === '' ? 0 : texte.split(old).length - 1;
    if (occurrences !== 1) throw new Error(`le texte à remplacer doit apparaître exactement une fois (trouvé ${occurrences} fois)`);
    fs.writeFileSync(absolu, texte.replace(old, () => nouveau));
    return `Fichier modifié : ${relatif(cwd, absolu)}.`;
  },

  run_command({ cwd }, { command }) {
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: DELAI_COMMANDE_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (erreur, stdout, stderr) => {
        const code = erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0;
        const delai = erreur && erreur.killed ? ' (délai dépassé, commande interrompue)' : '';
        resolve(tronquer(`code de sortie : ${code}${delai}\n${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`));
      });
    });
  },
};

function description(nom, entree) {
  if (nom === 'run_command') return `commande : ${entree.command}`;
  return `${nom} ${entree.path || ''}`.trim();
}

// Demande une confirmation sur le terminal. Sans terminal interactif : refus.
function confirmer(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(`${question} [o/N] `, (reponse) => {
      rl.close();
      resolve(/^(o|oui|y|yes)$/i.test(reponse.trim()));
    });
  });
}

// Exécute un outil de fichiers ou de commande. Renvoie toujours { texte, erreur }.
async function executer(contexte, nom, entree) {
  const executeur = EXECUTEURS[nom];
  if (!executeur) return { texte: `Outil inconnu : ${nom}`, erreur: true };
  try {
    if (OUTILS_ECRITURE.has(nom) && !contexte.yes) {
      const ok = await confirmer(`Autoriser ${description(nom, entree)} ?`);
      if (!ok) return { texte: "Refusé : cette action demande une confirmation. Relance avec --yes pour l'autoriser sans terminal interactif.", erreur: true };
    }
    return { texte: String(await executeur(contexte, entree)), erreur: false };
  } catch (e) {
    return { texte: `Erreur : ${e.message}`, erreur: true };
  }
}

module.exports = { DEFINITIONS, executer, description, confiner, globVersRegex };
