'use strict';

const VERSION_API = '2023-06-01';
const REPRISES = 3;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Masque la clé API dans tout texte destiné à l'affichage.
function masquer(texte, cle) {
  return cle ? String(texte).split(cle).join('***') : String(texte);
}

// Lit un flux SSE de l'API Messages et reconstruit le message complet.
// `surTexte(morceau)` est appelé à chaque morceau de texte reçu.
async function lireFlux(reponse, surTexte) {
  const decodeur = new TextDecoder();
  const blocs = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let arret = null;
  let tampon = '';

  const traiter = (brut) => {
    const ligne = brut.split('\n').find((l) => l.startsWith('data:'));
    if (!ligne) return;
    const d = JSON.parse(ligne.slice(5).trim());
    if (d.type === 'message_start') {
      usage.input_tokens = (d.message.usage && d.message.usage.input_tokens) || 0;
    } else if (d.type === 'content_block_start') {
      blocs[d.index] = { ...d.content_block, ...(d.content_block.type === 'tool_use' ? { json: '' } : { text: d.content_block.text || '' }) };
    } else if (d.type === 'content_block_delta') {
      const bloc = blocs[d.index];
      if (d.delta.type === 'text_delta') {
        bloc.text += d.delta.text;
        if (surTexte) surTexte(d.delta.text);
      } else if (d.delta.type === 'input_json_delta') bloc.json += d.delta.partial_json;
    } else if (d.type === 'content_block_stop') {
      const bloc = blocs[d.index];
      if (bloc && bloc.type === 'tool_use') {
        bloc.input = bloc.json ? JSON.parse(bloc.json) : {};
        delete bloc.json;
      }
    } else if (d.type === 'message_delta') {
      arret = d.delta.stop_reason || arret;
      usage.output_tokens = (d.usage && d.usage.output_tokens) || usage.output_tokens;
    } else if (d.type === 'error') {
      throw new Error(`API Claude : ${(d.error && d.error.message) || 'erreur dans le flux'}`);
    }
  };

  for await (const morceau of reponse.body) {
    tampon += decodeur.decode(morceau, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = tampon.indexOf('\n\n')) >= 0) {
      const brut = tampon.slice(0, i);
      tampon = tampon.slice(i + 2);
      traiter(brut);
    }
  }
  if (tampon.trim()) traiter(tampon);
  return { content: blocs.filter(Boolean), stop_reason: arret, usage };
}

// Appelle POST /v1/messages (sans dépendance). Reprises sur 429, 5xx et erreurs réseau
// tant qu'aucune réponse n'a commencé. Avec `surTexte`, la réponse est lue en streaming.
async function creerMessage({ cle, urlBase, corps, surTexte, signal }) {
  const flux = typeof surTexte === 'function';
  let derniere;
  for (let essai = 0; essai <= REPRISES; essai++) {
    if (signal && signal.aborted) throw new Error('interrompu');
    try {
      const reponse = await fetch(`${urlBase}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': VERSION_API },
        body: JSON.stringify(flux ? { ...corps, stream: true } : corps),
        signal,
      });
      if (reponse.ok) {
        // Une fois la réponse commencée, pas de reprise : du texte a pu être diffusé.
        try {
          return flux ? await lireFlux(reponse, surTexte) : JSON.parse(await reponse.text());
        } catch (e) {
          throw Object.assign(e, { definitive: true });
        }
      }
      const texte = await reponse.text();
      derniere = new Error(`API Claude : HTTP ${reponse.status} ${masquer(texte, cle).slice(0, 500)}`);
      if (reponse.status !== 429 && reponse.status < 500) throw Object.assign(derniere, { definitive: true });
      const apres = Number(reponse.headers.get('retry-after'));
      if (essai < REPRISES) await attendre(apres > 0 ? apres * 1000 : 500 * 2 ** essai);
    } catch (e) {
      if (e.definitive) throw e;
      if (signal && signal.aborted) throw new Error('interrompu');
      derniere = new Error(masquer(e.cause ? `${e.message} (${e.cause.message || e.cause})` : e.message, cle));
      if (essai < REPRISES) await attendre(500 * 2 ** essai);
    }
  }
  throw derniere;
}

module.exports = { creerMessage, masquer };
