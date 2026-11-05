#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { decouvrir } = require('../src/harness');
const { executerAgent, promptSysteme, outilsDisponibles } = require('../src/agent');
const { masquer } = require('../src/llm');
const { demarrer } = require('../src/serveur');

const MODELE_PAR_DEFAUT = 'claude-sonnet-5-5';
const URL_PAR_DEFAUT = 'https://api.anthropic.com';
const TOURS_PAR_DEFAUT = 30;

const AIDE = `lelib-agent : agent IA = modèle Claude + harness (agents et skills des plugins lelib).

Usage : lelib-agent [options] "<tâche>"
        lelib-agent --chat [--port 3000] [--projet <dossier>]...

Options :
  --agent <nom>       joue le rôle d'un agent du harness (po, dev-back, qa…) ; sans option : généraliste
  --model <nom>       modèle Claude (défaut ${MODELE_PAR_DEFAUT}, ou LELIB_AGENT_MODEL)
  --max-tours <n>     nombre maximal d'allers-retours avec le modèle (défaut ${TOURS_PAR_DEFAUT})
  --yes               autorise sans confirmation les écritures de fichiers et les commandes shell
  --chat              lance le chat web local (http://localhost:<port>/?t=<jeton>, 127.0.0.1 uniquement)
  --port <n>          port du chat (défaut 3000)
  --projet <dossier>  projet accessible depuis le chat (répétable ; sinon LELIB_PROJETS, sinon le dossier courant)
  --liste             affiche les agents et skills trouvés, puis s'arrête
  --dry-run           affiche le prompt système et les outils sans appeler l'API
  --help              cette aide

Environnement : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_BASE_URL, LELIB_AGENT_MODEL,
LELIB_HARNESS_DIRS (dossiers de plugins supplémentaires), LELIB_PROJETS, LELIB_AGENT_DATA
(conversations du chat, défaut ~/.lelib-agent), HTTPS_PROXY.
Code de sortie : 0 terminé, 1 erreur, 2 limite de tours atteinte ou réponse interrompue.
Sans terminal interactif (CI), les écritures et commandes sont refusées sans --yes.`;

function lireOptions(argv) {
  const o = { agent: null, modele: process.env.LELIB_AGENT_MODEL || MODELE_PAR_DEFAUT, maxTours: TOURS_PAR_DEFAUT, yes: false, liste: false, dryRun: false, aide: false, chat: false, port: 3000, projets: [], tache: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valeur = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} attend une valeur`);
      return argv[++i];
    };
    if (a === '--agent') o.agent = valeur();
    else if (a === '--model') o.modele = valeur();
    else if (a === '--max-tours') {
      o.maxTours = Number(valeur());
      if (!Number.isInteger(o.maxTours) || o.maxTours < 1) throw new Error('--max-tours attend un entier positif');
    } else if (a === '--yes') o.yes = true;
    else if (a === '--chat') o.chat = true;
    else if (a === '--projet') o.projets.push(valeur());
    else if (a === '--port') {
      o.port = Number(valeur());
      if (!Number.isInteger(o.port) || o.port < 0 || o.port > 65535) throw new Error('--port attend un numéro de port valide');
    }
    else if (a === '--liste') o.liste = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.aide = true;
    else if (a.startsWith('--')) throw new Error(`option inconnue : ${a}`);
    else o.tache.push(a);
  }
  o.tache = o.tache.join(' ').trim();
  return o;
}

function activerProxy() {
  if (!(process.env.HTTPS_PROXY || process.env.https_proxy)) return;
  try {
    require('node:http').setGlobalProxyFromEnv();
  } catch {
    // Node trop ancien : l'appel direct est tenté, l'erreur réseau sera explicite.
  }
}

async function main() {
  const o = lireOptions(process.argv.slice(2));
  if (o.aide) {
    console.log(AIDE);
    return 0;
  }
  const cwd = process.cwd();
  const harness = decouvrir({ racinePlugin: path.resolve(__dirname, '..'), cwd });

  if (o.liste) {
    console.log('Agents :');
    for (const a of harness.agents.values()) console.log(`  ${a.nom} (${a.plugin}) : outils ${a.outils ? a.outils.join(', ') || 'aucun' : 'tous'}${a.ignores.length ? ` ; ignorés : ${a.ignores.join(', ')}` : ''}`);
    console.log('Skills :');
    for (const s of harness.skills.values()) console.log(`  ${s.nom} (${s.plugin})`);
    return 0;
  }

  let definition = null;
  if (o.agent) {
    definition = harness.agents.get(o.agent);
    if (!definition) throw new Error(`agent inconnu : ${o.agent}. Disponibles : ${[...harness.agents.keys()].join(', ') || 'aucun'}`);
    if (definition.ignores.length) console.error(`Outils ignorés pour ${definition.nom} (non disponibles dans ce CLI) : ${definition.ignores.join(', ')}`);
  }

  if (o.dryRun) {
    console.log(promptSysteme({ definition, harness, cwd, profondeur: 0 }));
    console.log(`\nOutils : ${outilsDisponibles(definition, harness, 0).join(', ')}`);
    console.log(`Modèle : ${o.modele}`);
    return 0;
  }

  if (!o.chat && !o.tache) throw new Error('aucune tâche donnée (voir --help)');
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) throw new Error('ANTHROPIC_API_KEY n\'est pas défini');
  activerProxy();

  if (o.chat) {
    if (o.agent || o.tache) throw new Error("--chat ne se combine pas avec --agent ni une tâche : l'agent se choisit dans la page");
    const projets = o.projets.length ? o.projets : (process.env.LELIB_PROJETS || '').split(path.delimiter).filter(Boolean);
    const liste = (projets.length ? projets : [cwd]).map((p) => path.resolve(p));
    for (const p of liste) if (!require('node:fs').existsSync(p)) throw new Error(`projet introuvable : ${p}`);
    const serveur = await demarrer({
      projets: liste,
      port: o.port,
      racinePlugin: path.resolve(__dirname, '..'),
      cle,
      urlBase: (process.env.ANTHROPIC_BASE_URL || URL_PAR_DEFAUT).replace(/\/+$/, ''),
      modele: o.modele,
      maxTours: o.maxTours,
    });
    console.log(`Chat lelib-agent : ${serveur.url}`);
    console.log(`Projets : ${liste.join(', ')}`);
    console.log('Ctrl+C pour arrêter. Les écritures et commandes demandent ta confirmation dans la page.');
    return null;
  }

  const options = {
    cwd,
    cle,
    urlBase: (process.env.ANTHROPIC_BASE_URL || URL_PAR_DEFAUT).replace(/\/+$/, ''),
    modele: o.modele,
    maxTours: o.maxTours,
    yes: o.yes,
    journal: (ligne) => console.error(ligne),
  };
  const r = await executerAgent({ tache: o.tache, definition, harness, options });
  console.error(`— ${r.tours} tour(s), ${r.usage.appels} appel(s) au modèle, ${r.usage.entree} tokens en entrée, ${r.usage.sortie} en sortie.`);
  if (r.texte) console.log(r.texte);
  if (r.arret === 'limite') console.error(`Limite de ${o.maxTours} tours atteinte avant la fin de la tâche.`);
  else if (r.arret !== 'fin') console.error(`Réponse interrompue (${r.arret}).`);
  return r.arret === 'fin' ? 0 : 2;
}

main().then(
  (code) => {
    if (code !== null) process.exit(code);
  },
  (e) => {
    console.error(`Erreur : ${masquer(e.message, process.env.ANTHROPIC_API_KEY)}`);
    process.exit(1);
  },
);
