---
name: dev
description: "Développe un ticket de tickets/ (ou tous les tickets en attente), puis le range dans tickets/done/. Utilisé via /dev <numéro> ou /dev seul."
argument-hint: "[numéro de ticket]"
disable-model-invocation: true
---

# Développer les tickets

Entrée : `$ARGUMENTS`

## 1. Choisir les tickets

Le dossier `tickets/` est à la racine du projet (la même qu'avec `/ticket` : racine git si elle existe, sinon le répertoire courant).

- **Avec un numéro** (`3`, `003` ou `bet-003`) : prends le ticket dont le numéro correspond, sans tenir compte des zéros. Cherche-le dans `tickets/` seulement.
  - Introuvable dans `tickets/` mais présent dans `tickets/done/` : dis qu'il est déjà terminé et arrête-toi.
  - Introuvable partout : dis-le et arrête-toi.
- **Sans argument** : prends tous les fichiers `tickets/*.md` (pas ceux de `tickets/done/`), triés par numéro croissant. S'il n'y en a aucun, dis-le et arrête-toi.

Annonce en une ligne la liste des tickets que tu vas traiter avant de commencer.

## 2. Pour chaque ticket, dans l'ordre

### a. Lire et préparer
- Lis le ticket en entier. Passe son `statut` à `en-cours`.
- Si les **Questions ouvertes** contiennent un point qui change la façon de développer :
  - avec un numéro : pose la question à l'utilisateur et attends la réponse ;
  - sans argument : ne développe pas ce ticket, laisse-le dans `tickets/`, note-le pour le bilan, et passe au suivant.
- N'invente pas de règle métier pour combler un manque.

### b. Développer en déléguant aux agents
Détermine ce que le ticket touche d'après son contenu (« Besoin », « Pistes techniques »), puis délègue avec l'outil Agent, en donnant le chemin du ticket et la consigne de le lire :

1. Le schéma de base change : agent `lelib-equipe:dba` en premier.
2. Le back est concerné : agent `lelib-equipe:dev-back`.
3. Le front est concerné : agent `lelib-equipe:dev-front`, **après** le back si le front dépend d'un nouvel endpoint, pour qu'il parte du contrat réel.

Un ticket qui ne touche qu'un côté ne mobilise que l'agent correspondant. Si le projet n'a qu'un seul côté (pas de back, ou pas de front), saute l'agent inutile.

### c. Vérifier
- Les tests des parties modifiées passent (les agents les lancent ; relance-les toi-même en cas de doute).
- Chaque critère d'acceptation est couvert. Coche ceux qui le sont (`- [x]`) dans le ticket.

### d. Clôturer ou non
- **Tout est vérifié** : passe `statut` à `terminé`, ajoute une ligne `termine_le: <date du jour AAAA-MM-JJ>` dans l'en-tête, puis déplace le fichier dans `tickets/done/` (crée le dossier si besoin ; utilise `git mv` si le fichier est suivi par git, sinon `mv`). Le nom du fichier ne change pas.
- **Un test échoue, un critère n'est pas rempli, ou un agent est bloqué** : laisse le ticket dans `tickets/` avec `statut: en-cours`, ajoute en fin de fichier une section `## Blocage` qui décrit le problème avec la sortie utile. **Arrête-toi là**, sans passer aux tickets suivants : ils peuvent dépendre de celui-ci.

## 3. Règles

- Ne fais pas de commit ni de push : l'utilisateur relit d'abord.
- Ne déplace jamais un ticket dans `done/` sans que ses tests passent.
- Ne touche pas aux tickets que tu n'as pas traités.

## 4. Bilan

Termine par un tableau court : ticket → résultat (terminé / bloqué / ignoré, avec la raison), puis la liste des fichiers de code modifiés. Signale ce qui n'a pas pu être vérifié (par exemple le rendu dans un navigateur).
