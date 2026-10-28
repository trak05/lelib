---
name: hello-lelib
description: Skill d'exemple de lelib. À utiliser quand l'utilisateur demande de vérifier que les plugins lelib sont bien chargés, ou dit "hello lelib".
---

# Hello lelib

Cette skill sert de modèle. Quand elle est déclenchée :

1. Réponds en français que le plugin `lelib-core` est bien chargé.
2. Liste les composants disponibles dans le plugin (skills, agents, commandes, hooks, serveur MCP `lelib-tools`).
3. Si l'outil MCP `lelib-tools` est disponible, appelle son outil `ping` pour confirmer que le serveur MCP répond.

Pour créer une nouvelle skill, copie ce dossier sous `plugins/<plugin>/skills/<nom-de-la-skill>/` et adapte le frontmatter :
la `description` est ce qui décide quand Claude déclenche la skill, soigne-la.
