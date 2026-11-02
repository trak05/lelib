# lelib

Ma bibliothèque d'extensions Claude Code (skills, agents, commandes, hooks, serveurs MCP), organisée en marketplace de plugins.

## Contenu

| Plugin | Contenu |
|---|---|
| `lelib-core` | skill `/ticket`, skill `hello-lelib`, agent `relecteur`, commande `/resume-session`, hook de journalisation des éditions (`~/.claude/lelib-edits.log`), serveur MCP `lelib-tools` (`ping`, `date_fr`) |
| `lelib-equipe` | skill `/dev`, agents `po`, `dev-front`, `dev-back`, `qa`, `techlead-front`, `techlead-back`, `dba`, serveur MCP `playwright` (tests dans le navigateur, pour le `qa`) |
| `lelib-angular` | skills `angular-setup` et `angular-ui`, vérification de compatibilité Angular / Node à l'ouverture de session |

### Angular : Bootstrap + PrimeNG (lelib-angular)

- **Bootstrap** sert à la mise en page (grille, flex, espacements), **PrimeNG** à tous les composants (table, datepicker, multiselect…).
- **Vérification de version** : à l'ouverture d'une session dans un projet Angular, un hook compare Angular, Node et PrimeNG (en local, sans réseau). Il n'affiche rien si tout va bien, et un avertissement sinon (Node trop ancien pour Angular, PrimeNG qui ne correspond pas à la version d'Angular).
- **`angular-setup`** : à l'installation ou à la mise à jour, lance `scripts/check-compat.js`, qui interroge npm pour trouver la version de PrimeNG compatible avec l'Angular du projet, puis installe et configure PrimeNG et Bootstrap.
- **`angular-ui`** : conventions pour créer les écrans (Bootstrap pour la mise en page, PrimeNG pour les composants).

Le script se lance aussi à la main, depuis le dossier du projet :

```
node plugins/lelib-angular/scripts/check-compat.js [dossier]
```

### L'équipe (lelib-equipe)

| Agent | Rôle | Modifie |
|---|---|---|
| `po` | clarifie le besoin, rédige tickets et critères d'acceptation | `tickets/` uniquement |
| `techlead-back` | cadre et estime les tickets avec le PO, valide les pull requests du back | le ticket seulement, jamais le code |
| `techlead-front` | cadre et estime les tickets avec le PO, valide les pull requests du front | le ticket seulement, jamais le code |
| `dev-back` | implémente le back et ses tests | code back |
| `dev-front` | implémente le front et ses tests | code front |
| `dba` | schéma, migrations, performance PostgreSQL | migrations, entités |
| `qa` | vérifie les critères d'acceptation dans un vrai navigateur (Playwright), cherche les cas limites | tests uniquement |

Exemple de chaîne : `/ticket` → `po` affine → `techlead-back` / `techlead-front` cadrent et estiment → `dba` si le schéma change → `dev-back` / `dev-front` codent → `qa` vérifie → pull request → les tech leads la valident.

#### Le QA et Playwright

Le plugin embarque le serveur MCP [Playwright](https://github.com/microsoft/playwright-mcp) (version épinglée dans `mcp/playwright.js`), réservé à l'agent `qa`. Il déroule les parcours dans un vrai navigateur, puis les transforme en tests `@playwright/test` de non-régression.

- **Navigateur : installation automatique.** Au premier démarrage de session après l'ajout du plugin, un hook lance en arrière-plan l'installation de Chromium (environ 700 Mo, une fois par machine, pas par projet). La session n'attend pas : l'agent `qa` est utilisable dès que c'est terminé. Le hook ne dit plus rien ensuite, et relance l'installation si le navigateur a été supprimé.
  - Le téléchargement passe par le proxy défini dans `HTTPS_PROXY`.
  - En cas d'échec, une nouvelle tentative a lieu au plus d'une fois par heure. Le journal est `install-chromium.log`, dans le dossier de données du plugin (`~/.claude/lelib-equipe/` à défaut).
  - Installation manuelle (la version doit être celle du serveur, pas la dernière) : `npx playwright@1.65.0-alpha-2026-10-30 install chromium`.
  - Désactiver : `LELIB_SKIP_BROWSER_INSTALL=1`.
- **Navigateur utilisé** : Chromium de Playwright, et non le Chrome du poste. Pour en changer : `LELIB_PLAYWRIGHT_BROWSER=chrome` (ou `msedge`, `firefox`).
- **Application** : le `qa` démarre les commandes du projet si l'application ne tourne pas.
- **Sans fenêtre** : `LELIB_PLAYWRIGHT_HEADLESS=1`, ou automatiquement quand la variable `CI` est définie.
- **Restreindre les sites joignables** : `LELIB_QA_ORIGINS="http://localhost:4200;http://localhost:8080"`.
- **Captures et traces** : écrites dans `.playwright-mcp/` du projet testé, à ajouter à son `.gitignore`.
- **Premier démarrage** : le serveur est téléchargé avec `npx`, ce qui demande un accès à npm.

#### Les tech leads

- **Cadrage et estimation** : chaque tech lead complète le ticket par une section « Cadrage technique », une estimation en points (1, 2, 3, 5, 8, 13 ; `points_back` et `points_front` dans l'en-tête) et ses « Questions pour le PO ». Le PO y répond dans le ticket, ou les remonte à l'utilisateur. Au-delà de 8 points, le ticket est découpé. Le ticket passe à `estimé` quand tous les côtés concernés ont leurs points et qu'aucune question bloquante ne reste.
- **Validation d'une pull request GitHub** : le tech lead concerné (back ou front, selon les fichiers) relit le diff, vérifie les checks et les critères d'acceptation du ticket, puis approuve, ou demande des modifications avec des commentaires en ligne dans la pull request. Il ne fusionne jamais et ne modifie jamais le code.
- **Prérequis** : l'outil [`gh`](https://cli.github.com) installé et connecté (`gh auth login`).
- **Limite** : GitHub interdit d'approuver sa propre pull request. Si le tech lead utilise le même compte que l'auteur, il poste un commentaire qui porte le verdict.

Exemples : « demande au techlead-back de cadrer et d'estimer bet-003 », « fais valider la PR 12 par le techlead-front ».

### /dev

Développe des tickets avec les agents, puis range ceux qui sont terminés dans `tickets/done/` :

```
/dev 3        # le ticket numéro 3 (003 ou bet-003 marchent aussi)
/dev          # tous les tickets de tickets/, dans l'ordre des numéros
```

Pour chaque ticket : `dba` si le schéma change, puis `dev-back`, puis `dev-front`. Le ticket n'est déplacé dans `done/` (statut `terminé`, critères cochés) que si les tests passent.
En cas d'échec, le ticket reste dans `tickets/` avec une section `## Blocage` et `/dev` s'arrête, car les tickets suivants peuvent en dépendre. Un ticket dont les questions ouvertes bloquent le développement est sauté (sans argument) ou fait poser la question (avec un numéro). `/dev` ne fait jamais de commit.

On appelle les agents en langage naturel : « demande au techlead-back de relire ce controller », « fais vérifier bet-001 par le qa ».

### /ticket

Crée un ticket brouillon dans le dossier `tickets/` du projet :

```
/ticket specs/export-csv.md
/ticket Permettre l'export CSV de la liste des compteurs
```

Le ticket est nommé `<3 premières lettres du projet>-<numéro>`, par exemple `tickets/opa-001.md` pour le projet `opamt`.
La numérotation repart du plus grand numéro existant, sans jamais en réutiliser un.

## Utilisation

La marketplace est publiée sur GitHub : [trak05/lelib](https://github.com/trak05/lelib).
Pour l'installer sur n'importe quel poste, depuis un terminal `claude` :

```
/plugin marketplace add trak05/lelib
/plugin install lelib-core@lelib
/plugin install lelib-equipe@lelib
/plugin install lelib-angular@lelib
```

`lelib-core`, `lelib-equipe` et `lelib-angular` s'installent indépendamment : n'installe que ceux dont tu as besoin.

Ou, sans commande, dans `~/.claude/settings.json` (tous les projets) ou `.claude/settings.json` (un projet) :

```json
{
  "extraKnownMarketplaces": {
    "lelib": { "source": { "source": "github", "repo": "trak05/lelib" } }
  },
  "enabledPlugins": {
    "lelib-core@lelib": true,
    "lelib-equipe@lelib": true,
    "lelib-angular@lelib": true
  }
}
```

Pour récupérer une nouvelle version après un `git push` : `/plugin marketplace update lelib`.

## Ajouter un plugin

1. Créer `plugins/<nom>/.claude-plugin/plugin.json`.
2. L'ajouter dans `.claude-plugin/marketplace.json`.
3. L'activer dans `.claude/settings.json` → `enabledPlugins`.
