---
name: angular-setup
description: "Installe et configure Bootstrap et PrimeNG dans un projet Angular en choisissant les versions compatibles avec la version d'Angular et de Node du projet. À utiliser quand l'utilisateur veut ajouter PrimeNG ou Bootstrap, mettre à jour ces bibliothèques, ou vérifier leur compatibilité."
---

# Installer Bootstrap et PrimeNG au bon niveau de version

Ne choisis jamais une version de mémoire : elle dépend du projet.

## 1. Vérifier la compatibilité

Lance le script du plugin (il trouve seul le projet Angular, y compris dans `frontend/`) :

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-compat.js"
```

Si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans ton shell, le script est dans le dossier du plugin `lelib-angular`, sous `scripts/check-compat.js` : retrouve-le avec Glob.

Il affiche la version d'Angular, la version de Node avec celle qu'Angular exige, la version de PrimeNG à utiliser, et la liste des problèmes.

- S'il signale un **problème de Node** : arrête-toi et dis à l'utilisateur quelle version de Node installer. N'installe rien.
- S'il signale qu'**Angular est trop ancien** pour la version de PrimeNG disponible, ou qu'**aucune version** ne convient : présente le choix (mettre Angular à jour, ou prendre une version plus ancienne de PrimeNG) et attends la réponse.
- Sinon, montre un tableau court (paquet → version) et continue.

Pour obtenir le même rapport en JSON : ajoute `--json`.

## 2. Installer

Dans le dossier du projet Angular, avec les versions données par le script (clé `paquets_a_installer`) :

```bash
npm install primeng@<version> @primeuix/themes primeicons bootstrap@5
```

- N'ajoute `@primeuix/themes` que si le script l'indique (Angular 19 et plus). En dessous, PrimeNG utilise ses anciens thèmes CSS.
- Respecte le gestionnaire de paquets du projet (`packageManager` dans `package.json`, présence d'un `pnpm-lock.yaml` ou `yarn.lock`).
- Ne mets pas à jour Angular sans accord explicite.

## 3. Configurer

La configuration exacte varie d'une version majeure de PrimeNG à l'autre : vérifie-la dans la documentation de la version installée (https://primeng.org) avant d'écrire du code, et ne recopie pas ce qui suit sans le contrôler.

- **Thème PrimeNG** : `providePrimeNG` dans `app.config.ts`, preset `Aura` depuis `@primeuix/themes/aura`.
- **Cohabitation avec Bootstrap** : pour qu'aucun des deux n'écrase l'autre, déclare l'ordre des couches CSS.
  - côté PrimeNG, l'option `cssLayer` du thème ;
  - côté `styles.scss`, une ligne `@layer ...` qui place `bootstrap` avant `primeng`, et l'import de Bootstrap dans la couche `bootstrap`.
- **Bootstrap** : seulement le CSS. Pas de JavaScript Bootstrap, PrimeNG fournit les composants interactifs.
  Si l'import complet de Bootstrap casse l'apparence des composants PrimeNG malgré les couches, remplace-le par `bootstrap-grid` et `bootstrap-utilities` (dans `bootstrap/dist/css/`), qui suffisent pour la grille et les classes flex.
- **Icônes** : `primeicons/primeicons.css` dans les styles globaux.

## 4. Vérifier

Lance le build du projet (`npm run build`) et signale clairement s'il échoue. Indique ce qui n'a pas pu être vérifié visuellement (rendu dans le navigateur).
