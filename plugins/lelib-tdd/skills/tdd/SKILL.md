---
name: tdd
description: "Développe un ticket en TDD vérifiable : liste de tests par critère, cycles rouge / vert / refactor enregistrés dans un journal, puis bilan et traçabilité des critères vers les tests. Utilisé via /tdd [ticket]."
argument-hint: "[ticket : numéro ou chemin] (sans argument : le ticket en cours)"
disable-model-invocation: true
---

# TDD vérifiable

Entrée : `$ARGUMENTS`

Le but : que le TDD se **voie**. Chaque lancement de tests est enregistré (rouge ou vert), et le bilan final vient de ce journal, pas de ta mémoire. Trois scripts du plugin (retrouve leur dossier `scripts/` avec Glob si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell) :

- `tdd-run.js -- <commande de test>` : lance les tests, enregistre le résultat, rend le code de sortie de la commande. À utiliser **à la place** de la commande de test seule.
- `tdd-run.js --refactor` / `--bilan` / `--reset` : phase de refactor, résumé des cycles, remise à zéro.
- `check-criteres.js <ticket>` : liste les critères d'acceptation qu'aucun test ne cite.

## 1. Préparer
1. Lis le ticket (`tickets/<id>*.md`, ou `tickets/done/`). Ses critères d'acceptation doivent être numérotés `CA-1`, `CA-2`… S'ils ne le sont pas, **ne les renumérote pas toi-même** : dis-le, le PO ou `/ticket` doit le faire.
2. Trouve la commande de test du projet : `./mvnw -q test` (ou `mvnw.cmd`) côté back, `npm test` côté front. Cible un test précis pendant le cycle (`-Dtest=NomDuTest`, ou l'option du lanceur du projet).
3. Vide le journal : `node tdd-run.js --reset`.

## 2. Dresser la liste de tests
Avant tout code, écris dans le ticket, sous une section `## Plan de test`, un tableau : pour chaque critère, les tests à écrire (cas nominal, limites, erreurs). Un critère, plusieurs tests si besoin. Ne modifie pas les sections du PO. Cette liste est vivante : ajoute un test dès qu'un cas t'apparaît.

## 3. Un cycle par test, dans l'ordre de la liste
1. **Rouge** : écris UN test. Nomme-le avec le ticket et le critère : `[bet-003 CA-2] refuse un mot de passe vide` (`@DisplayName` en JUnit, `it('[bet-003 CA-2] …')` en Vitest ou Jasmine). Lance `tdd-run.js -- <commande>`. Le journal doit afficher **ROUGE (assertion)** : le comportement manque. **ROUGE (compilation)** est acceptable en Java quand la classe ou la méthode n'existe pas encore : crée seulement le squelette vide qui compile, puis relance pour obtenir un rouge d'assertion. **ROUGE (inconnue)** n'est pas un rouge valide : la commande est en erreur, corrige-la.
2. **Vert** : écris le code de production le plus simple qui fait passer ce test, rien de plus. Relance via `tdd-run.js` : **VERT**, et les autres tests aussi.
3. **Refactor** : si le code peut être amélioré (noms, duplication, SOLID), lance `tdd-run.js --refactor`, nettoie sans changer le comportement, puis relance les tests via `tdd-run.js` : toujours verts.
4. Test suivant de la liste.

Le hook de ce plugin avertit quand tu modifies du code de production sans test rouge enregistré (ou sans phase refactor). Ne le contourne pas : écris le test. Pour un fichier qui n'a pas à être testé (configuration, code généré), l'avertissement peut être ignoré en le disant dans le bilan.

## 4. Conclure
1. Lance toute la suite : `tdd-run.js -- <commande complète>`.
2. `node tdd-run.js --bilan` : rends ses chiffres tels quels (lancements, rouges valides, cycles rouge → vert, refactors) **et ses alertes**.
3. `node check-criteres.js <ticket>` : liste les critères couverts et ceux qui ne le sont pas. Un critère sans test est un travail non terminé : écris le test, ou dis pourquoi il n'est pas testable.
4. Ne coche pas les critères du ticket et ne dis pas « terminé » si le bilan a des alertes ou si un critère n'a pas de test.

## Règles
- Un test à la fois, le plus petit possible. Pas de code de production sans test rouge qui l'exige. Un bug commence par un test qui le reproduit.
- Ne modifie jamais un test pour le faire passer : si le test est faux, corrige-le explicitement et dis-le dans le bilan.
- Ne falsifie pas le journal : ne l'édite pas à la main et ne lance pas `tdd-run.js` sur une commande qui n'est pas la commande de test. Le tech lead relit le bilan.
- Ne fais ni commit ni push.
