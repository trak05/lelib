---
name: agent
description: "Lance l'agent IA maison de lelib (modèle Claude via l'API Anthropic + harness des plugins) sur une tâche, en dehors de Claude Code. Utilisé via /agent [--agent <nom>] <tâche>."
argument-hint: "[--agent <nom>] <tâche>"
disable-model-invocation: true
---

# Lancer l'agent lelib

Entrée : `$ARGUMENTS`

L'agent est le CLI `bin/lelib-agent.js` du plugin. Il combine un modèle Claude (API Anthropic) et le harness des plugins lelib : les agents (`agents/*.md`) donnent le rôle et les outils autorisés, les skills (`skills/*/SKILL.md`) sont chargés à la demande, et l'outil `delegate` confie une sous-tâche à un autre agent.

## 1. Vérifier

- `ANTHROPIC_API_KEY` doit être défini dans l'environnement. Sinon, dis-le et arrête-toi : ne demande jamais la clé dans la conversation et ne l'écris nulle part.
- Pour voir ce que l'agent a trouvé : `node "${CLAUDE_PLUGIN_ROOT}/bin/lelib-agent.js" --liste`.
- Pour voir son prompt et ses outils sans appeler l'API : ajoute `--dry-run`.

## 2. Lancer

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/lelib-agent.js" [--agent <nom>] "<tâche>"
```

(Si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell, retrouve `bin/lelib-agent.js` avec Glob.)

- Sans `--agent`, l'agent est généraliste. Avec `--agent po`, `dev-back`, `qa`…, il joue ce rôle avec ses outils.
- Les écritures de fichiers et les commandes shell de l'agent demandent confirmation. **N'ajoute `--yes` que si l'utilisateur l'a demandé** pour cette tâche.
- La réponse finale est sur la sortie standard ; le journal des outils et la consommation de tokens sont sur la sortie d'erreur.
- Code de sortie : 0 terminé, 1 erreur, 2 limite de tours atteinte ou réponse interrompue.

## 3. Rendre compte

Reprends le bilan de l'agent tel quel, sans présenter comme fait ce qu'il n'a pas vérifié, puis lis les fichiers modifiés (`git status`, `git diff`) avant de dire que la tâche est réussie. Ne fais ni commit ni push.

## Chat web

Pour discuter avec l'agent dans un navigateur plutôt que de lancer une tâche unique, l'utilisateur lance `node "${CLAUDE_PLUGIN_ROOT}/bin/lelib-agent.js" --chat --projet <dossier>` dans son propre terminal (le serveur reste actif ; ne le lance pas toi-même en arrière-plan sans qu'il le demande). L'adresse avec le jeton s'affiche au lancement.
