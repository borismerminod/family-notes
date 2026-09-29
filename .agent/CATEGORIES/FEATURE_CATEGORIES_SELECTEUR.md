---
name: sélection_categories_intuitive
description: Ajout d'une sélection de catégories par liste déroulante avec autocomplétion, création fluide et sélection de couleur.
status: a réaliser
date: 2026-09-26
---

# Explication du développement à réaliser

L'objectif est d'améliorer l'expérience utilisateur lors de l'attribution d'une catégorie à une note. Actuellement, l'utilisateur doit saisir manuellement le nom de la catégorie, ce qui peut entraîner des doublons (ex: "Travail" vs "travail") ou des erreurs de saisie.

Nous voulons mettre en place un composant de saisie intelligent (type *Autocomplete* ou *Combobox*) :
- **Affichage** : Lorsqu'on clique dans le champ "Catégorie", une liste des catégories existantes s'affiche.
- **Filtrage** : En tapant du texte, la liste se filtre instantanément pour proposer les catégories correspondantes.
- **Sélection** : Cliquer sur une catégorie de la liste remplit automatiquement le champ.
- **Création fluide** : Si l'utilisateur tape une catégorie qui n'existe pas et valide (ex: en appuyant sur "Entrée"), l'application doit créer cette nouvelle catégorie et l'associer à la note, tout en l'ajoutant à la liste globale des catégories disponibles.

**Distinction visuelle par couleur :**
Pour améliorer la lisibilité, chaque catégorie peut être associée à une couleur spécifique.
- **Visuel** : Le champ "Catégorie" sera entouré d'un bloc de couleur correspondant à la catégorie sélectionnée.
- **Sélection** : Un petit bouton à droite du champ catégorie permet d'ouvrir une popup (style sélecteur de texte) proposant une palette de couleurs prédéfinies.
- **Action** : La sélection d'une couleur dans cette popup ferme celle-ci et met à jour instantanément la couleur du bloc entourant l'input.
- **Persistance** : La couleur choisie est enregistrée avec la catégorie pour être utilisée lors des prochaines saisies.

Ce changement vise à garantir l'intégrité des données (moins de doublons), à accélérer la saisie pour l'utilisateur et à offrir une meilleure clarté visuelle.

# Périmètre

**Inclus :**
- Développement du composant de saisie avec filtrage dynamique.
- Logique d'association entre une note et une catégorie globale.
- Logique de création automatique d'une catégorie si elle est saisie et qu'elle est nouvelle.
- Mise à jour de la liste globale des catégories disponibles.
- **Système de sélection de couleur :**
    - Palette de couleurs prédéfinies.
    - Popup de sélection déclenchée par un bouton dédié.
    - Mise à jour dynamique de l'UI (bloc de couleur autour de l'input).
    - Enregistrement de la couleur dans la base de données des catégories.

**Hors périmètre :**
- Gestion des sous-catégories (la structure reste plate).
- Modification ou suppression de catégories via une interface dédiée (pour l'instant, la gestion se fait via la saisie directe).

# User Stories

**US1 : Sélection d'une catégorie existante**
- **En tant qu'** utilisateur de l'application family notes,
- **Je veux** voir une liste déroulante des catégories existantes quand je clique sur le champ catégorie,
- **afin de** choisir rapidement une catégorie sans avoir à la taper entièrement.
- **Critères d'acceptation :**
    - La liste s'ouvre au clic ou au focus sur le champ.
    - Cliquer sur un élément de la liste remplit le champ.
    - La liste contient toutes les catégories déjà créées dans le système.

**US2 : Filtrage dynamique des catégories**
- **En tant qu'** utilisateur,
- **Je veux** que la liste déroulante se filtre au fur et à mesure que je tape du texte,
- **afin de** trouver rapidement une catégorie spécifique dans une longue liste.
- **Critères d'acceptation :**
    - La liste se met à jour à chaque touche pressée.
    - Seules les catégories contenant la chaîne de caractères saisie sont affichées.
    - Si aucune correspondance n'est trouvée, un message "Aucune catégorie trouvée" peut être affiché.

**US3 : Création fluide d'une nouvelle catégorie**
- **En tant qu'** utilisateur,
- **Je veux** pouvoir enregistrer une nouvelle catégorie simplement en la tapant dans le champ,
- **afin de** ne pas avoir à aller dans un menu de configuration pour ajouter une catégorie.
- **Critères d'acceptation :**
    - Si la catégorie tapée n'existe pas dans la base de données, elle est créée lors de l'enregistrement de la note.
    - La nouvelle catégorie devient immédiatement disponible dans la liste déroulante pour les prochaines saisies.
    - La note est correctement associée à cette nouvelle catégorie.

**US4 : Sélection de couleur d'une catégorie**
- **En tant qu'** utilisateur,
- **Je veux** pouvoir choisir une couleur pour ma catégorie,
- **afin de** mieux distinguer visuellement les catégories dans l'application.
- **Critères d'acceptation :**
    - Un bouton à droite du champ catégorie permet d'ouvrir une popup de sélection de couleur.
    - La popup propose une palette de couleurs prédéfinies (limitée).
    - La sélection d'une couleur ferme la popup et applique la couleur au bloc entourant le champ catégorie.
    - La couleur choisie est persistante et enregistrée avec la catégorie.
<EOF>
