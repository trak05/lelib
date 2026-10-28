# lelib

Ma bibliothèque d'extensions Claude Code (skills, agents, commandes, hooks, serveurs MCP), organisée en marketplace de plugins.

## Contenu

| Plugin | Contenu |
|---|---|
| `lelib-core` | skill `hello-lelib`, agent `relecteur`, commande `/resume-session`, hook météo à l'ouverture de session, hook de journalisation des éditions (`~/.claude/lelib-edits.log`), serveur MCP `lelib-tools` (`ping`, `date_fr`) |

### Météo à l'ouverture

À chaque nouvelle session, `lelib-core` affiche la météo du jour (données [Open-Meteo](https://open-meteo.com), sans clé).
La ville par défaut est Paris. Pour la changer, définir la variable d'environnement `LELIB_METEO_VILLE`, par exemple dans `~/.claude/settings.json` :

```json
{ "env": { "LELIB_METEO_VILLE": "Lyon" } }
```

## Utilisation

La marketplace est publiée sur GitHub : [trak05/lelib](https://github.com/trak05/lelib).
Pour l'installer sur n'importe quel poste, depuis un terminal `claude` :

```
/plugin marketplace add trak05/lelib
/plugin install lelib-core@lelib
```

Ou, sans commande, dans `~/.claude/settings.json` (tous les projets) ou `.claude/settings.json` (un projet) :

```json
{
  "extraKnownMarketplaces": {
    "lelib": { "source": { "source": "github", "repo": "trak05/lelib" } }
  },
  "enabledPlugins": { "lelib-core@lelib": true }
}
```

Pour récupérer une nouvelle version après un `git push` : `/plugin marketplace update lelib`.

## Ajouter un plugin

1. Créer `plugins/<nom>/.claude-plugin/plugin.json`.
2. L'ajouter dans `.claude-plugin/marketplace.json`.
3. L'activer dans `.claude/settings.json` → `enabledPlugins`.
