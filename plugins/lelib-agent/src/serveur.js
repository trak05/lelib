'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { decouvrir } = require('./harness');
const { executerAgent } = require('./agent');
const { masquer } = require('./llm');
const conversations = require('./conversations');

const TAILLE_CORPS_MAX = 1024 * 1024;
const MESSAGE_MAX = 20000;
const DELAI_CONFIRMATION_MS = 5 * 60 * 1000;

function envoyerJson(res, statut, donnees) {
  res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(donnees));
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (m) => {
      taille += m.length;
      if (taille > TAILLE_CORPS_MAX) {
        reject(Object.assign(new Error('corps de requête trop gros'), { statut: 413 }));
        req.destroy();
      } else morceaux.push(m);
    });
    req.on('end', () => {
      try {
        resolve(morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('JSON invalide'), { statut: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const memeJeton = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Démarre le serveur de chat (127.0.0.1 uniquement). Renvoie { url, port, jeton, fermer }.
function demarrer({ projets, port = 3000, racinePlugin, cle, urlBase, modele, maxTours }) {
  const jeton = crypto.randomBytes(16).toString('hex');
  const racines = projets.map((p) => path.resolve(p));
  const harnesses = new Map();
  const actifs = new Set();
  const confirmations = new Map();
  const toujours = new Set();
  let hotes = new Set();

  const harnessDe = (projet) => {
    if (!harnesses.has(projet)) harnesses.set(projet, decouvrir({ racinePlugin, cwd: projet }));
    return harnesses.get(projet);
  };

  async function chat(req, res) {
    const corps = await lireCorps(req);
    const message = typeof corps.message === 'string' ? corps.message.trim() : '';
    if (!message || message.length > MESSAGE_MAX) return envoyerJson(res, 400, { erreur: `message vide ou de plus de ${MESSAGE_MAX} caractères` });

    let conv;
    if (corps.conversation) {
      if (!conversations.ID_VALIDE.test(String(corps.conversation))) return envoyerJson(res, 400, { erreur: 'identifiant de conversation invalide' });
      conv = conversations.charger(corps.conversation);
      if (!conv) return envoyerJson(res, 404, { erreur: 'conversation introuvable' });
    } else {
      const projet = path.resolve(String(corps.projet || racines[0]));
      if (!racines.includes(projet)) return envoyerJson(res, 400, { erreur: 'projet non autorisé' });
      conv = conversations.creer({ projet, agent: corps.agent, titre: message });
    }
    if (!racines.includes(conv.projet)) return envoyerJson(res, 400, { erreur: 'projet de la conversation non autorisé' });
    const harness = harnessDe(conv.projet);
    const definition = conv.agent ? harness.agents.get(conv.agent) : null;
    if (conv.agent && !definition) return envoyerJson(res, 400, { erreur: `agent inconnu : ${conv.agent}` });
    if (actifs.has(conv.id)) return envoyerJson(res, 409, { erreur: 'un message est déjà en cours dans cette conversation' });
    if (conversations.tropLongue(conv.messages)) return envoyerJson(res, 400, { erreur: 'conversation trop longue : ouvre une nouvelle conversation' });
    if (!corps.conversation) conversations.enregistrer(conv);

    actifs.add(conv.id);
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const envoyer = (type, donnees) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${type}\ndata: ${JSON.stringify(donnees)}\n\n`);
    };
    const controleur = new AbortController();
    let termine = false;
    res.on('close', () => {
      if (termine) return;
      controleur.abort();
      for (const c of confirmations.values()) if (c.conv === conv.id) c.fin(false);
    });

    envoyer('conversation', { id: conv.id, titre: conv.titre, projet: conv.projet, agent: conv.agent });
    const options = {
      cwd: conv.projet,
      cle,
      urlBase,
      modele,
      maxTours,
      mode: 'chat',
      yes: false,
      signal: controleur.signal,
      journal: () => {},
      surTexte: (delta) => envoyer('texte', { delta }),
      surEvenement: ({ type, ...reste }) => envoyer(type, reste),
      confirmer: (question) => {
        if (toujours.has(conv.id)) return Promise.resolve(true);
        return new Promise((resolve) => {
          const id = crypto.randomUUID();
          const fin = (ok) => {
            clearTimeout(minuteur);
            confirmations.delete(id);
            resolve(ok);
          };
          const minuteur = setTimeout(() => fin(false), DELAI_CONFIRMATION_MS);
          confirmations.set(id, { conv: conv.id, fin });
          envoyer('confirmation', { id, description: question });
        });
      },
    };

    try {
      // Le tour travaille sur une copie : s'il échoue ou est interrompu, l'historique enregistré reste intact.
      const r = await executerAgent({ tache: message, historique: structuredClone(conv.messages), definition, harness, options });
      conv.messages = r.messages;
      conversations.enregistrer(conv);
      envoyer('fin', { arret: r.arret, tours: r.tours, usage: r.usage });
    } catch (e) {
      if (e.message !== 'interrompu') envoyer('erreur', { message: masquer(e.message, cle) });
    } finally {
      termine = true;
      actifs.delete(conv.id);
      if (!res.writableEnded) res.end();
    }
  }

  async function traiter(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!hotes.has(req.headers.host)) return envoyerJson(res, 403, { erreur: 'hôte refusé' });
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(path.join(racinePlugin, 'web', 'index.html')));
    }
    if (!url.pathname.startsWith('/api/')) return envoyerJson(res, 404, { erreur: 'introuvable' });
    if (!memeJeton(req.headers['x-token'], jeton)) return envoyerJson(res, 401, { erreur: 'jeton manquant ou invalide' });
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return envoyerJson(res, 403, { erreur: 'origine refusée' });

    const morceaux = url.pathname.split('/').filter(Boolean); // ['api', ...]
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return envoyerJson(res, 200, { modele, projets: racines.map((chemin) => ({ chemin, nom: path.basename(chemin) || chemin })) });
    }
    if (req.method === 'GET' && url.pathname === '/api/agents') {
      const projet = path.resolve(url.searchParams.get('projet') || racines[0]);
      if (!racines.includes(projet)) return envoyerJson(res, 400, { erreur: 'projet non autorisé' });
      return envoyerJson(res, 200, [...harnessDe(projet).agents.values()].map((a) => ({ nom: a.nom, description: a.description, plugin: a.plugin })));
    }
    if (req.method === 'GET' && url.pathname === '/api/conversations') return envoyerJson(res, 200, conversations.lister());
    if (morceaux[1] === 'conversations' && morceaux.length === 3) {
      if (!conversations.ID_VALIDE.test(morceaux[2])) return envoyerJson(res, 400, { erreur: 'identifiant invalide' });
      if (req.method === 'GET') {
        const conv = conversations.charger(morceaux[2]);
        return conv ? envoyerJson(res, 200, conv) : envoyerJson(res, 404, { erreur: 'conversation introuvable' });
      }
      if (req.method === 'DELETE') {
        if (actifs.has(morceaux[2])) return envoyerJson(res, 409, { erreur: 'conversation en cours' });
        toujours.delete(morceaux[2]);
        return conversations.supprimer(morceaux[2]) ? envoyerJson(res, 200, { ok: true }) : envoyerJson(res, 404, { erreur: 'conversation introuvable' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') return chat(req, res);
    if (req.method === 'POST' && url.pathname === '/api/confirmation') {
      const corps = await lireCorps(req);
      const c = confirmations.get(corps.id);
      if (!c) return envoyerJson(res, 404, { erreur: 'confirmation inconnue ou expirée' });
      if (corps.ok && corps.toujours) toujours.add(c.conv);
      c.fin(corps.ok === true);
      return envoyerJson(res, 200, { ok: true });
    }
    return envoyerJson(res, 404, { erreur: 'introuvable' });
  }

  const serveur = http.createServer((req, res) => {
    traiter(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      envoyerJson(res, e.statut || 500, { erreur: masquer(e.message, cle) });
    });
  });

  return new Promise((resolve, reject) => {
    serveur.once('error', (e) => reject(e.code === 'EADDRINUSE' ? new Error(`le port ${port} est déjà utilisé (essaie --port <autre>)`) : e));
    serveur.listen(port, '127.0.0.1', () => {
      const p = serveur.address().port;
      hotes = new Set([`localhost:${p}`, `127.0.0.1:${p}`]);
      resolve({
        url: `http://localhost:${p}/?t=${jeton}`,
        port: p,
        jeton,
        fermer: () => {
          for (const c of confirmations.values()) c.fin(false);
          serveur.closeAllConnections();
          return new Promise((r) => serveur.close(r));
        },
      });
    });
  });
}

module.exports = { demarrer };
