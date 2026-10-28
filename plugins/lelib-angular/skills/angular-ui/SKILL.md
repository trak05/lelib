---
name: angular-ui
description: "Conventions d'interface pour les projets Angular qui utilisent Bootstrap (grille, flex) et PrimeNG. À utiliser dès qu'on crée ou modifie un écran, un formulaire, un tableau, un calendrier, une liste à sélection multiple ou tout autre composant visuel."
---

# Interface Angular : Bootstrap + PrimeNG

## Répartition des rôles

- **Bootstrap** : uniquement la mise en page. Grille (`container`, `row`, `col-*`), classes flex (`d-flex`, `justify-content-between`, `align-items-center`, `gap-*`, `flex-wrap`), espacements (`m-*`, `p-*`) et affichage responsive.
- **PrimeNG** : tous les composants. Ne recrée pas à la main ce qu'il fournit, et n'utilise pas les composants Bootstrap (modales, boutons, tableaux, formulaires) à sa place.

## Composants PrimeNG à utiliser

| Besoin | Composant PrimeNG |
|---|---|
| Tableau | `p-table` |
| Calendrier, date | `p-datepicker` (anciennement `Calendar`) |
| Liste déroulante | `p-select` (anciennement `Dropdown`) |
| Sélection multiple | `p-multiselect` |
| Champ texte, nombre | `pInputText`, `p-inputnumber` |
| Boutons | `p-button` |
| Fenêtre modale | `p-dialog` |
| Messages | `p-toast` |

Avant d'employer un composant, vérifie son nom et son import dans la version de PrimeNG installée (`node_modules/primeng`, ou https://primeng.org) : les noms et les modules ont changé entre versions majeures.

## Règles

- Composants Angular standalone, état avec les signals, formulaires réactifs typés.
- Un tableau de données serveur est paginé et trié côté back (`lazy`, événement `onLazyLoad`) : transmets page, taille et tri à l'API, sans charger toute la liste.
- Chaque champ de formulaire a un `label` associé et un message d'erreur visible. Les icônes seules ont un libellé accessible (`aria-label`).
- Pas de CSS écrit pour faire ce qu'une classe Bootstrap fait déjà. Quand il en faut, mets-le dans le composant, et surcharge PrimeNG avec ses variables de thème plutôt qu'avec des sélecteurs internes.
- Pour installer ou mettre à jour PrimeNG et Bootstrap, utilise la skill `angular-setup` : elle choisit des versions compatibles avec le projet.
