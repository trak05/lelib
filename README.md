# lelib

Ma bibliothèque d'extensions Claude Code (skills, agents, commandes, hooks, serveurs MCP), organisée en marketplace de plugins.

## Contenu

| Plugin | Contenu |
|---|---|
| `lelib-core` | skill `/ticket`, skill `hello-lelib`, agent `relecteur`, commande `/resume-session`, hook météo à l'ouverture de session, hook de journalisation des éditions (`~/.claude/lelib-edits.log`), serveur MCP `lelib-tools` (`ping`, `date_fr`) |
| `lelib-equipe` | agents `po`, `dev-front`, `dev-back`, `qa`, `techlead-front`, `techlead-back`, `dba` |

### L'équipe (lelib-equipe)

| Agent | Rôle | Modifie |
|---|---|---|
| `po` | clarifie le besoin, rédige tickets et critères d'acceptation | `tickets/` uniquement |
| `techlead-back` | conçoit et relit le back Spring Boot | rien (lecture seule) |
| `techlead-front` | conçoit et relit le front Angular | rien (lecture seule) |
| `dev-back` | implémente le back et ses tests | code back |
| `dev-front` | implémente le front et ses tests | code front |
| `dba` | schéma, migrations, performance PostgreSQL | migrations, entités |
| `qa` | vérifie les critères d'acceptation, cherche les cas limites | tests uniquement |

Exemple de chaîne : `/ticket` → `po` affine → `techlead-back` / `techlead-front` conçoivent → `dba` si le schéma change → `dev-back` / `dev-front` codent → `qa` vérifie → tech leads relisent.

On les appelle en langage naturel : « demande au techlead-back de relire ce controller », « fais vérifier bet-001 par le qa ».

### /ticket

Crée un ticket brouillon dans le dossier `tickets/` du projet :

```
/ticket specs/export-csv.md
/ticket Permettre l'export CSV de la liste des compteurs
```

Le ticket est nommé `<3 premières lettres du projet>-<numéro>`, par exemple `tickets/opa-001.md` pour le projet `opamt`.
La numérotation repart du plus grand numéro existant, sans jamais en réutiliser un.

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
/plugin install lelib-equipe@lelib
```

`lelib-core` et `lelib-equipe` s'installent indépendamment : n'installe que ceux dont tu as besoin.

Ou, sans commande, dans `~/.claude/settings.json` (tous les projets) ou `.claude/settings.json` (un projet) :

```json
{
  "extraKnownMarketplaces": {
    "lelib": { "source": { "source": "github", "repo": "trak05/lelib" } }
  },
  "enabledPlugins": {
    "lelib-core@lelib": true,
    "lelib-equipe@lelib": true
  }
}
```

Pour récupérer une nouvelle version après un `git push` : `/plugin marketplace update lelib`.

## Ajouter un plugin

1. Créer `plugins/<nom>/.claude-plugin/plugin.json`.
2. L'ajouter dans `.claude-plugin/marketplace.json`.
3. L'activer dans `.claude/settings.json` → `enabledPlugins`.
