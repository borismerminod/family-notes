---
name: kanban_crud
description: Nouvelle page Kanban offrant la gestion (CRUD) des tableaux kanban — liste, création, modification et suppression confirmée.
status: brouillon — à valider
date: 2026-09-29
---

# Explication du développement à réaliser

Le plan global (`PLAN_GLOBAL.md` §2.C) prévoit un **système Kanban** : des tableaux composés
de listes et de cartes que l'on déplace par glisser-déposer. Avant de construire ces
interactions, il faut pouvoir **gérer les tableaux eux-mêmes**. C'est l'objet de ce lot.

Nous ajoutons une **nouvelle page « Kanban »** (route dédiée, sur le modèle de la page
« Mes Notes ») qui affiche la **liste des tableaux kanban** de l'utilisateur. Depuis cette
page, l'utilisateur peut :
- **Ajouter** un nouveau tableau kanban en lui donnant un nom ;
- **Modifier** un tableau existant (renommer) ;
- **Supprimer** un tableau, **après confirmation** via la même popup de confirmation que
  pour les notes (composant `ConfirmDialog`) : rien n'est supprimé tant que l'utilisateur
  n'a pas confirmé.

Comme pour les notes, les tableaux sont **stockés localement** (approche *local-first*,
SQLite) et la liste est **persistante** : après un redémarrage de l'application, les
tableaux créés sont toujours présents. Le comportement et l'ergonomie (bouton flottant « + »,
cartes de liste, icône corbeille, états vide / chargement / erreur) s'alignent sur la page
« Mes Notes » pour que l'utilisateur retrouve ses repères.

Maquette visuelle proposée (2026-09-29) : [`MAQUETTE_KANBAN_LIST.html`](MAQUETTE_KANBAN_LIST.html).

# Périmètre

**Inclus :**
- Nouvelle page « Kanban » accessible par une route dédiée.
- Affichage de la liste des tableaux kanban (nom + date de dernière modification), avec
  états chargement, liste vide et erreur de chargement.
- Création d'un tableau (nom obligatoire).
- Modification du nom d'un tableau.
- Suppression d'un tableau avec popup de confirmation (réutilisation de `ConfirmDialog`).
- Persistance locale des tableaux (nouvelle table SQLite + service dédié).

**Hors périmètre (lots ultérieurs) :**
- Consultation d'un tableau : écran de détail ouvert depuis la liste (US3 — reportée le
  2026-09-29, cf. `APPROCHE_KANBAN_CRUD.md` D-K9).
- Listes (colonnes) et cartes à l'intérieur d'un tableau.
- Glisser-déposer des cartes entre listes.
- Recherche / filtre / tri des tableaux.
- Catégories ou couleurs associées aux tableaux.
- Partage, synchronisation (CRDT, P2P) et pilotage par l'assistant IA.
- Menu de navigation global entre Notes / Planning / Kanban (s'il n'existe pas déjà).

# User Stories

**US1 : Consulter la liste des tableaux kanban**
- **En tant qu'** utilisateur de Family Notes,
- **je veux** ouvrir une page « Kanban » qui liste tous mes tableaux,
- **afin de** voir d'un coup d'œil les tableaux dont je dispose.
- **Critères d'acceptation :**
    - La page est accessible par sa route dédiée.
    - Chaque tableau est affiché avec son nom et sa date de dernière modification.
    - Les tableaux sont triés du plus récemment modifié au plus ancien.
    - Pendant le chargement, un indicateur de chargement est affiché.
    - Sans aucun tableau, un message invite à en créer un (« Aucun tableau pour l'instant.
      Touchez « + » pour en créer un. »).
    - En cas d'échec du chargement, un message d'erreur et un bouton « Réessayer » sont
      affichés.

**US2 : Ajouter un tableau kanban**
- **En tant qu'** utilisateur,
- **je veux** créer un nouveau tableau en lui donnant un nom,
- **afin de** organiser un nouveau sujet (courses, travaux, vacances…).
- **Critères d'acceptation :**
    - Un bouton flottant « + » déclenche la création.
    - Le nom est obligatoire : un nom vide (ou composé uniquement d'espaces) ne peut pas être
      validé.
    - Le nom saisi est enregistré sans espaces superflus en début/fin.
    - L'annulation ne crée aucun tableau.
    - Après validation, le nouveau tableau apparaît dans la liste et est persisté
      (toujours présent après redémarrage).

**US3 : Consulter un tableau kanban** — *reportée le 2026-09-29 (hors de ce lot, conservée pour
un lot ultérieur)*
- **En tant qu'** utilisateur,
- **je veux** ouvrir un tableau depuis la liste,
- **afin d'** accéder à son contenu.
- **Critères d'acceptation :**
    - Toucher un tableau dans la liste ouvre son écran de détail.
    - L'écran de détail affiche le nom du tableau (zone de contenu vide dans un premier temps).
    - Un retour ramène à la liste des tableaux.
    - Un identifiant de tableau inexistant ne provoque pas d'erreur bloquante : l'utilisateur
      est ramené à la liste.

**US4 : Modifier un tableau kanban**
- **En tant qu'** utilisateur,
- **je veux** renommer un tableau existant,
- **afin de** corriger ou faire évoluer son intitulé.
- **Critères d'acceptation :**
    - Une action « Modifier » est disponible pour chaque tableau.
    - Le formulaire est pré-rempli avec le nom actuel.
    - Mêmes règles de validation qu'à la création (nom obligatoire, espaces retirés).
    - L'annulation laisse le tableau inchangé.
    - Après validation, le nouveau nom et la date de modification sont mis à jour dans la
      liste et persistés.

**US5 : Supprimer un tableau kanban avec confirmation**
- **En tant qu'** utilisateur,
- **je veux** supprimer un tableau dont je n'ai plus besoin, après avoir confirmé mon choix,
- **afin d'** éviter toute suppression accidentelle.
- **Critères d'acceptation :**
    - Une icône corbeille est disponible sur chaque tableau ; la toucher n'ouvre **pas** le
      tableau.
    - La corbeille ouvre la popup de confirmation (même composant que pour les notes), dont
      le message cite le nom du tableau.
    - Tant que l'utilisateur n'a pas confirmé, rien n'est supprimé.
    - « Annuler » (ou un clic hors de la popup) ferme la popup sans supprimer.
    - « Confirmer » supprime le tableau de la base locale et le retire de la liste.
    - En cas d'échec de la suppression, le tableau reste affiché et un message d'erreur est
      présenté.

# Questions ouvertes / hypothèses

- **H1 — Attributs d'un tableau** : pour ce lot, un tableau se limite à un **nom** et une
  **date de dernière modification** (plus son identifiant). Faut-il ajouter une description ?
- **H2 — Forme du formulaire de création/modification** : proposé sous forme de **popup**
  sur la page Kanban (saisie courte d'un nom), plutôt qu'une page dédiée comme l'éditeur de
  notes. À confirmer.
- **H3 — Emplacement de l'action « Modifier »** : icône crayon sur chaque carte de la liste
  (à côté de la corbeille). L'écran de détail étant reporté, il ne porte pas d'action dans ce lot.
- **H4 — Unicité du nom** : deux tableaux peuvent-ils porter le même nom ? Hypothèse : oui,
  aucun contrôle d'unicité dans ce lot.
- **H5 — Accès à la page** : l'application n'a pas de menu de navigation global ; la page
  sera au minimum accessible par sa route (`/kanban`). Faut-il prévoir un point d'entrée
  visible dès ce lot ?
