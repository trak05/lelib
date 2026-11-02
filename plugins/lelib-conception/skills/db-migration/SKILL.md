---
name: db-migration
description: "Écrit une migration de base de données avec Liquibase (SQL formaté, un changeset par changement, rollback obligatoire, jamais de modification d'une migration déjà appliquée) et la contrôle. Utilisé via /db-migration <ticket ou description du changement>."
argument-hint: "<numéro de ticket ou description du changement de schéma>"
disable-model-invocation: true
---

# Migration de base de données (Liquibase)

Entrée : `$ARGUMENTS`

## 1. Comprendre le changement

- Un numéro (`3`, `003`, `bet-003`) : lis le ticket dans `tickets/` ou `tickets/done/` et son cadrage technique. Sinon, l'entrée est la description du changement.
- Lis les entités JPA concernées et les migrations existantes. Si le besoin est ambigu (nullabilité, valeur par défaut, volume de la table), pose la question.

## 2. Vérifier l'outillage

Dans le `pom.xml` du back :
- **Liquibase présent** (`liquibase-core` ou `spring-boot-starter-liquibase`) : continue.
- **Flyway présent** : arrête-toi et signale-le. L'équipe utilise Liquibase : ne mélange pas les deux outils sans l'accord de l'utilisateur.
- **Aucun des deux** (base pilotée par `spring.jpa.hibernate.ddl-auto`) : propose la mise en place et **demande l'accord avant de modifier la configuration** :
  1. dépendance `org.springframework.boot:spring-boot-starter-liquibase` (la version est gérée par Spring Boot : 5.0.4 avec Spring Boot 4.1) ;
  2. fichier maître `src/main/resources/db/changelog/db.changelog-master.yaml` (c'est l'emplacement par défaut de Spring Boot) :

```yaml
databaseChangeLog:
  - includeAll:
      path: changes/
      relativeToChangelogFile: true
```

  3. `spring.jpa.hibernate.ddl-auto=validate` : Hibernate vérifie le schéma au lieu de le modifier ;
  4. base déjà en service : la première migration reproduit le schéma actuel, puis on marque cet état comme appliqué (`changelogSync`) au lieu de le rejouer.
- À signaler une fois : Liquibase 5.x est publié sous licence **FSL-1.1-ALv2** (et non plus Apache 2, comme la 4.x). Aucun souci pour un usage interne, mais l'utilisateur doit le savoir.

## 3. Écrire la migration

Délègue au `lelib-equipe:dba` avec l'outil Agent, en lui donnant le ticket et les règles de cette section. Si cet agent n'est pas disponible, applique toi-même les règles ACID et de nommage du `dba`.

**Un fichier = un changeset = un changement.** Dossier `src/main/resources/db/changelog/changes/`, nom `AAAAMMJJHHMM-verbe-objet.sql` (minuscules, tirets), par exemple `202611021015-create-table-compteurs-gaz.sql`. L'horodatage est celui de maintenant : une migration s'applique dans l'ordre des noms, la nouvelle doit être la plus récente.

```sql
--liquibase formatted sql
--changeset auteur:202611021015-create-table-compteurs-gaz
CREATE TABLE compteurs_gaz (
    id bigint GENERATED ALWAYS AS IDENTITY,
    numero varchar(20) NOT NULL,
    CONSTRAINT pk_compteurs_gaz PRIMARY KEY (id),
    CONSTRAINT uq_compteurs_gaz_numero UNIQUE (numero)
);
--rollback DROP TABLE compteurs_gaz;
```

- La ligne `--changeset` donne `auteur:id` : l'auteur est l'identifiant git de la personne (`git config user.name`, sans espace), et **l'id est le nom du fichier sans `.sql`**.
- **`--rollback` est obligatoire** et défait exactement ce que fait le changeset (`DROP TABLE`, `DROP COLUMN`, `DROP INDEX`…). Un changement vraiment irréversible (suppression de données) l'indique par une ligne `-- sans-rollback: <raison>` : Liquibase refusera alors de le défaire, ce qui est voulu.
- **Jamais modifier une migration déjà appliquée** : son checksum change et l'application ne démarre plus. Une correction est une nouvelle migration.
- **Schéma et données séparés** : un changeset ne mélange pas `CREATE` / `ALTER` et `INSERT` / `UPDATE`.
- **Index** : `CREATE INDEX CONCURRENTLY` dans un changeset à lui seul, avec `runInTransaction:false` sur la ligne `--changeset` (sinon PostgreSQL refuse). Un index sur chaque clé étrangère.
- **Contrainte sur une table déjà remplie** : `ADD CONSTRAINT … NOT VALID` dans un changeset, puis `VALIDATE CONSTRAINT` dans un second, pour limiter les verrous.
- **Changement de colonne en plusieurs temps** : ajouter (nullable), remplir, puis contraindre (`NOT NULL`), dans des migrations et si possible des livraisons séparées. Un renommage ou une suppression de colonne se prépare en deux livraisons : l'ancienne version de l'application doit continuer à fonctionner pendant le déploiement.
- **Noms** selon les règles du `dba` : `pk_`, `fk_`, `uq_`, `ck_`, `idx_`, tables et colonnes en `snake_case`.
- `runOnChange:true` seulement pour un objet qu'on peut rejouer sans risque (vue, fonction), jamais pour une table.

## 4. Contrôler

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-migrations.js"
```

(Si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell, retrouve `scripts/check-migrations.js` avec Glob.)

Le script compare les migrations à la branche de base (`origin/main`, sinon `main`) et signale en erreur : une migration existante modifiée, renommée ou supprimée, un nom non conforme, plusieurs changesets dans un fichier, un rollback absent, un horodatage trop ancien, un id qui n'est pas le nom du fichier, `CONCURRENTLY` sans `runInTransaction:false`. En avertissement : `CREATE INDEX` sans `CONCURRENTLY`, `DROP`, `TRUNCATE`, `DELETE` sans `WHERE`. Corrige toutes les erreurs ; explique chaque avertissement. Options : `--base <réf>`, `--dir <dossier>`, `--json`.

## 5. Tester

- **Appliquer** : démarre les tests d'intégration sur une vraie base PostgreSQL (Testcontainers) : Liquibase applique tout le changelog, et `ddl-auto=validate` prouve que les entités JPA correspondent au schéma. Lance `./mvnw test` (ou `mvnw.cmd test`).
- **Défaire** : joue l'aller-retour update → rollback du dernier changeset → update sur une base jetable (par exemple `liquibase rollback-count 1` avec la CLI Liquibase ; vérifie la syntaxe dans la documentation de la version installée).
- Si l'un de ces tests n'a pas pu tourner (Docker absent, pas de CLI), **dis-le** : n'écris jamais que le rollback fonctionne sans l'avoir exécuté.

## 6. Bilan

Réponds en quelques lignes : le fichier créé, ce qu'il fait, comment chaque propriété ACID est assurée (d'après le `dba`), le résultat du script de contrôle, et ce qui a été testé ou non. Signale les verrous qu'il peut prendre sur une grosse table. Ne fais ni commit ni push.
