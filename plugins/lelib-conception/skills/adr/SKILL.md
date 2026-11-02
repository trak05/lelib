---
name: adr
description: "Documente une décision d'architecture dans un ADR (Architecture Decision Record) au format commun, numéroté, dans docs/adr/, avec un index à jour. Utilisé via /adr <titre ou contexte de la décision>."
argument-hint: "<titre ou contexte de la décision>"
disable-model-invocation: true
---

# ADR : décision d'architecture

Entrée : `$ARGUMENTS`

Un ADR garde la trace d'**un** choix technique : pourquoi on l'a fait, ce qu'on a écarté, ce que ça coûte. Il se lit dans deux ans par quelqu'un qui n'était pas là.

## 1. Rassembler la matière

Les éléments viennent de l'entrée, de la conversation en cours, du ticket cité (`tickets/`) et du code concerné (lis-le pour décrire le contexte avec des faits).

**Ne jamais inventer** ni la décision, ni les options écartées, ni les raisons. S'il manque :
- la décision prise (ou à prendre) ;
- au moins deux options réellement envisagées, dont celle retenue ;
- les raisons du choix ;

pose la question à l'utilisateur avant d'écrire. Une demande qui contient plusieurs décisions donne plusieurs ADR : un ADR = une décision.

## 2. Numéroter et nommer

- Dossier `docs/adr/` à la racine du projet (crée-le s'il manque).
- Numéro sur 4 chiffres : le plus grand numéro des fichiers `docs/adr/NNNN-*.md` existants, plus 1 (`0001` pour le premier). Ne réutilise jamais un numéro.
- Fichier : `NNNN-titre-en-kebab-case.md`, un titre court au présent qui nomme la décision (`0007-utiliser-liquibase-pour-les-migrations.md`).

## 3. Écrire l'ADR

```markdown
# ADR-NNNN : <titre de la décision>

- **Statut** : Proposé
- **Date** : <AAAA-MM-JJ du jour>
- **Décideurs** : <noms ou rôles>
- **Tickets liés** : <identifiants, ou « aucun »>

## Contexte et problème
<La situation, la contrainte ou le besoin qui force à choisir. Faits vérifiables, pas d'opinion.>

## Critères de décision
- <ce qui compte pour trancher : coût, performance, maintenabilité, compétences de l'équipe…>

## Options envisagées
### Option 1 : <nom>
- Avantages : …
- Inconvénients : …

### Option 2 : <nom>
- Avantages : …
- Inconvénients : …

## Décision
Nous retenons **<option>**, parce que <raisons, en lien avec les critères>.

## Conséquences
- Positives : …
- Négatives ou coûts : …
- Risques et points de vigilance : …

## Références
- <ticket, ADR lié (ADR-NNNN), documentation, lien>
```

Statut à la création : `Proposé`, ou `Accepté` si l'utilisateur dit que la décision est prise. Les statuts possibles sont **Proposé**, **Accepté**, **Rejeté**, **Déprécié** et **Remplacé par ADR-NNNN**.

## 4. Mettre à jour l'index

Fichier `docs/adr/README.md` (crée-le s'il manque) : une ligne par ADR, du plus ancien au plus récent.

```markdown
# Décisions d'architecture

| N° | Titre | Statut | Date |
|---|---|---|---|
| [0001](0001-titre.md) | Titre de la décision | Accepté | 2026-11-02 |
```

## 5. Règles

- **Un ADR accepté n'est jamais réécrit.** Si la décision change, écris un nouvel ADR qui explique pourquoi et référence l'ancien ; dans l'ancien, **seul le statut** devient `Remplacé par ADR-NNNN` (et la ligne de l'index avec lui).
- Un ADR au statut `Proposé` peut être corrigé tant qu'il n'est pas accepté.
- Une décision purement locale à une fonction, sans conséquence durable, n'a pas besoin d'un ADR : dis-le plutôt que d'en produire un.
- Aucun commit ni push.

## 6. Bilan

Réponds en deux ou trois lignes : le chemin de l'ADR créé, son statut, et les points à confirmer par l'utilisateur.
