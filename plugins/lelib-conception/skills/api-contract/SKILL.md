---
name: api-contract
description: "Rédige ou met à jour le contrat d'API OpenAPI avant de coder (contract-first), puis génère les interfaces et DTO Java et les services et modèles Angular pour que le front et le back restent alignés. Utilisé via /api-contract <ticket ou description du besoin>."
argument-hint: "<numéro de ticket ou description du besoin d'API>"
disable-model-invocation: true
---

# Contrat d'API (contract-first)

Entrée : `$ARGUMENTS`

Le contrat OpenAPI est écrit **avant** le code. Le back et le front en sont générés : personne ne recopie à la main un type de l'autre côté.

## 1. Comprendre le besoin

- Un numéro (`3`, `003`, `bet-003`) : lis le ticket dans `tickets/` ou `tickets/done/`, avec ses critères d'acceptation et son cadrage technique. Sinon, l'entrée est la description du besoin.
- Si le besoin ne dit pas ce qu'il faut pour écrire le contrat (ressources, champs obligatoires, erreurs possibles), pose la question. N'invente aucune règle métier.

## 2. Trouver ou créer le contrat

- **Un seul contrat** par projet. Cherche `openapi.yaml` / `openapi.yml` (hors `node_modules` et `target`).
- Sinon, crée `api/openapi.yaml` à la racine du projet (le dossier qui contient `tickets/`).
- **Dépôts git séparés** pour le back et le front (`backend/.git` et `frontend/.git`) : un chemin vers l'autre dépôt casserait leur build. Mets le contrat dans le dépôt du back (`src/main/resources/openapi/openapi.yaml`) et demande à l'utilisateur, une seule fois, comment le front le récupère (copie versionnée dans `frontend/api/openapi.yaml`, ou adresse du fichier dans le dépôt du back). Note la réponse dans le `CLAUDE.md` du projet.
- OpenAPI **3.0.x** (le mieux pris en charge par les générateurs). Ajoute `servers: [{ url: / }]`.

## 3. Écrire le contrat

Règles, alignées sur les règles d'équipe :
- **Chemins** en minuscules avec tirets, au pluriel : `/api/compteurs-gaz`, `/api/compteurs-gaz/{id}`.
- **Propriétés** et paramètres en `camelCase`. Chaque opération a un `operationId` en `camelCase` qui commence par un verbe (`listerCompteursGaz`, `creerCompteurGaz`) et un `tags` : un tag par ressource, en kebab-case (`compteurs-gaz`). Le tag donne le nom de l'interface Java : `CompteursGazApi`.
- **Schémas** en `PascalCase` avec un suffixe de rôle : `CreerCompteurGazRequest`, `CompteurGazResponse`. **N'appelle jamais un schéma `ProblemDetail`** : ce nom entre en collision avec `org.springframework.http.ProblemDetail`. Pour les erreurs, utilise `ErreurResponse` (champs `type`, `title`, `status`, `detail`), servie en `application/problem+json`.
- **Valeurs d'`enum`** en `UPPER_SNAKE_CASE`. Les `enum` partagés sont des schémas nommés, pas écrits en ligne.
- **`required`** explicite partout, avec `minLength`, `maxLength`, `minimum`, `maximum`, `format` : ils deviennent les validations du back.
- **Pagination** des listes : paramètres `page` (à partir de 0), `size` (maximum 100) et `sort`, et une réponse avec `contenu`, `page`, `taille`, `totalElements`.
- Réponses d'erreur (400, 404, 409…) décrites, avec un exemple pour les cas non évidents.
- **Compatibilité** : ne supprime ni ne renomme jamais un champ, un chemin ou une valeur d'`enum` déjà publié, et ne rends pas obligatoire un champ qui ne l'était pas, sans le signaler comme **rupture** et obtenir l'accord de l'utilisateur. Compare avec la version de la branche de base (`git diff origin/main -- <contrat>`) et liste les ruptures dans le bilan (aucun outil npm fiable pour cela : l'`oasdiff` de npm n'est pas le bon).

## 4. Valider le contrat

Avec `redocly.yaml` à côté du contrat (crée-le s'il manque) :

```yaml
extends:
  - recommended
rules:
  info-license: off
  no-empty-servers: off
  security-defined: warn
```

```bash
npx --yes @redocly/cli@2.72.1 lint <contrat> --config <redocly.yaml>
```

Corrige toutes les erreurs. Un avertissement ne bloque pas, mais explique-le. Une API sans authentification doit être signalée, pas masquée.

## 5. Générer le back (Java, Spring Boot)

Dans le `pom.xml` du back, vérifie la présence du plugin ; sinon ajoute-le (version vérifiée : 7.27.0) et dis-le dans le bilan :

```xml
<plugin>
  <groupId>org.openapitools</groupId>
  <artifactId>openapi-generator-maven-plugin</artifactId>
  <version>7.27.0</version>
  <executions>
    <execution>
      <goals><goal>generate</goal></goals>
      <configuration>
        <inputSpec>${project.basedir}/src/main/resources/openapi/openapi.yaml</inputSpec>
        <generatorName>spring</generatorName>
        <apiPackage>${project.groupId}.controller.api</apiPackage>
        <modelPackage>${project.groupId}.dto</modelPackage>
        <generateSupportingFiles>false</generateSupportingFiles>
        <configOptions>
          <useSpringBoot4>true</useSpringBoot4>
          <interfaceOnly>true</interfaceOnly>
          <useTags>true</useTags>
          <useBeanValidation>true</useBeanValidation>
          <skipDefaultInterface>true</skipDefaultInterface>
          <openApiNullable>false</openApiNullable>
          <documentationProvider>none</documentationProvider>
          <annotationLibrary>none</annotationLibrary>
          <dateLibrary>java8</dateLibrary>
        </configOptions>
      </configuration>
    </execution>
  </executions>
</plugin>
```

Adapte `inputSpec` à l'emplacement réel du contrat et garde `useSpringBoot4` pour Spring Boot 4 (`useSpringBoot3` pour la version 3). Lance `./mvnw -q compile` (`mvnw.cmd` sous Windows) : le code est généré dans `target/generated-sources/openapi`, qui n'est pas versionné.

- Résultat : une **interface par tag** (`CompteursGazApi`, avec ses `@RequestMapping` et ses validations `jakarta`) et les DTO dans `…dto` (interfaces dans `…controller.api`).
- Le controller **implémente l'interface** (`CompteursGazController implements CompteursGazApi`) et porte la logique de présentation seulement ; le travail revient au service, comme d'habitude.
- Les DTO générés sont des classes, pas des `record` : ils sont exemptés des règles de style, et **ne sont jamais modifiés à la main**. Le `dev-back` les convertit vers le domaine.
- Derrière un proxy d'entreprise qui réécrit HTTPS, Maven peut échouer avec `PKIX path building failed` : relance avec `MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`.

## 6. Générer le front (Angular)

Avec `ng-openapi-gen` (version vérifiée : 1.1.0, Angular 16 et plus, sans Java). Ajoute-le en dépendance de développement et un script au `package.json` s'ils manquent, et dis-le dans le bilan :

```json
"scripts": { "api:generate": "ng-openapi-gen --input <chemin du contrat> --output src/app/api" }
```

Lance `npm run api:generate`. Résultat dans `src/app/api` :
- `models/` : des `interface` et des types union (`'ACTIF' | 'INACTIF'`), pas d'`enum` TypeScript ;
- `fn/<tag>/` : une fonction par opération (`listerCompteursGaz`) ;
- `Api` : un service qui les appelle, par exemple `inject(Api).invoke(listerCompteursGaz, { page: 0, size: 20 })` (retourne une `Promise`). Les fonctions seules retournent des `Observable`.

À la configuration de l'application : `provideHttpClient()` et `provideApiConfiguration('/')` (ou l'URL de l'API). Le dossier généré n'est pas modifié à la main. Il peut être versionné ou régénéré au build : suis ce que fait déjà le projet, sinon régénère-le au build.

## 7. Vérifier l'alignement

- `./mvnw -q compile` (back) et `npm run build` (front) passent tous les deux. Si l'un échoue, c'est que le contrat et le code existant divergent : corrige le code consommateur, pas le code généré.
- Ne dis pas que c'est aligné sans avoir lancé les deux compilations. Si une commande n'a pas pu tourner, dis laquelle et pourquoi.

## 8. Bilan

Réponds en quelques lignes : les endpoints ajoutés ou modifiés, les **ruptures de compatibilité** éventuelles, les fichiers de configuration ajoutés, et ce qu'il reste à faire pour le `dev-back` (implémenter l'interface) et le `dev-front` (utiliser `Api`). Ne fais ni commit ni push.
