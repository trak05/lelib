---
name: auto-test
description: "Lance les tests automatisés sur un ticket, ou sur toute l'application sans argument, puis produit un rapport PDF nommé <ticket>-<date-heure>.pdf et le remet à l'utilisateur. Utilisé via /auto-test [numéro de ticket]."
argument-hint: "[numéro de ticket, optionnel : sans numéro, toute l'application]"
disable-model-invocation: true
---

# Test automatisé et rapport PDF

Entrée : `$ARGUMENTS`

## 1. Choisir le périmètre

Le dossier `tickets/` est à la racine du projet (racine git si elle existe, sinon le répertoire courant).

- **Avec un numéro** (`3`, `003` ou `bet-003`) : prends le ticket dont le numéro correspond, sans tenir compte des zéros, dans `tickets/` puis `tickets/done/`. Introuvable : dis-le et arrête-toi.
  - Périmètre : les critères d'acceptation de ce ticket, et le code qu'il touche.
  - Nom du rapport : l'identifiant du ticket (nom du fichier sans `.md`, par exemple `bet-003`).
- **Sans argument** : toute l'application.
  - Périmètre : les suites de tests du back et du front, tous les tests e2e Playwright existants, un passage sur chaque écran principal de l'application (la page se charge, aucune erreur dans la console, aucune réponse 5xx), et les critères d'acceptation des tickets de `tickets/done/` (ceux déjà couverts par un test e2e le sont par ce test).
  - Nom du rapport : `application`.

Annonce en une ligne le périmètre retenu avant de commencer.

## 2. Préparer

- **Application** : cherche l'URL à tester (README, `CLAUDE.md`, `angular.json`, `proxy.conf*`, `application*.properties`). Si tu ne la trouves pas avec certitude, demande-la à l'utilisateur.
- **Projet** : le nom du dossier racine.

## 3. Exécuter les tests, avec l'agent qa

Délègue avec l'outil Agent à `lelib-equipe:qa`. Dans ta consigne, donne : le périmètre, l'URL, le chemin du ticket s'il y en a un, et ce qui suit.

- Il vérifie chaque écran en mobile (375 px), tablette et ordinateur, et signale les anomalies responsive avec une capture par format.
- Il lance les suites concernées, déroule les parcours dans le navigateur, et écrit ou complète les tests e2e manquants selon ses règles habituelles.
- Il range ses captures dans `rapport/auto-test/.tmp-<nom>/` (il crée le dossier) et donne leur chemin absolu.
- Il te rend un résultat structuré : environnement (versions, URL, navigateur, branche et commit si git), résultat par critère ou parcours, commandes exécutées avec leur issue, fichiers de test créés ou modifiés, anomalies (titre, étapes, attendu, obtenu, capture), et ce qu'il n'a pas pu vérifier.
- Il ne déclare « réussi » que ce qu'il a réellement exécuté.

## 4. Écrire le rapport

Copie le modèle `${CLAUDE_PLUGIN_ROOT}/skills/auto-test/rapport-modele.html` (s'il n'est pas résolu dans ton shell, retrouve-le avec Glob : `**/auto-test/rapport-modele.html`) vers `rapport/auto-test/<nom>-<AAAAMMJJ-HHMM>.html`, et remplis-le avec le résultat du `qa`. La date et l'heure sont celles de maintenant (`date +%Y%m%d-%H%M`) ; elles servent aussi au nom du PDF.

- **Verdict** : `ko` si au moins une vérification a échoué ; sinon `partiel` si quelque chose n'a pas pu être exécuté ou n'est pas couvert ; sinon `ok`.
- Les compteurs correspondent exactement aux lignes du tableau. Ne recopie que des faits fournis par le `qa` : n'invente aucun résultat, et n'adoucis pas un échec.
- Chaque anomalie reprend ses étapes, l'attendu et l'obtenu, avec sa capture (`<img src="file:///chemin/absolu.png">`).
- Mets dans « Limites » tout ce qui n'a pas été vérifié, avec la raison. Supprime les blocs d'exemple et les commentaires du modèle.

## 5. Produire le PDF

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/html-to-pdf.js" "rapport/auto-test/<nom>-<date>.html" "rapport/auto-test/<nom>-<date>.pdf"
```

(Même remarque sur `${CLAUDE_PLUGIN_ROOT}` : retrouve `scripts/html-to-pdf.js` avec Glob si besoin.)

Le PDF est enregistré dans le dossier `rapport/auto-test/` à la racine du projet. Le script crée ce dossier s'il n'existe pas : ne le crée pas à un autre endroit.

- **Échec** (souvent Chromium pas encore installé) : montre l'erreur de la commande, garde le fichier HTML, ne dis pas qu'un PDF existe, et arrête-toi après le bilan.
- **Succès** : supprime le fichier HTML et le dossier `rapport/auto-test/.tmp-<nom>/` (tout est dans le PDF). Ne supprime rien d'autre.

## 6. Remettre le PDF à l'utilisateur

Le PDF s'appelle `<nom>-<AAAAMMJJ-HHMM>.pdf`, par exemple `bet-003-20261102-1015.pdf` ou `application-20261102-1015.pdf`.

- Si l'outil **SendUserFile** est disponible : envoie le PDF avec (`display: "attach"`), c'est ce qui déclenche le téléchargement.
- Sinon, ouvre-le avec le lecteur par défaut du système (`Start-Process` sous Windows, `open` sous macOS, `xdg-open` sous Linux) et donne son chemin complet.

Dans les deux cas, le PDF reste enregistré dans `rapport/auto-test/` à la racine du projet : indique son chemin complet.

## 7. Bilan

Réponds en quelques lignes : le verdict, les chiffres (réussies, échouées, non couvertes), les titres des anomalies, le chemin du PDF. Si `rapport/auto-test/` n'est pas dans le `.gitignore` du projet, signale-le sans le modifier toi-même.

## Règles

- Tu ne modifies pas le code de production et tu ne fais ni commit ni push.
- Le rapport est produit même si des tests échouent : c'est justement ce qu'il doit montrer.
- Si les tests n'ont pas pu démarrer (application injoignable, build cassé), produis quand même un rapport avec le verdict `partiel` ou `ko` qui explique pourquoi.
