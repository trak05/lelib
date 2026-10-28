# lelib

Atelier personnel pour développer des extensions Claude Code : skills, agents, commandes, hooks et serveurs MCP.
Le dépôt est une **marketplace de plugins** (`.claude-plugin/marketplace.json`) ; chaque plugin vit sous `plugins/<nom>/`.

## Structure d'un plugin

```
plugins/<nom>/
  .claude-plugin/plugin.json   # nom, version, description (obligatoire)
  skills/<skill>/SKILL.md      # frontmatter name + description, puis les instructions
  agents/<agent>.md            # frontmatter name, description, tools
  commands/<commande>.md       # devient /<commande>
  hooks/hooks.json             # + scripts dans hooks/scripts/
  .mcp.json                    # serveurs MCP ; sources dans mcp/
```

## Conventions

- Textes (descriptions, instructions, messages) en français.
- Scripts de hooks et serveurs MCP en Node.js (disponible sur le poste, Windows) ; référencer les fichiers via `${CLAUDE_PLUGIN_ROOT}`.
- Un hook ne doit jamais bloquer : capturer les erreurs et sortir avec le code 0, sauf blocage voulu (code 2).
- Tout nouveau plugin doit être ajouté dans `.claude-plugin/marketplace.json`, et activé dans `.claude/settings.json` (`enabledPlugins`) pour être testé ici.
- Incrémenter `version` dans `plugin.json` à chaque changement publié.

## Tester

- Serveur MCP à la main : envoyer des lignes JSON-RPC sur stdin (`initialize`, `tools/list`, `tools/call`).
- Hook à la main : `echo '{"tool_name":"Write","tool_input":{"file_path":"x"}}' | node hooks/scripts/<script>.js`
- Après une modification, redémarrer la session Claude Code pour recharger le plugin.
