---
name: ticket
description: Crée un ticket brouillon en Markdown dans le dossier tickets/ du projet, à partir d'un fichier de spec ou d'une description du besoin. Utilisé via /ticket <fichier.md> ou /ticket <description>.
argument-hint: <fichier.md> | <description du besoin>
disable-model-invocation: true
---

# Créer un ticket brouillon

Entrée : `$ARGUMENTS`

## 1. Lire le besoin

- Si l'entrée est vide : demande à l'utilisateur de décrire le besoin ou de donner un fichier, puis arrête-toi.
- Si l'entrée est un seul chemin qui se termine par `.md` et que ce fichier existe : lis-le, c'est la spec. Note son chemin comme source.
- Si elle se termine par `.md` mais que le fichier n'existe pas : signale-le et arrête-toi, sans créer de ticket.
- Sinon : l'entrée entière est la description du besoin.

## 2. Calculer l'identifiant

1. **Racine du projet** : la racine git (`git rev-parse --show-toplevel`) si elle existe, sinon le répertoire courant.
2. **Préfixe** : les 3 premiers caractères alphanumériques du nom du dossier racine, en minuscules.
   Exemples : `opamt` → `opa`, `beta` → `bet`, `Mon-Projet` → `mon`.
3. **Numéro** : liste les fichiers `tickets/<préfixe>-<nombre>*.md` **et** `tickets/done/<préfixe>-<nombre>*.md` à la racine du projet (les tickets terminés sont rangés dans `done/`, leurs numéros restent pris). Prends le plus grand nombre trouvé et ajoute 1.
   S'il n'y en a aucun, commence à 1. Ne réutilise jamais un numéro, même s'il y a des trous.
4. **Identifiant** : `<préfixe>-<numéro sur 3 chiffres>`, par exemple `opa-001`, `opa-012`.

Crée le dossier `tickets/` à la racine du projet s'il n'existe pas.

## 3. Rédiger le ticket

Écris `tickets/<identifiant>.md` avec le modèle ci-dessous, en français.

Règles de rédaction :
- N'invente rien. Tout ce qui manque ou reste ambigu va dans « Questions ouvertes ».
- Les critères d'acceptation doivent être vérifiables (Étant donné / Quand / Alors quand c'est utile).
- Si le projet contient du code, tu peux parcourir rapidement sa structure pour remplir « Pistes techniques » (modules ou fichiers probablement concernés). Reste bref et marque ces pistes comme des hypothèses.

```markdown
---
id: <identifiant>
titre: <titre court et explicite>
statut: brouillon
type: <fonctionnalité | anomalie | technique>
cree_le: <date du jour AAAA-MM-JJ>
source: <chemin du fichier de spec, ou « description »>
---

# <identifiant> — <titre>

## Contexte
<Pourquoi ce besoin existe, pour qui.>

## Besoin
<Ce qui est attendu, du point de vue de l'utilisateur.>

## Critères d'acceptation
- [ ] <critère vérifiable>

## Hors périmètre
- <ce qui n'est explicitement pas demandé, ou « À préciser »>

## Pistes techniques
- <hypothèse sur les parties du code concernées, ou « À analyser »>

## Questions ouvertes
- <point à clarifier>
```

## 4. Conclure

Réponds en deux lignes maximum : le chemin du ticket créé et son titre. S'il y a des questions ouvertes, indique-en le nombre.
