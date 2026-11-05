---
name: dev
description: "Développe un ticket de tickets/ (ou tous les tickets en attente) sur sa propre branche feature-<id> ou fix-<id> tirée d'un develop à jour, le range dans tickets/done/ puis commit et push la branche. Utilisé via /dev <numéro> ou /dev seul."
argument-hint: "[numéro de ticket, optionnel : sans numéro, tous les tickets]"
disable-model-invocation: true
---

# Développer les tickets

Entrée : `$ARGUMENTS`

Chaque ticket est développé sur **sa propre branche**, tirée d'un `develop` à jour : `feature-bet-007` pour une fonctionnalité ou une tâche technique, `fix-bet-007` pour une anomalie (champ `type:` du ticket). Le script `branche-dev.js` de ce plugin fait tout le travail git (retrouve son dossier `scripts/` avec Glob si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell) ; tu ne lances toi-même aucune autre commande git qui modifie un dépôt.

## 1. Choisir les tickets

Le dossier `tickets/` est à la racine du projet (la même qu'avec `/ticket` : racine git si elle existe, sinon le répertoire courant).

- **Avec un numéro** (`3`, `003` ou `bet-003`) : prends le ticket dont le numéro correspond, sans tenir compte des zéros. Cherche-le dans `tickets/` seulement.
  - Introuvable dans `tickets/` mais présent dans `tickets/done/` : dis qu'il est déjà terminé et arrête-toi.
  - Introuvable partout : dis-le et arrête-toi.
- **Sans argument** : prends tous les fichiers `tickets/*.md` (pas ceux de `tickets/done/`), triés par numéro croissant. S'il n'y en a aucun, dis-le et arrête-toi.

Annonce en une ligne la liste des tickets que tu vas traiter avant de commencer.

## 2. Pour chaque ticket, dans l'ordre

### a. Lire le ticket
- Lis le ticket en entier.
- Si les **Questions ouvertes** contiennent un point qui change la façon de développer :
  - avec un numéro : pose la question à l'utilisateur et attends la réponse ;
  - sans argument : ne développe pas ce ticket (pas de branche, pas de changement de statut), laisse-le dans `tickets/`, note-le pour le bilan, et passe au suivant.
- N'invente pas de règle métier pour combler un manque.
- Détermine ce que le ticket touche d'après son contenu (« Besoin », « Pistes techniques ») : base de données, back, front.

### b. Créer la branche
Avant de modifier quoi que ce soit (y compris le statut du ticket) :
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/branche-dev.js" preparer <ticket> [--depots backend,frontend] --json
```
Pour chaque dépôt, le script exige un arbre propre, fait `git fetch`, se place sur `develop`, fait `git pull --ff-only origin develop`, puis crée `feature-<id>` (ou `fix-<id>`). Une branche qui existe déjà est reprise telle quelle.
- **Plusieurs dépôts** (par exemple `backend` et `frontend`) : passe avec `--depots` uniquement ceux que le ticket touche (le changement de schéma de base compte pour le back). Sans `--depots`, tous les dépôts sont branchés.
- **Code de sortie non nul** : le ticket n'est pas commencé. Montre les erreurs telles quelles (arbre non propre, `develop` introuvable, pull impossible, fetch impossible…) et **arrête-toi, sans passer aux tickets suivants**. Ne cache pas, ne commite pas, n'écarte pas les changements de l'utilisateur pour contourner un refus : c'est à lui de décider.
- **Aucun dépôt git** : le script le dit (avertissement, code 0). Continue sans branche et signale-le dans le bilan.
- Reprends les avertissements dans le bilan (branche reprise, fichiers non suivis laissés de côté, pas de dépôt distant).
- Une fois la branche prête, passe le `statut` du ticket à `en-cours`.

### c. Développer en déléguant aux agents
Délègue avec l'outil Agent, en donnant le chemin du ticket et la consigne de le lire. Précise-leur de **ne pas commiter et de ne pas changer de branche** : tu t'en charges.

1. Le schéma de base change : agent `lelib-equipe:dba` en premier, qui écrit un changeset **Liquibase** (skill `/db-migration` du plugin `lelib-conception`). Le schéma ne se modifie jamais autrement : ni `ddl-auto`, ni Flyway, ni SQL à la main.
2. Le back est concerné : agent `lelib-equipe:dev-back`.
3. Le front est concerné : agent `lelib-equipe:dev-front`, **après** le back si le front dépend d'un nouvel endpoint, pour qu'il parte du contrat réel.

Les agents `dev-back` et `dev-front` travaillent en **TDD** (test rouge, code minimal, refactor). Rappelle-le dans ta consigne et demande-leur de rendre, par critère, le test écrit en premier et son échec initial. Si le plugin `lelib-tdd` est installé, demande-leur aussi de suivre le skill `/tdd` : tests lancés avec `tdd-run.js` (journal rouge / vert) et nommés `[<ticket> CA-n]`.

Un ticket qui ne touche qu'un côté ne mobilise que l'agent correspondant. Si le projet n'a qu'un seul côté (pas de back, ou pas de front), saute l'agent inutile.

### d. Vérifier
- Le TDD a été suivi : chaque critère a un test, et le bilan de l'agent dit qu'il a d'abord échoué. Sinon, redemande-le à l'agent avant de clôturer.
- **Avec `lelib-tdd`** (retrouve les scripts avec Glob : `**/lelib-tdd/**/scripts/`) : ne te fie pas au compte rendu, lance toi-même `node tdd-run.js --bilan` (aucune alerte, au moins un cycle rouge → vert) et `node check-criteres.js <ticket>` (tous les critères cités par un test). Une alerte ou un critère sans test bloque la clôture : le ticket reste `en-cours` avec une section `## Blocage`.
- Les tests des parties modifiées passent (les agents les lancent ; relance-les toi-même en cas de doute).
- Chaque critère d'acceptation est couvert. Coche ceux qui le sont (`- [x]`) dans le ticket.

### e. Clôturer ou non
- **Tout est vérifié** :
  1. passe `statut` à `terminé`, ajoute une ligne `termine_le: <date du jour AAAA-MM-JJ>` dans l'en-tête, puis déplace le fichier dans `tickets/done/` (crée le dossier si besoin ; `git mv` si le fichier est suivi par git, sinon `mv`). Le nom du fichier ne change pas ;
  2. commit et push de la branche :
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/branche-dev.js" terminer <ticket> [--depots …] [--coauteur "<ligne>"] --json
     ```
     Mêmes `--depots` qu'à l'étape b. Si la session impose une ligne d'attribution de co-auteur dans les commits, passe-la avec `--coauteur`. Le script ne commite que les changements du ticket (le fichier du ticket y compris, jamais les autres brouillons ni les fichiers non suivis d'avant le développement), avec le message `feature(bet-007): <titre>` ou `fix(bet-007): <titre>`, puis pousse `feature-<id>` / `fix-<id>`.
  3. Si le script échoue (hook de commit qui refuse, droits de push, réseau) : le ticket reste terminé, le commit local est conservé s'il a eu lieu ; **dis l'erreur telle quelle et arrête-toi**, sans passer aux tickets suivants et sans contourner (pas de `--no-verify`, pas de force-push).
- **Un test échoue, un critère n'est pas rempli, ou un agent est bloqué** : laisse le ticket dans `tickets/` avec `statut: en-cours`, ajoute en fin de fichier une section `## Blocage` qui décrit le problème avec la sortie utile. **Ne commite ni ne pousse rien** : le travail reste sur la branche du ticket, non commité, pour être repris ensuite (un nouveau `/dev` reprend la branche). **Arrête-toi là**, sans passer aux tickets suivants : ils peuvent dépendre de celui-ci.

Au ticket suivant, l'étape b repart de `develop` (rendu à jour par le pull) : la branche d'un ticket ne contient pas le travail du précédent. Si les tickets dépendent les uns des autres, dis-le dans le bilan : l'utilisateur fusionnera dans l'ordre.

## 3. Règles

- Commit et push **uniquement** par `branche-dev.js terminer`, pour un ticket terminé et vérifié. Jamais sur `develop`, `main` ou `master`, jamais de force-push, jamais de `--no-verify`, jamais de `merge`, `rebase`, `reset` ni `stash`. Un échec git s'arrête et se signale.
- Ne déplace jamais un ticket dans `done/` sans que ses tests passent.
- Ne touche pas aux tickets que tu n'as pas traités.

## 4. Bilan

Termine par un tableau court : ticket → branche, résultat (terminé / bloqué / ignoré, avec la raison), commit et push (réussis ou non). Puis la liste des fichiers de code modifiés. Signale les avertissements git repris du script et ce qui n'a pas pu être vérifié (par exemple le rendu dans un navigateur). Rappelle que les branches sont poussées mais **pas fusionnées** : la revue et la fusion dans `develop` restent à l'utilisateur.
