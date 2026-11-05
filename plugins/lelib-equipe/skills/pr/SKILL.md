---
name: pr
description: "Crée sur GitHub la pull request de la branche d'un ticket (feature-<id> ou fix-<id>) vers develop, avec un titre et un corps tirés du ticket (besoin, critères, estimation, lien Jira). Utilisé via /pr <ticket> [--brouillon] [--oui] [--dry-run]."
argument-hint: "<ticket : numéro, identifiant ou chemin> [--brouillon] [--oui] [--dry-run] [--base develop]"
disable-model-invocation: true
---

# Créer la pull request d'un ticket

Entrée : `$ARGUMENTS`

Le script `pr-prepare.js` de ce plugin fait toute la partie déterministe : il vérifie que la branche est prête, construit le titre et le corps, puis appelle la CLI GitHub (`gh`). Retrouve son dossier `scripts/` avec Glob si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell. Tu ne lances toi-même aucune commande qui crée ou modifie une PR, une branche ou un dépôt.

## 0. Lire les arguments
- Le **ticket** est le premier mot qui ne commence pas par `--` : numéro (`7`), identifiant (`bet-007`) ou chemin. Sans ticket, demande lequel.
- `--brouillon` : PR en brouillon (draft). `--oui` : pas de confirmation avant la création. `--dry-run` : contrôles et aperçu, **rien n'est créé**. `--base <branche>` : destination autre que `develop`.
- Projet à plusieurs dépôts (back et front) : par défaut, une PR dans chaque dépôt où le ticket a une branche. `--depots backend` limite à un dépôt.

## 1. Contrôler et prévisualiser
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-prepare.js" preparer <ticket> --json
```
Ajoute `--depots` / `--base` si on te les a donnés. Le script vérifie, pour chaque dépôt : la branche existe et **est poussée** (aucun commit local en retard sur `origin`), elle contient au moins un commit par rapport à la destination, aucune PR n'est déjà ouverte pour elle, et `gh` est connecté. Le ticket peut être dans `tickets/`, dans `tickets/done/`, ou, si tu es revenu sur `develop`, il est relu dans sa branche.

**Code de sortie non nul : arrête-toi et montre les erreurs telles quelles.** Ne les contourne pas. Les cas courants :
- **`gh` introuvable ou non connecté** : dis à l'utilisateur d'installer la CLI GitHub et de lancer **lui-même** `gh auth login`. Ne demande, n'affiche et n'écris jamais de jeton.
- **Branche non poussée ou commits non poussés** : le ticket n'est pas terminé côté `/dev`, ou le push a échoué. Dis-le ; ne pousse pas toi-même.
- **PR déjà ouverte** : donne son lien, aucune PR en double.
- **Ticket avec une section « Blocage »** : le travail n'est pas fini, pas de PR.
- **Dépôt qui n'est pas sur GitHub** (GitLab par exemple) : `gh` le refuse, relaie son message.
Les **avertissements** (ticket non marqué terminé, changements non commités qui ne seront pas dans la PR, ticket relu dans sa branche) vont dans l'aperçu.

## 2. Aperçu et confirmation
Montre, pour chaque dépôt : `branche → destination`, le **titre** (`feature(bet-007): <titre>` ou `fix(bet-007): <titre>`), le nombre de commits, le début du corps (ticket, besoin, critères, estimation, lien Jira) et les avertissements.
- `--dry-run` : arrête-toi ici en disant que rien n'a été créé.
- Sans `--oui`, demande une confirmation explicite : une PR notifie les relecteurs.

## 3. Créer
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-prepare.js" creer <ticket> [--depots …] [--base …] [--brouillon] --json
```
Le script refait les contrôles, puis lance `gh pr create` dans chaque dépôt prêt. **Si un seul dépôt n'est pas prêt, aucune PR n'est créée.** Si `gh pr create` échoue pour un dépôt, `crees` liste les PR déjà ouvertes : dis-le, relaie l'erreur, ne relance pas à l'aveugle (un nouveau `/pr` détectera les PR existantes).

## 4. Bilan
Rends les **liens des PR** (une par dépôt), le titre, la destination et les avertissements. Rappelle que la PR est **créée mais pas fusionnée**, et propose la suite : la relecture, en langage naturel (« demande au techlead-back de relire la PR <numéro> »). L'URL de la PR n'est pas écrite dans le ticket (le fichier est déjà commité sur la branche) : elle se retrouve avec `gh pr list` et dans la sortie JSON.

## Règles
- Jamais de PR sans contrôle préalable ; jamais deux PR pour la même branche ; jamais de PR vers `main` sauf demande explicite (`--base`).
- Ne pousse rien, ne fusionne rien, ne ferme, ne modifie et ne commente aucune PR existante.
- Ne modifie ni le ticket ni le code. Ne fais ni commit ni push.
- Ne présente pas comme faite une PR dont tu n'as pas lu le lien dans la sortie du script.
