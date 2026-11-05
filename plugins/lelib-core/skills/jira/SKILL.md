---
name: jira
description: "Crée dans Jira (première colonne, généralement To Do) le ticket correspondant à un brouillon de tickets/, avec une priorité (Medium par défaut) et les points d'estimation Fibonacci des tech leads. Utilisé via /jira <ticket> [priorité] [--dry-run] [--oui]."
argument-hint: "<ticket : numéro, identifiant ou chemin> [priorité] [--dry-run] [--oui]"
disable-model-invocation: true
---

# Envoyer un brouillon dans Jira

Entrée : `$ARGUMENTS`

Le brouillon est un ticket de `tickets/` (créé par `/ticket`, chiffré par les tech leads). Le script `jira-prepare.js` de ce plugin fait tout ce qui est déterministe : lecture du brouillon, points, priorité, description. Toi, tu fais l'appel à Jira avec le connecteur Atlassian. Tu ne codes en dur aucun nom d'outil Jira : tu les découvres (étape 2).

## 0. Lire les arguments
- Le **ticket** est le premier mot qui ne commence pas par `--` : numéro (`1`), identifiant (`bet-001`) ou chemin. Sans ticket, demande lequel, ne choisis pas à sa place.
- La **priorité** est le reste (`haute`, `Low`, `très basse`, ou `--priorite high`). Elle est facultative : **Medium par défaut**. Valeurs Jira : Highest, High, Medium, Low, Lowest (le script comprend aussi haute, moyenne, basse, critique…).
- `--dry-run` : tout préparer et montrer, **sans rien créer**. `--oui` : ne pas demander de confirmation avant la création.

## 1. Préparer le brouillon
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-prepare.js" <ticket> [--priorite <p>] --json
```
(Si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell, retrouve `scripts/jira-prepare.js` avec Glob.)

- Code de sortie **non nul** : montre les `erreurs` telles quelles et **arrête-toi**. Les cas courants : brouillon non chiffré (demande aux tech leads de l'estimer : agents `techlead-back` / `techlead-front`), somme des points supérieure à 13 (le PO doit découper), priorité inconnue, ticket déjà créé dans Jira (donne sa clé). Ne devine jamais une estimation, ne contourne pas un refus.
- Reprends les `avertissements` dans l'aperçu (estimation provisoire, statut différent de `estimé`…).
- Le JSON donne : `ticket`, `typeJira` (type souhaité et noms candidats), `priorite`, `points` (back, front, somme, `retenu` = somme arrondie au Fibonacci supérieur), `etiquette` (`lelib-<id>`), `description` (Markdown), `memo` (projet Jira déjà choisi, ou `null`).

## 2. Trouver les outils Jira
Cherche les outils du connecteur Atlassian avec ToolSearch (par exemple la requête `jira`), puis charge ceux dont tu as besoin : sites accessibles, projets visibles, types de ticket et champs d'un projet, recherche JQL, création d'un ticket, lecture d'un ticket.
- **Aucun outil Jira trouvé** : dis-le, explique qu'il faut connecter le connecteur **Atlassian** dans Claude (réglages, connecteurs) puis relancer la session, et arrête-toi. N'essaie pas de joindre Jira autrement et ne demande jamais de jeton dans la conversation.
- Lis la description de chaque outil et respecte ses paramètres réels (format du texte, nom des champs) au lieu de supposer.

## 3. Site, projet, types et champs
1. **Site et projet** : si `memo` est renseigné (`site`, `cloudId`, `projet`), utilise-le. Sinon, liste les sites et projets accessibles et **demande une fois** lequel utiliser, puis écris `tickets/.jira.json` : `{"site": "https://<nom>.atlassian.net", "cloudId": "<identifiant>", "projet": "<CLÉ>"}` (aucun secret dans ce fichier). Pas en `--dry-run`.
2. **Type de ticket** : parmi les types du projet, prends le premier qui correspond aux `candidats` de `typeJira` (les noms peuvent être en français : Histoire, Bogue, Tâche). Aucun ne correspond : dis lesquels existent et demande, n'invente pas.
3. **Métadonnées de création** (projet + type) : relève
   - les valeurs de **priorité** permises : si la priorité du script n'existe pas dans le projet, prends la plus proche et dis-le ;
   - le champ d'**estimation** (« Story Points » ou « Story point estimate ») : s'il n'est pas disponible pour ce type, ne l'invente pas, laisse les points dans la description et dis-le ;
   - les autres **champs obligatoires** sans valeur par défaut : demande à l'utilisateur ou arrête-toi, ne mets pas de valeur au hasard.

## 4. Doublon, aperçu, confirmation
1. Cherche un ticket existant (JQL : le projet et l'étiquette `lelib-<id>`, par exemple `project = <CLÉ> AND labels = "lelib-<id>"`). S'il y en a un, donne sa clé et **arrête-toi** : aucun doublon.
2. Montre l'**aperçu** : site et projet, type, titre, priorité (et si c'est la valeur par défaut), points (« back 3 + front 5 = 8 → 8 »), étiquette, statut attendu (premier statut du workflow, généralement To Do), début de la description, avertissements.
3. `--dry-run` : arrête-toi ici en disant que rien n'a été créé.
4. Sans `--oui`, demande une confirmation explicite avant de créer. Une création dans Jira prévient des personnes et ne s'annule pas proprement.

## 5. Créer
Crée **un seul** ticket :
- résumé = `ticket.titre` ; description = `description` du script (Markdown ; si l'outil attend un autre format, convertis sans rien perdre) ;
- type, priorité et points tels que validés à l'étape 3 ; étiquette = `etiquette` ;
- **ne renseigne ni statut ni assigné** : un ticket neuf arrive dans le premier statut du workflow, et il n'est pas à toi de désigner quelqu'un. **Ne fais aucune transition.**

Relis ensuite le ticket créé : clé, lien (`<site>/browse/<CLÉ>`) et **statut obtenu**. S'il n'est pas dans la première colonne (To Do ou équivalent), dis-le, sans le déplacer.

## 6. Garder la trace en local
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/jira-prepare.js" <ticket> --enregistrer <CLÉ> --url <lien>
```
Cela ajoute `jira`, `jira_url` et `jira_cree_le` à l'en-tête du brouillon (le `statut` local ne change pas) : un second `/jira` sur ce brouillon sera refusé.

## 7. Bilan
En quelques lignes : clé et lien du ticket, projet, type, priorité, points, statut obtenu, avertissements repris. Dis clairement ce que tu n'as pas pu vérifier (champ de points absent, priorité remplacée, format de description converti).

## Règles
- Jamais de création sans aperçu ; jamais de création si le script refuse le brouillon ; jamais deux tickets pour un même brouillon.
- Ne modifie, ne commente et ne déplace aucun ticket Jira existant.
- Ne demande, n'affiche et n'écris aucun jeton ou mot de passe.
- Ne fais ni commit ni push. Ne modifie le brouillon que par `--enregistrer`.
