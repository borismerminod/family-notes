---
name: kanban_crud
description: Nouvelle page Kanban offrant la gestion (CRUD) des tableaux kanban — liste, ouverture, création et suppression confirmée. Le nom d'un tableau se saisit dans son écran d'édition, pas dans une popup.
status: brouillon — à valider
date: 2026-09-29
revised: 2026-10-07
---

# Explication du développement à réaliser

Le plan global (`PLAN_GLOBAL.md` §2.C) prévoit un **système Kanban** : des tableaux composés
de listes et de cartes que l'on déplace par glisser-déposer. Avant de construire ces
interactions, il faut pouvoir **gérer les tableaux eux-mêmes**. C'est l'objet de ce lot.

Nous ajoutons une **nouvelle page « Kanban »** (route dédiée, sur le modèle de la page
« Mes Notes ») qui affiche la **liste des tableaux kanban** de l'utilisateur. Depuis cette
page, l'utilisateur peut :
- **Ajouter** un tableau : le bouton « + » ouvre directement l'écran d'édition d'un nouveau
  tableau, où le nom se saisit et où un bouton d'enregistrement le crée ;
- **Ouvrir** un tableau existant en touchant sa carte — cet écran d'édition étant aussi
  l'endroit où son nom se modifie ;
- **Supprimer** un tableau, **après confirmation** via la même popup de confirmation que
  pour les notes (composant `ConfirmDialog`) : rien n'est supprimé tant que l'utilisateur
  n'a pas confirmé.

Comme pour les notes, les tableaux sont **stockés localement** (approche *local-first*,
SQLite) et la liste est **persistante** : après un redémarrage de l'application, les
tableaux créés sont toujours présents. Le comportement et l'ergonomie (bouton flottant « + »,
cartes de liste, icône corbeille, états vide / chargement / erreur) s'alignent sur la page
« Mes Notes » pour que l'utilisateur retrouve ses repères.

Maquette visuelle proposée (2026-09-29) : [`MAQUETTE_KANBAN_LIST.html`](MAQUETTE_KANBAN_LIST.html).

> **Révision du 2026-10-07.** La saisie du nom passe de la popup à l'écran d'édition du tableau :
> « + » ouvre un nouveau tableau sans rien écrire en base, et toucher une carte ouvre ce même écran
> pour un tableau existant. Conséquences sur ce document : US2 et US4 réécrites, US3 n'est plus
> reportée mais devient le lot dont elles dépendent, H2 et H3 tranchées. Les écrans 2 et 3 de la
> maquette (popup de saisie) ne sont plus la cible ; l'écran 1 (liste), l'écran 6 (liste vide) et la
> popup de confirmation de suppression restent valables.

# Périmètre

**Inclus :**
- Nouvelle page « Kanban » accessible par une route dédiée.
- Affichage de la liste des tableaux kanban (nom + date de dernière modification), avec
  états chargement, liste vide et erreur de chargement.
- Ouverture de l'écran d'édition d'un tableau : pour un nouveau tableau depuis le bouton
  flottant « + », pour un tableau existant en touchant sa carte. Toucher « + » n'écrit rien
  en base.
- Suppression d'un tableau avec popup de confirmation (réutilisation de `ConfirmDialog`).
- Persistance locale des tableaux (nouvelle table SQLite + service dédié).

**Hors périmètre (lots ultérieurs) :**
- L'écran d'édition d'un tableau lui-même (US3) : saisie du nom, bouton d'enregistrement,
  création effective en base, retour à la liste. Ce lot ne livre que la **navigation** vers cet
  écran ; son contenu fait l'objet du lot suivant, dont US2 et US4 dépendent désormais
  (cf. `APPROCHE_KANBAN_CRUD.md` D-K9, révisée).
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
- **je veux** créer un nouveau tableau,
- **afin de** organiser un nouveau sujet (courses, travaux, vacances…).
- **Critères d'acceptation :**
    - Un bouton flottant « + » ouvre l'écran d'édition d'un nouveau tableau.
    - Toucher « + » **n'écrit rien** en base : aucun tableau n'existe encore à ce moment.
    - Tant que l'utilisateur n'a rien saisi, le tableau porte le nom « Sans titre » ; un nom
      vide n'est donc jamais enregistré.
    - Le tableau est créé en base au moment où l'utilisateur touche le **bouton
      d'enregistrement** de l'écran d'édition.
    - Le nom est enregistré sans espaces superflus en début / fin.
    - Quitter l'écran d'édition sans enregistrer ne crée aucun tableau.
    - Après enregistrement, le nouveau tableau apparaît dans la liste et est persisté
      (toujours présent après redémarrage).

**US3 : Ouvrir et éditer un tableau kanban** — *le report du 2026-09-29 est levé le 2026-10-07 :
l'écran devient le lot suivant, dont US2 et US4 dépendent. Ce lot ne livre que la navigation
depuis la liste.*
- **En tant qu'** utilisateur,
- **je veux** ouvrir un tableau depuis la liste et pouvoir y changer son nom,
- **afin d'** accéder à son contenu et de corriger son intitulé.
- **Critères d'acceptation :**
    - Toucher une carte de la liste ouvre l'écran d'édition de **ce** tableau.
    - Le bouton « + » ouvre le même écran, pour un tableau qui n'existe pas encore en base.
    - L'écran affiche le nom du tableau, modifiable, et un bouton d'enregistrement
      (zone de contenu vide dans un premier temps).
    - Un retour ramène à la liste des tableaux, sans rien enregistrer.
    - Un identifiant de tableau inexistant ne provoque pas d'erreur bloquante : l'utilisateur
      est ramené à la liste.

**US4 : Renommer un tableau kanban**
- **En tant qu'** utilisateur,
- **je veux** renommer un tableau existant,
- **afin de** corriger ou faire évoluer son intitulé.
- **Critères d'acceptation :**
    - Le renommage se fait dans l'écran d'édition du tableau, ouvert en touchant sa carte :
      la liste ne porte **aucune** action « Modifier » (plus d'icône crayon).
    - Le champ est pré-rempli avec le nom actuel.
    - Mêmes règles qu'à la création : espaces de début / fin retirés, nom jamais vide.
    - Quitter l'écran sans enregistrer laisse le tableau inchangé.
    - Après enregistrement, le nouveau nom et la date de modification sont mis à jour dans la
      liste et persistés.

**US5 : Supprimer un tableau kanban avec confirmation**
- **En tant qu'** utilisateur,
- **je veux** supprimer un tableau dont je n'ai plus besoin, après avoir confirmé mon choix,
- **afin d'** éviter toute suppression accidentelle.
- **Critères d'acceptation :**
    - Une icône corbeille est disponible sur chaque tableau ; la toucher n'ouvre **pas** son
      écran d'édition. Ce point devient critique depuis le 2026-10-07 : la carte entière étant
      désormais cliquable, le clic sur la corbeille ne doit pas se propager.
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
- **H2 — Forme de la saisie du nom** — *tranchée le 2026-10-07* : **pas de popup**. Le nom se
  saisit dans l'écran d'édition du tableau, qui porte un bouton d'enregistrement, sur le modèle
  de l'éditeur de notes.
- **H3 — Emplacement de l'action « Modifier »** — *tranchée le 2026-10-07* : **aucune action sur
  la carte**. Toucher la carte ouvre l'écran d'édition, qui est l'endroit du renommage. Seule la
  corbeille reste sur la carte.
- **H4 — Unicité du nom** : deux tableaux peuvent-ils porter le même nom ? Hypothèse : oui,
  aucun contrôle d'unicité dans ce lot.
- **H5 — Accès à la page** : l'application n'a pas de menu de navigation global ; la page
  sera au minimum accessible par sa route (`/kanban`). Faut-il prévoir un point d'entrée
  visible dès ce lot ?
