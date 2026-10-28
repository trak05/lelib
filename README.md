# lelib

Ma bibliothèque d'extensions Claude Code (skills, agents, commandes, hooks, serveurs MCP), organisée en marketplace de plugins.

## Contenu

| Plugin | Contenu |
|---|---|
| `lelib-core` | skill `hello-lelib`, agent `relecteur`, commande `/resume-session`, hook de journalisation des éditions (`~/.claude/lelib-edits.log`), serveur MCP `lelib-tools` (`ping`, `date_fr`) |

## Utilisation

Dans ce dossier, les plugins sont activés automatiquement via `.claude/settings.json`.

Pour les utiliser ailleurs, depuis un terminal `claude` :

```
/plugin marketplace add "C:\Users\NS6785\OneDrive - GRDF\Bureau\workspace\lelib"
/plugin install lelib-core@lelib
```

## Ajouter un plugin

1. Créer `plugins/<nom>/.claude-plugin/plugin.json`.
2. L'ajouter dans `.claude-plugin/marketplace.json`.
3. L'activer dans `.claude/settings.json` → `enabledPlugins`.
