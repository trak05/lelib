'use strict';

const { DEFINITIONS, executer, description } = require('./tools');
const { creerMessage, masquer } = require('./llm');

const PROFONDEUR_MAX = 2;
const MAX_TOKENS_REPONSE = 8192;
const TOUS_LES_OUTILS = ['read_file', 'list_files', 'search', 'write_file', 'edit_file', 'run_command'];
const APERCU_RESULTAT = 300;

function promptSysteme({ definition, harness, cwd, profondeur, mode }) {
  const lignes = [
    mode === 'chat'
      ? "Tu es un assistant de conversation pour développeur. Réponds directement et clairement aux questions, en français, en Markdown. Utilise les outils seulement quand ils servent la demande (lire, chercher, modifier un fichier du projet, lancer une commande), jamais pour une simple question de culture générale."
      : "Tu es un agent de développement. Tu travailles dans le dossier du projet avec les outils fournis, et tu réponds en français.",
    `Dossier du projet : ${cwd}`,
    `Date : ${new Date().toISOString().slice(0, 10)}`,
    mode === 'chat'
      ? "Vérifie avant d'affirmer. Ne dis jamais qu'une chose est faite ou testée sans l'avoir réellement exécutée."
      : "Utilise les outils pour lire et vérifier avant d'affirmer. Ne dis jamais qu'une chose est faite ou testée sans l'avoir réellement exécutée. Termine par un bilan court : ce qui a été fait, ce qui a été vérifié, ce qui reste.",
  ];
  if (definition) lignes.push('', `## Ton rôle : ${definition.nom}`, definition.prompt);
  if (harness.skills.size) {
    lignes.push('', '## Skills disponibles (charge-en un avec load_skill avant de l\'appliquer)');
    for (const s of harness.skills.values()) lignes.push(`- ${s.nom} : ${s.description}`);
  }
  if (profondeur < PROFONDEUR_MAX && harness.agents.size) {
    lignes.push('', '## Agents spécialisés (confie-leur une tâche avec delegate)');
    for (const a of harness.agents.values()) if (!definition || a.nom !== definition.nom) lignes.push(`- ${a.nom} : ${a.description}`);
  }
  return lignes.join('\n');
}

function outilsDisponibles(definition, harness, profondeur) {
  const noms = definition && definition.outils ? definition.outils : TOUS_LES_OUTILS;
  const liste = [...noms];
  if (harness.skills.size) liste.push('load_skill');
  if (profondeur < PROFONDEUR_MAX && harness.agents.size) liste.push('delegate');
  return liste;
}

function remplacerArguments(corps, args) {
  return corps.includes('$ARGUMENTS') ? corps.split('$ARGUMENTS').join(args) : `${corps}\n\nEntrée : ${args}`;
}

// Boucle d'agent : modèle + harness. Renvoie { texte, arret, tours, usage, messages }.
// `historique` (optionnel) : messages d'une conversation précédente, que la boucle prolonge.
// Options facultatives : confirmer(description), surTexte(morceau), surEvenement(evt), signal.
async function executerAgent({ tache, historique, definition, harness, options, profondeur = 0, usage }) {
  const { cwd, cle, urlBase, modele, maxTours, journal, mode, signal } = options;
  const outils = outilsDisponibles(definition, harness, profondeur);
  const system = promptSysteme({ definition, harness, cwd, profondeur, mode });
  const schemas = outils.map((nom) => ({ name: nom, ...DEFINITIONS[nom] }));
  const messages = historique || [];
  messages.push({ role: 'user', content: tache });
  const total = usage || { entree: 0, sortie: 0, appels: 0 };
  const prefixe = definition ? `[${definition.nom}] ` : '';
  const emettre = (evt) => options.surEvenement && options.surEvenement({ agent: definition ? definition.nom : null, ...evt });
  // Le texte n'est diffusé en direct que pour l'agent principal.
  const surTexte = profondeur === 0 ? options.surTexte : undefined;

  for (let tour = 1; tour <= maxTours; tour++) {
    if (signal && signal.aborted) throw new Error('interrompu');
    const reponse = await creerMessage({
      cle,
      urlBase,
      signal,
      surTexte,
      corps: {
        model: modele,
        max_tokens: MAX_TOKENS_REPONSE,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: schemas,
        messages,
      },
    });
    total.appels++;
    total.entree += (reponse.usage && reponse.usage.input_tokens) || 0;
    total.sortie += (reponse.usage && reponse.usage.output_tokens) || 0;
    messages.push({ role: 'assistant', content: reponse.content });

    const texte = reponse.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (reponse.stop_reason !== 'tool_use') {
      const arret = reponse.stop_reason === 'max_tokens' ? 'max_tokens' : reponse.stop_reason === 'refusal' ? 'refus' : 'fin';
      return { texte, arret, tours: tour, usage: total, messages };
    }

    const resultats = [];
    for (const bloc of reponse.content.filter((b) => b.type === 'tool_use')) {
      const entree = bloc.input || {};
      journal(`${prefixe}→ ${description(bloc.name, entree)}`);
      emettre({ type: 'outil', id: bloc.id, nom: bloc.name, description: description(bloc.name, entree) });
      let sortie;
      if (!outils.includes(bloc.name)) sortie = { texte: `Outil non autorisé pour ce rôle : ${bloc.name}`, erreur: true };
      else if (bloc.name === 'load_skill') sortie = chargerSkill(harness, entree, tache);
      else if (bloc.name === 'delegate') sortie = await deleguer({ harness, options, profondeur, usage: total, entree });
      else sortie = await executer(options, bloc.name, entree);
      const contenu = masquer(sortie.texte, cle);
      emettre({ type: 'resultat', id: bloc.id, erreur: sortie.erreur, apercu: contenu.slice(0, APERCU_RESULTAT) });
      resultats.push({ type: 'tool_result', tool_use_id: bloc.id, content: contenu, is_error: sortie.erreur });
    }
    messages.push({ role: 'user', content: resultats });
  }
  return { texte: '', arret: 'limite', tours: maxTours, usage: total, messages };
}

function chargerSkill(harness, entree, tache) {
  const skill = harness.skills.get(entree.name);
  if (!skill) return { texte: `Skill inconnu : ${entree.name}. Disponibles : ${[...harness.skills.keys()].join(', ')}`, erreur: true };
  return { texte: remplacerArguments(skill.corps, entree.arguments || tache), erreur: false };
}

async function deleguer({ harness, options, profondeur, usage, entree }) {
  const agent = harness.agents.get(entree.agent);
  if (!agent) return { texte: `Agent inconnu : ${entree.agent}. Disponibles : ${[...harness.agents.keys()].join(', ')}`, erreur: true };
  try {
    const r = await executerAgent({ tache: entree.task, definition: agent, harness, options, profondeur: profondeur + 1, usage });
    if (r.arret !== 'fin') return { texte: `L'agent ${agent.nom} s'est arrêté (${r.arret}). ${r.texte}`.trim(), erreur: true };
    return { texte: r.texte || "(l'agent n'a rendu aucun compte rendu)", erreur: false };
  } catch (e) {
    if (e.message === 'interrompu') throw e;
    return { texte: `Échec de l'agent ${agent.nom} : ${e.message}`, erreur: true };
  }
}

module.exports = { executerAgent, promptSysteme, outilsDisponibles, TOUS_LES_OUTILS };
