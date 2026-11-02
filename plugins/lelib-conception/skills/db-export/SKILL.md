---
name: db-export
description: "Exporte la base de données PostgreSQL du projet (schéma et données) dans db/database/export-<date-heure>/ à la racine du projet, avec un LISEZMOI qui résume le contenu et explique la restauration. Utilisé via /db-export [schema | donnees]."
argument-hint: "[schema | donnees] (sans argument : schéma et données)"
disable-model-invocation: true
---

# Export de la base de données

Entrée : `$ARGUMENTS`

L'export est fait par le script `db-export.js` du plugin, qui s'appuie sur `pg_dump`. Il produit `db/database/export-AAAAMMJJ-HHMM/` à la racine du projet (racine git si elle existe, sinon le dossier courant), par exemple `db/database/export-20261102-1015/` :

- `schema.sql` : les tables, contraintes et index ;
- `donnees.sql` : les données (la table `databasechangelog` de Liquibase est incluse, pour qu'une restauration garde l'historique des migrations) ;
- `LISEZMOI.md` : date, base, méthode, taille et empreinte SHA-256 de chaque fichier, nombre de lignes par table, et commandes de restauration.

## 1. Choisir ce qu'on exporte

- Pas d'argument : schéma **et** données.
- `schema` : option `--schema`. `donnees` : option `--donnees`.

## 2. Vérifier avant d'exporter

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/db-export.js" --dry-run
```

(Si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell, retrouve `scripts/db-export.js` avec Glob.)

La simulation n'écrit rien. Elle lit la configuration (`spring.datasource.*` dans `src/main/resources`, sinon le service PostgreSQL du `docker-compose.yml`), choisit la méthode (le `pg_dump` du conteneur Docker si la base y tourne, sinon un `pg_dump` local) et affiche la base, l'hôte et le dossier de sortie. Annonce-les en une ligne. Ensuite, selon la réponse :

- **Base H2 ou autre que PostgreSQL** : explique que l'export n'est pas pris en charge (une base H2 en mémoire disparaît à l'arrêt de l'application). Un profil précis se choisit avec `--profil <nom>`. Arrête-toi.
- **Hôte distant** (le script répond `accordRequis`) : exporter une base distante copie des **données réelles**. Demande l'accord explicite de l'utilisateur en citant l'hôte et la base. Ne relance avec `--autoriser-hote-distant` qu'après un « oui » clair, jamais de ta propre initiative.
- **Outils absents** (ni Docker ni `pg_dump`) : relaie le message du script et propose l'installation (par exemple `winget install PostgreSQL.PostgreSQL.17`, ou Docker Desktop), sans rien installer sans l'accord de l'utilisateur. `LELIB_PG_DUMP` désigne un `pg_dump` installé hors du `PATH`.
- **Service Docker arrêté** : propose `docker compose up -d` et attends l'accord avant de démarrer un conteneur.

## 3. Exporter

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/db-export.js" [--schema | --donnees]
```

Le script vérifie chaque fichier (non vide, ligne de fin de `pg_dump` présente, au moins un `CREATE TABLE` dans le schéma). **Si l'export échoue ou est incomplet, il supprime le dossier qu'il vient de créer** : il ne laisse jamais un export à moitié fait qui ressemblerait à un bon. Montre l'erreur telle quelle (le mot de passe y est masqué).

## 4. Contrôler et rendre compte

- Lis `LISEZMOI.md` et vérifie que les chiffres sont plausibles : nombre de tables, lignes des tables principales, et si le projet utilise Liquibase, un nombre de changesets cohérent avec les fichiers de `db/changelog/changes/`.
- Réponds en quelques lignes : le chemin du dossier, les fichiers avec leur taille, le nombre de tables et de lignes, et la méthode utilisée.
- **Rappelle que ces fichiers contiennent les données réelles de la base.** Si `db/database/` n'est pas dans le `.gitignore` du projet (le script le signale), dis-le sans le modifier toi-même.

## Règles

- Ne jamais afficher, écrire ni commiter un mot de passe ou une chaîne de connexion complète.
- Ne jamais exporter une base distante sans l'accord explicite de l'utilisateur, ni réécrire ou supprimer un export précédent : chaque exécution crée son propre dossier.
- Ne fais ni commit ni push, et n'envoie ces fichiers nulle part.
- Ne dis pas que l'export a réussi sans avoir lu le résultat du script. S'il n'a pas pu tourner, dis pourquoi.
