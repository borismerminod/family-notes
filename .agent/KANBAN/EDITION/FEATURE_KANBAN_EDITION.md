---
name: kanban_edition
description: Écran d'édition d'un tableau kanban — ouvert depuis la liste pour un tableau existant ou pour un tableau neuf, il porte la saisie du nom et le bouton d'enregistrement. Les listes et les cartes du tableau restent hors périmètre.
status: brouillon — à valider
date: 2026-10-10
---

# Explication du développement à réaliser

Le lot précédent (`KANBAN/CRUD`) a livré la **page liste des tableaux kanban** : elle affiche les
tableaux, permet d'en supprimer un après confirmation, et sait **naviguer** vers l'écran d'édition
d'un tableau — depuis le bouton flottant « + » pour un tableau neuf, en touchant une carte pour un
tableau existant. Mais cet écran n'existe pas encore : les routes `/kanban/new` et
`/kanban/edit/:id` sont appelées sans être déclarées (constat C11 de `REVUE_KANBAN_CRUD.md`). Deux
user stories du lot précédent, **US2 (ajouter un tableau)** et **US4 (renommer un tableau)**, sont
donc à ce jour incomplètes : la liste ouvre un écran vide d'un côté, et aucun tableau ne peut être
créé ni renommé de l'autre.

Ce lot livre cet **écran d'édition d'un tableau**. C'est l'écran central du Kanban : à terme il
portera les listes (colonnes) et les cartes du tableau. Pour ce lot, il se limite à ce qui rend la
gestion des tableaux utilisable de bout en bout : **afficher et modifier le nom du tableau**, et
**l'enregistrer**. L'écran sert les deux situations avec le même composant, la présence d'un
identifiant dans la route faisant la différence — exactement le parcours déjà en place pour les
notes (`/notes/new` et `/notes/edit/:id`, décision D1 de `PLAN_NOTES.md`) :

- **un tableau neuf** (`/kanban/new`) : le champ de nom est vide, et rien n'existe en base. Le
  tableau est **créé au moment où l'utilisateur touche le bouton d'enregistrement**, et pas avant :
  ouvrir l'écran puis revenir en arrière ne laisse aucun tableau fantôme dans la liste ;
- **un tableau existant** (`/kanban/edit/:id`) : le champ est pré-rempli avec le nom actuel, et
  l'enregistrement met à jour ce nom ainsi que la date de dernière modification.

Dans les deux cas, un **enregistrement réussi ramène à la liste des tableaux**, où l'utilisateur
voit immédiatement le résultat de son geste : la nouvelle carte, ou le nom corrigé remonté en tête
de liste. Un **échec** de l'enregistrement, lui, laisse l'utilisateur sur l'écran avec sa saisie
intacte et un message d'erreur : sa frappe n'est jamais perdue à cause d'une panne de la base.

L'écran offre aussi un **retour** vers la liste sans rien enregistrer. Comme la saisie du nom est le
seul contenu de l'écran et qu'elle peut représenter un vrai travail de l'utilisateur, un retour
alors que des **modifications ne sont pas enregistrées** demande une **confirmation** avant
d'abandonner la saisie — la même popup de confirmation que pour la suppression d'une note ou d'un
tableau (composant `ConfirmDialog`). Sans modification en attente, le retour est immédiat et ne
pose aucune question.

Enfin, la **zone de contenu du tableau** (là où viendront les listes et les cartes) est présente
mais **vide** dans ce lot : elle annonce ce qui arrive, sans rien faire. C'est le point d'ancrage
visuel des lots suivants.

# Périmètre

**Inclus :**
- Nouvel écran d'édition d'un tableau kanban, servi par les deux routes `/kanban/new` et
  `/kanban/edit/:id`, déclarées dans `app.routes.ts` avant la route « adresse inconnue ».
- Chargement du tableau à éditer depuis la base à partir de l'identifiant de la route, ce qui
  suppose une **lecture unitaire** dans `KanbanService` (`getKanbanById`, absente à ce jour —
  constat C14 de `REVUE_KANBAN_CRUD.md`), écrite en TDD comme le reste du service.
- Saisie et modification du **nom** du tableau, avec repli sur « Sans titre » à l'enregistrement.
- Bouton d'**enregistrement** : création en base pour un tableau neuf, renommage pour un tableau
  existant ; retour à la liste en cas de succès, maintien sur l'écran avec message en cas d'échec.
- Bouton de **retour** à la liste, avec confirmation lorsque des modifications ne sont pas
  enregistrées.
- Traitement d'un **identifiant inexistant** dans la route : pas d'erreur bloquante, l'utilisateur
  est ramené à la liste.
- Zone de contenu du tableau **vide**, réservée aux listes et aux cartes des lots suivants.

**Hors périmètre (lots ultérieurs) :**
- **Création de listes (colonnes)** dans un tableau et **ajout de cartes** dans ces listes :
  explicitement reporté, c'est le lot suivant.
- Glisser-déposer des cartes entre les listes.
- Suppression d'un tableau depuis l'écran d'édition : elle reste sur la liste (US5 du lot `CRUD`).
- Enregistrement automatique (à la frappe ou à la perte de focus) : l'enregistrement reste un geste
  explicite.
- Description, couleur, catégorie ou toute autre propriété d'un tableau au-delà de son nom.
- Contrôle d'unicité du nom entre tableaux.
- Historique d'édition (annuler / rétablir) sur le nom du tableau.
- Partage, synchronisation (CRDT, P2P) et pilotage par l'assistant IA.

# User Stories

**US1 : Ouvrir un tableau existant pour l'éditer**
- **En tant qu'** utilisateur de Family Notes,
- **je veux** ouvrir un tableau depuis la liste et voir son nom dans un écran dédié,
- **afin de** accéder à ce tableau et vérifier sur quoi je travaille.
- **Critères d'acceptation :**
    - Toucher la carte d'un tableau dans la liste ouvre l'écran d'édition de **ce** tableau.
    - Le champ de nom est pré-rempli avec le nom actuel du tableau.
    - Pendant le chargement du tableau, un indicateur de chargement est affiché.
    - La zone de contenu du tableau est visible mais vide, avec une indication que les listes
      viendront plus tard.
    - Si l'identifiant de la route ne correspond à aucun tableau, l'écran ne plante pas :
      l'utilisateur est ramené à la liste des tableaux.
    - Si le chargement échoue, un message d'erreur est affiché et l'utilisateur peut revenir à la
      liste.

**US2 : Créer un tableau en l'enregistrant depuis l'écran d'édition**
- **En tant qu'** utilisateur,
- **je veux** nommer un nouveau tableau puis l'enregistrer,
- **afin de** organiser un nouveau sujet (courses, travaux, vacances…).
- **Critères d'acceptation :**
    - Le bouton flottant « + » de la liste ouvre l'écran avec un champ de nom **vide**, portant
      « Sans titre » en indication (placeholder).
    - Ouvrir l'écran n'écrit **rien** en base.
    - Toucher le bouton d'enregistrement crée le tableau en base avec le nom saisi.
    - Enregistrer sans avoir rien saisi, ou avec un nom ne contenant que des espaces, crée le
      tableau sous le nom **« Sans titre »** : un nom vide n'est jamais enregistré.
    - Le nom est enregistré sans espaces superflus en début et en fin ; les espaces intérieurs sont
      conservés.
    - Après un enregistrement réussi, l'utilisateur est ramené à la **liste**, où le nouveau tableau
      apparaît.
    - Le tableau créé est persistant : il est toujours présent après un redémarrage de
      l'application.
    - Quitter l'écran sans enregistrer ne crée aucun tableau.

**US3 : Renommer un tableau existant**
- **En tant qu'** utilisateur,
- **je veux** modifier le nom d'un tableau déjà créé puis l'enregistrer,
- **afin de** corriger ou faire évoluer son intitulé.
- **Critères d'acceptation :**
    - Le champ de nom est modifiable et part du nom actuel du tableau.
    - Toucher le bouton d'enregistrement met à jour le nom **et** la date de dernière modification
      du tableau.
    - Mêmes règles de nom qu'à la création : espaces de début et de fin retirés, repli sur
      « Sans titre » si la saisie est vide.
    - Après un enregistrement réussi, l'utilisateur est ramené à la liste, où le tableau porte son
      nouveau nom et remonte en tête (tri du plus récemment modifié au plus ancien).
    - Le nouveau nom est persistant après un redémarrage de l'application.
    - Enregistrer sans avoir touché au nom est sans effet néfaste : le tableau garde son nom.

**US4 : Être averti avant de perdre une saisie non enregistrée**
- **En tant qu'** utilisateur,
- **je veux** être prévenu quand je quitte l'écran alors que ma saisie n'est pas enregistrée,
- **afin de** ne pas perdre mon travail par un geste de retour involontaire.
- **Critères d'acceptation :**
    - L'écran porte un bouton de retour vers la liste des tableaux.
    - Sans modification en attente, le retour ramène **immédiatement** à la liste, sans question.
    - Avec une modification en attente (nom saisi ou modifié depuis l'ouverture, non encore
      enregistré), le retour ouvre une popup de confirmation (même composant que pour les
      suppressions) prévenant que les modifications seront perdues.
    - « Annuler » (ou un clic hors de la popup) ferme la popup et laisse l'utilisateur sur l'écran,
      sa saisie intacte.
    - Confirmer ramène à la liste **sans rien enregistrer** : aucun tableau créé, aucun nom modifié.
    - Après un enregistrement réussi, il n'y a plus de modification en attente.

**US5 : Garder ma saisie quand l'enregistrement échoue**
- **En tant qu'** utilisateur,
- **je veux** rester sur l'écran avec ma saisie quand l'enregistrement ne passe pas,
- **afin de** pouvoir réessayer sans retaper le nom.
- **Critères d'acceptation :**
    - En cas d'échec de l'enregistrement, l'utilisateur **reste** sur l'écran d'édition.
    - Le nom saisi est toujours présent dans le champ.
    - Un message d'erreur visible explique que l'enregistrement a échoué — il n'est pas laissé dans
      la console seule.
    - L'utilisateur peut retoucher son nom et réessayer l'enregistrement.
    - Un échec ne crée ni ne modifie aucun tableau en base ; la modification reste « en attente »
      au sens d'US4.

# Questions ouvertes / hypothèses

- **H1 — Dossier de la fonctionnalité** — *tranchée le 2026-10-10* : les livrables de ce lot vont
  dans `.agent/KANBAN/EDITION`, à côté de `.agent/KANBAN/CRUD`.
- **H2 — Sort de l'écran après enregistrement** — *tranchée le 2026-10-10* : **retour à la liste**
  des tableaux, dans les deux cas (création et renommage), par symétrie avec l'éditeur de notes
  (D3). À revoir lorsque les listes et les cartes arriveront : il deviendra peut-être plus naturel
  de rester dans le tableau.
- **H3 — Nom par défaut « Sans titre »** — *tranchée le 2026-10-10* : champ **vide** avec
  « Sans titre » en indication (placeholder) ; le repli sur « Sans titre » se fait **à
  l'enregistrement**. Le bouton d'enregistrement n'est donc jamais désactivé à cause d'un nom vide.
- **H4 — Avertissement avant de quitter** — *tranchée le 2026-10-10* : **oui**, popup de
  confirmation lorsqu'une modification est en attente (US4). Réutilisation de `ConfirmDialog`.
- **H5 — Détection d'une « modification en attente »** : hypothèse retenue — comparaison du nom
  affiché avec le nom de départ (vide pour un tableau neuf, nom en base pour un tableau existant).
  Retaper exactement le même nom ne compte donc pas comme une modification. À confirmer.
- **H6 — Bouton de retour matériel d'Android** : l'application n'intercepte pas aujourd'hui le
  bouton « retour » du téléphone. Hypothèse retenue — l'avertissement d'US4 ne couvre que le bouton
  de retour **de l'écran** ; traiter le bouton matériel est hors périmètre de ce lot.
- **H7 — Titre de l'écran** : hypothèse retenue — « Nouveau tableau » pour un tableau neuf, le nom
  du tableau (ou « Modifier le tableau ») pour un tableau existant, sur le modèle de l'en-tête de
  l'éditeur de notes.
- **H8 — Maquette** : faut-il une `MAQUETTE_KANBAN_EDITOR.html` avant de partir sur le plan de
  test, comme pour la liste et pour les notes ?
