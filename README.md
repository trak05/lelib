# lelib

Ma bibliothèque d'extensions Claude Code (skills, agents, commandes, hooks, serveurs MCP), organisée en marketplace de plugins.

## Contenu

| Plugin | Contenu |
|---|---|
| `lelib-core` | skill `/ticket`, skill `hello-lelib`, agent `relecteur`, commande `/resume-session`, hook de journalisation des éditions (`~/.claude/lelib-edits.log`), serveur MCP `lelib-tools` (`ping`, `date_fr`) |
| `lelib-equipe` | skills `/dev` et `/auto-test`, agents `po`, `dev-front`, `dev-back`, `qa`, `techlead-front`, `techlead-back`, `dba`, serveur MCP `playwright` (tests dans le navigateur, pour le `qa`) |
| `lelib-tdd` | TDD vérifiable : skill `/tdd`, journal des tests rouge / vert (`tdd-run.js`), hook qui avertit quand du code de production est modifié sans test rouge, contrôle critères d'acceptation → tests (`check-criteres.js`) |
| `lelib-angular` | skills `angular-setup` et `angular-ui`, vérification de compatibilité Angular / Node à l'ouverture de session |
| `lelib-conception` | étape Conception du cycle de dev : skills `/api-contract` (OpenAPI), `/db-migration` (Liquibase), `/db-export` et `/adr`, script de contrôle des migrations |

### TDD vérifiable (lelib-tdd)

Les agents `dev-back` et `dev-front` travaillent en TDD (rouge, vert, refactor). Ce plugin rend ce travail **visible** au lieu de le croire sur parole :

| Élément | Rôle |
|---|---|
| `tdd-run.js -- <commande de test>` | lance les tests et enregistre le résultat dans `.lelib/tdd/journal.jsonl` (à la racine du projet, ignoré par git) : rouge ou vert, tests en échec, cause du rouge (`assertion` = vrai rouge, `compilation` = classe absente, `inconnue` = commande en erreur, pas un rouge valide). Le code de sortie est celui des tests. |
| `tdd-run.js --refactor` / `--bilan` / `--reset` | phase de refactor (refusée si les tests ne sont pas verts) ; résumé des cycles et alertes ; remise à zéro |
| hook `PreToolUse` (`tdd-garde.js`) | avant de modifier du code de production (`src/main/java/**`, `src/app/**`), vérifie qu'un test rouge valide est enregistré (ou une phase refactor). **Il avertit** l'agent, il ne bloque pas. Tests, configuration et code généré passent toujours. |
| `check-criteres.js [ticket]` | chaque critère d'acceptation `CA-n` du ticket doit être cité par un test (`[bet-003 CA-2] refuse un mot de passe vide`) ; code de sortie 1 s'il en manque |
| skill `/tdd [ticket]` | la méthode complète : liste de tests dans le ticket, un cycle par test, bilan tiré du journal |

- **Réglages** (variables d'environnement) : `LELIB_TDD=bloquer` refuse la modification au lieu d'avertir, `LELIB_TDD=off` désactive le hook, `LELIB_TDD_IGNORER=<motif>;<motif>` exclut des fichiers (expressions régulières), `LELIB_TDD_VALIDITE_H=8` règle la durée de validité du journal.
- Le PO et `/ticket` numérotent désormais les critères (`CA-1 : …`). `/dev` vérifie le bilan et `check-criteres.js` avant de clôturer un ticket, et les tech leads refusent une PR dont un critère n'a pas de test.
- **Limite** : le journal rend le TDD visible et contrôlable, il ne le garantit pas : un agent peut l'ignorer. Le hook avertit plutôt que de bloquer le temps de mesurer les faux positifs.
- Tests du plugin : `node --test plugins/lelib-tdd/tests/*.test.js`.

### Conception (lelib-conception)

**Standard de la marketplace : Liquibase est l'unique outil de schéma.** Pas de Flyway, et `spring.jpa.hibernate.ddl-auto` reste à `validate`. Les agents `dev-back`, `dba` et `techlead-back` appliquent cette règle (un changement de schéma sans changeset, ou une migration appliquée modifiée, bloque la pull request). À l'ouverture d'une session dans un projet Java, un hook de `lelib-conception` le vérifie sans réseau et n'affiche rien si tout va bien ; il avertit en cas de Flyway, de `ddl-auto=update` / `create` / `create-drop`, ou de projet JPA sans Liquibase. Il se lance aussi à la main : `node plugins/lelib-conception/scripts/check-db-tool.js [dossier]`.

Quatre skills pour l'étape Conception. Elles s'appuient sur les agents de `lelib-equipe` (`dba`, tech leads) quand il est installé, et appliquent sinon elles-mêmes les mêmes règles.

#### /api-contract

```
/api-contract 3                       # le besoin d'API du ticket 3
/api-contract lister les compteurs    # ou une description
```

Contract-first : le contrat OpenAPI 3.0 est écrit ou mis à jour **avant** le code, vérifié avec Redocly, puis :
- **back** : le plugin Maven `openapi-generator` (7.27.0, générateur `spring`, options `useSpringBoot4` et `interfaceOnly`) génère une interface par tag et les DTO ; le controller **implémente** l'interface ;
- **front** : `ng-openapi-gen` (1.1.0) génère les modèles et un service `Api` pour Angular.

La skill compile les deux côtés pour prouver qu'ils sont alignés, et liste les **ruptures de compatibilité** du contrat. Règles du contrat : chemins en minuscules avec tirets au pluriel, `camelCase` pour les propriétés, `UPPER_SNAKE_CASE` pour les `enum`, erreurs en `application/problem+json` (schéma `ErreurResponse`, jamais `ProblemDetail`, qui entre en collision avec Spring). Si le back et le front sont dans deux dépôts git, le contrat vit dans le dépôt du back.

#### /db-migration

```
/db-migration 4                                  # le changement de schéma du ticket 4
/db-migration ajouter un statut aux compteurs
```

Migrations **Liquibase** en SQL formaté, écrites avec l'agent `dba` :
- un fichier = un changeset = un changement, nommé `AAAAMMJJHHMM-verbe-objet.sql`, dans `src/main/resources/db/changelog/changes/` ;
- `--rollback` obligatoire, et **jamais de modification d'une migration déjà appliquée** (on en écrit une nouvelle) ;
- index en `CONCURRENTLY` dans leur propre changeset, contraintes ajoutées en `NOT VALID` puis validées, schéma et données séparés.

Le script `scripts/check-migrations.js` contrôle ces règles par rapport à la branche de base (`origin/main`, sinon `main`) : migration existante modifiée, renommée ou supprimée, nom invalide, rollback absent, horodatage trop ancien… Il se lance aussi à la main : `node plugins/lelib-conception/scripts/check-migrations.js [dossier] [--base <réf>] [--json]`.
Projet sans Liquibase : la skill propose `spring-boot-starter-liquibase` et le passage de `ddl-auto` à `validate`, et **demande avant de modifier la configuration**. Liquibase 5.x est sous licence FSL-1.1-ALv2 (et non plus Apache 2).

#### /db-export

```
/db-export             # schéma et données
/db-export schema      # schéma seulement
/db-export donnees     # données seulement
```

Exporte la base PostgreSQL du projet dans `db/database/export-AAAAMMJJ-HHMM/` à la racine du projet :
- `schema.sql`, `donnees.sql` (la table `databasechangelog` de Liquibase est incluse) et un `LISEZMOI.md` (date, base, méthode, taille et SHA-256 de chaque fichier, lignes par table, commandes de restauration) ;
- la connexion est lue dans `spring.datasource.*` ou dans le service PostgreSQL du `docker-compose.yml` ; l'export passe par le `pg_dump` du conteneur Docker si la base y tourne, sinon par un `pg_dump` local (`LELIB_PG_DUMP` indique son chemin s'il n'est pas dans le `PATH`) ;
- une base H2 n'est pas prise en charge, et une **base distante est refusée** tant que l'utilisateur n'a pas donné son accord explicite ;
- chaque fichier est vérifié, et si l'export échoue ou est incomplet, le dossier est supprimé : on ne garde jamais un export à moitié fait ;
- le mot de passe n'est jamais affiché ni écrit.

Ces fichiers contiennent les **données réelles** : ajoute `db/database/` au `.gitignore` du projet. Le script se lance aussi à la main : `node plugins/lelib-conception/scripts/db-export.js [dossier] [--schema | --donnees] [--dry-run]`.

#### /adr

```
/adr utiliser Liquibase pour les migrations
```

Écrit un ADR (Architecture Decision Record) en français dans `docs/adr/NNNN-titre.md` : contexte, critères, options avec avantages et inconvénients, décision, conséquences, références. Numérotation automatique, index `docs/adr/README.md` tenu à jour, statuts Proposé, Accepté, Rejeté, Déprécié, Remplacé par ADR-NNNN. La skill n'invente jamais une décision : elle pose la question s'il manque la décision ou les options. Un ADR accepté n'est jamais réécrit, un nouvel ADR le remplace.

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

#### Règles de code de l'équipe

Ces règles sont écrites dans les agents : elles s'appliquent au code qu'ils écrivent ou modifient (sans refactorer le reste du projet), et les tech leads les contrôlent à la revue des pull requests.

| Agent | Règles |
|---|---|
| `dev-back` | SOLID, règles d'or (KISS, YAGNI, DRY, méthodes courtes, pas de valeurs magiques, pas de `null` retourné, exceptions précises), nommage Java (`PascalCase`, `camelCase`, `UPPER_SNAKE_CASE`), **TDD** (rouge, vert, refactor), transactions sur la couche service, packages groupés par couche (`controller`, `service`, `repository`, `model`, `dto`, `enums`, `mapper`, `exception`, `config`), schéma uniquement via Liquibase (`ddl-auto=validate`) |
| `dev-front` | SOLID, règles d'or, **TDD**, nommage TypeScript (`camelCase`, `PascalCase`, fichiers en `kebab-case`, `$` pour les flux), typage strict sans `any`, **responsive web et mobile** (mobile d'abord, grille Bootstrap, cibles tactiles) |
| `dba` | **ACID** : migrations Liquibase transactionnelles (atomicité), contraintes en base (cohérence), niveau d'isolation et verrouillage choisis (isolation), sauvegarde avant toute opération destructive (durabilité) ; nommage SQL en `snake_case` |

- **Gravité en revue** : une violation SOLID ou ACID qui peut produire un bug ou une perte de données bloque la pull request. Un simple écart de nommage est une suggestion, sauf pour un nom de table, de colonne ou d'API déjà exposé.
- **Adapter les règles** : elles sont dans les fichiers `agents/dev-back.md`, `agents/dev-front.md` et `agents/dba.md`, sous les titres « Règles de l'équipe » et « ACID ». Si un projet suit déjà une autre convention, l'agent la suit et signale l'écart.
- **Limite** : ce sont des consignes aux agents, pas un contrôle automatique. Pour un contrôle qui bloque réellement, ajoute Checkstyle ou ArchUnit côté Java, ESLint côté Angular, et fais-les tourner en CI.

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
- **Premier démarrage** : le serveur est téléchargé avec `npx`, ce qui demande un accès à npm (quelques secondes). Ensuite il démarre depuis le cache, sans réseau, avec `--prefer-offline` : sans cela, chaque démarrage interrogeait le registre npm et dépassait le délai de connexion de 30 s de Claude Code dès que le proxy était injoignable.
- **Serveur « failed to connect »** : vérifie d'abord que le premier démarrage a pu télécharger le paquet (réseau ou proxy joignable), puis rouvre la session.

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

### /auto-test

Lance les tests automatisés, puis produit un rapport PDF :

```
/auto-test 3     # les critères d'acceptation du ticket 3
/auto-test       # toute l'application
```

- **Ticket** : le `qa` vérifie les critères d'acceptation du ticket dans un vrai navigateur, lance les tests concernés et complète les tests e2e manquants.
- **Toute l'application** : suites de tests du back et du front, tests e2e existants, un passage sur chaque écran principal (page chargée, console sans erreur, aucune réponse 5xx), et les critères des tickets de `tickets/done/`.
- **Rapport** : verdict (réussi, échec, partiel), compteurs, résultat par critère, anomalies avec étapes, attendu, obtenu et capture d'écran, commandes exécutées, limites. Il est produit même si des tests échouent.
- **Nom du PDF** : `<ticket>-<AAAAMMJJ-HHMM>.pdf`, par exemple `bet-003-20261102-1015.pdf`. Sans ticket : `application-20261102-1015.pdf`.
- **Remise** : le PDF est enregistré dans `rapport/auto-test/` à la racine du projet, puis envoyé avec le téléchargement quand l'application le permet (application de bureau Claude), ou ouvert avec le lecteur PDF du poste. Pense à ajouter `rapport/auto-test/` au `.gitignore` du projet.
- Le PDF est fabriqué avec le Chromium de Playwright (script `scripts/html-to-pdf.js`), sans dépendance supplémentaire.

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
/plugin install lelib-conception@lelib
/plugin install lelib-tdd@lelib
```

`lelib-core`, `lelib-equipe`, `lelib-angular`, `lelib-conception` et `lelib-tdd` s'installent indépendamment : n'installe que ceux dont tu as besoin.

Ou, sans commande, dans `~/.claude/settings.json` (tous les projets) ou `.claude/settings.json` (un projet) :

```json
{
  "extraKnownMarketplaces": {
    "lelib": { "source": { "source": "github", "repo": "trak05/lelib" } }
  },
  "enabledPlugins": {
    "lelib-core@lelib": true,
    "lelib-equipe@lelib": true,
    "lelib-angular@lelib": true,
    "lelib-conception@lelib": true,
    "lelib-tdd@lelib": true
  }
}
```

Pour récupérer une nouvelle version après un `git push` : `/plugin marketplace update lelib`.

## Ajouter un plugin

1. Créer `plugins/<nom>/.claude-plugin/plugin.json`.
2. L'ajouter dans `.claude-plugin/marketplace.json`.
3. L'activer dans `.claude/settings.json` → `enabledPlugins`.
