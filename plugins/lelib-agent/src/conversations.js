'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ID_VALIDE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TAILLE_MAX = 600000;

function dossier() {
  return path.join(process.env.LELIB_AGENT_DATA || path.join(os.homedir(), '.lelib-agent'), 'conversations');
}

function fichier(id) {
  if (!ID_VALIDE.test(String(id))) throw new Error('identifiant de conversation invalide');
  return path.join(dossier(), `${id}.json`);
}

function creer({ projet, agent, titre }) {
  const maintenant = new Date().toISOString();
  return { id: crypto.randomUUID(), titre: String(titre).replace(/\s+/g, ' ').trim().slice(0, 60) || 'Conversation', projet, agent: agent || null, cree: maintenant, maj: maintenant, messages: [] };
}

function charger(id) {
  try {
    return JSON.parse(fs.readFileSync(fichier(id), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function enregistrer(conversation) {
  fs.mkdirSync(dossier(), { recursive: true });
  conversation.maj = new Date().toISOString();
  fs.writeFileSync(fichier(conversation.id), JSON.stringify(conversation));
}

function lister() {
  let noms;
  try {
    noms = fs.readdirSync(dossier()).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const liste = [];
  for (const nom of noms) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dossier(), nom), 'utf8'));
      liste.push({ id: c.id, titre: c.titre, projet: c.projet, agent: c.agent, maj: c.maj });
    } catch {
      // fichier illisible : ignoré
    }
  }
  return liste.sort((a, b) => b.maj.localeCompare(a.maj));
}

function supprimer(id) {
  try {
    fs.unlinkSync(fichier(id));
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

const tropLongue = (messages) => JSON.stringify(messages).length > TAILLE_MAX;

module.exports = { creer, charger, enregistrer, lister, supprimer, tropLongue, ID_VALIDE };
