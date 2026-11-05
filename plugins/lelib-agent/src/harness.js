'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lire } = require('./frontmatter');

// Correspondance entre les outils déclarés dans `tools:` des agents (noms Claude Code)
// et les outils de ce CLI.
const OUTILS_PAR_NOM = {
  Read: 'read_file',
  Grep: 'search',
  Glob: 'list_files',
  Write: 'write_file',
  Edit: 'edit_file',
  Bash: 'run_command',
};

function sousDossiers(dossier) {
  try {
    return fs.readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dossier, e.name));
  } catch {
    return [];
  }
}

// Racines de plugins : dossiers voisins du plugin (marketplace), cache de Claude Code,
// dossiers listés dans LELIB_HARNESS_DIRS, puis dossier .claude du projet.
function racines(racinePlugin, cwd) {
  const liste = [];
  const voisins = sousDossiers(path.resolve(racinePlugin, '..'));
  liste.push(...voisins);
  const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache');
  for (const marketplace of sousDossiers(cache)) {
    for (const plugin of sousDossiers(marketplace)) {
      // cache/<marketplace>/<plugin>/<version>/ : on prend la version la plus récente par ordre alphabétique.
      const versions = sousDossiers(plugin).sort();
      if (versions.length) liste.push(versions[versions.length - 1]);
    }
  }
  for (const d of (process.env.LELIB_HARNESS_DIRS || '').split(path.delimiter).filter(Boolean)) liste.push(path.resolve(d));
  liste.push(path.join(cwd, '.claude'));
  return liste;
}

function fichiersMd(dossier) {
  try {
    return fs.readdirSync(dossier).filter((f) => f.endsWith('.md')).map((f) => path.join(dossier, f));
  } catch {
    return [];
  }
}

function decouvrir({ racinePlugin, cwd }) {
  const agents = new Map();
  const skills = new Map();
  for (const racine of racines(racinePlugin, cwd)) {
    const nomPlugin = path.basename(racine) === '.claude' ? 'projet' : lirePlugin(racine);
    for (const f of fichiersMd(path.join(racine, 'agents'))) {
      const { meta, body } = lire(fs.readFileSync(f, 'utf8'));
      const nom = meta.name || path.basename(f, '.md');
      if (agents.has(nom)) continue;
      const declares = (meta.tools || '').split(',').map((t) => t.trim()).filter(Boolean);
      agents.set(nom, {
        nom,
        plugin: nomPlugin,
        description: meta.description || '',
        prompt: body,
        // `null` = pas de restriction déclarée : tous les outils.
        outils: declares.length ? declares.filter((t) => OUTILS_PAR_NOM[t]).map((t) => OUTILS_PAR_NOM[t]) : null,
        ignores: declares.filter((t) => !OUTILS_PAR_NOM[t]),
        fichier: f,
      });
    }
    for (const dossier of sousDossiers(path.join(racine, 'skills'))) {
      const f = path.join(dossier, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      const { meta, body } = lire(fs.readFileSync(f, 'utf8'));
      const nom = meta.name || path.basename(dossier);
      if (skills.has(nom)) continue;
      skills.set(nom, { nom, plugin: nomPlugin, description: meta.description || '', corps: body, fichier: f });
    }
  }
  return { agents, skills };
}

function lirePlugin(racine) {
  try {
    return JSON.parse(fs.readFileSync(path.join(racine, '.claude-plugin', 'plugin.json'), 'utf8')).name || path.basename(racine);
  } catch {
    return path.basename(racine);
  }
}

module.exports = { decouvrir, OUTILS_PAR_NOM };
