'use strict';

const VERSION_API = '2023-06-01';
const REPRISES = 3;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Masque la clé API dans tout texte destiné à l'affichage.
function masquer(texte, cle) {
  return cle ? String(texte).split(cle).join('***') : String(texte);
}

// Appelle POST /v1/messages (sans dépendance). Reprises sur 429, 5xx et erreurs réseau.
async function creerMessage({ cle, urlBase, corps }) {
  let derniere;
  for (let essai = 0; essai <= REPRISES; essai++) {
    try {
      const reponse = await fetch(`${urlBase}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': VERSION_API },
        body: JSON.stringify(corps),
      });
      const texte = await reponse.text();
      if (reponse.ok) return JSON.parse(texte);
      derniere = new Error(`API Claude : HTTP ${reponse.status} ${masquer(texte, cle).slice(0, 500)}`);
      if (reponse.status !== 429 && reponse.status < 500) throw Object.assign(derniere, { definitive: true });
      const apres = Number(reponse.headers.get('retry-after'));
      if (essai < REPRISES) await attendre(apres > 0 ? apres * 1000 : 500 * 2 ** essai);
    } catch (e) {
      if (e.definitive) throw e;
      derniere = new Error(masquer(e.cause ? `${e.message} (${e.cause.message || e.cause})` : e.message, cle));
      if (essai < REPRISES) await attendre(500 * 2 ** essai);
    }
  }
  throw derniere;
}

module.exports = { creerMessage, masquer };
