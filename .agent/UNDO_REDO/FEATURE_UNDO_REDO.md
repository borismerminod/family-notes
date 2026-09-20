# Feature — Annuler / Rétablir (Undo / Redo) dans l'éditeur de notes

**Date :** 2026-09-20
**Statut :** validé le 2026-09-20
**Écran concerné :** éditeur de note riche (`rich-text-editor`), barre de mise en forme (`format-toolbar`)

---

## Explication du développement à réaliser

Aujourd'hui, l'éditeur de note riche (`RichTextEditor`) laisse l'utilisateur mettre en forme
son texte (gras, italique, souligné, taille/titres, listes, couleur), insérer des médias
(image, vidéo) et des liens, saisir librement du texte, et éditer la structure des blocs
(Entrée pour scinder, Retour arrière pour fusionner). Chaque geste transforme le **modèle de
document** (le tableau `blocks`, source de vérité — cf. `document.model.ts`) qui est ensuite
re-rendu dans la zone `contenteditable`. **Aucun moyen n'existe pour revenir en arrière** après
une action malencontreuse : ni bouton dédié, ni prise en charge fiable de l'annulation.

On veut offrir un **historique d'édition** propre à l'éditeur, piloté par **deux boutons dans
la barre de mise en forme** : un bouton **« Annuler » (undo)** et un bouton **« Rétablir »
(redo)**. Le bouton *annuler* ramène le document à son état précédent ; le bouton *rétablir*
refait une action qui vient d'être annulée. C'est le comportement classique d'un éditeur : une
pile d'états passés (annulables) et une pile d'états futurs (rétablissables), gérées au niveau
du **modèle** (et donc cohérentes avec l'affichage).

Les deux boutons **reflètent visuellement leur disponibilité** (état actif/inactif, sur le même
modèle que la classe `.active` déjà portée par les boutons de marques) :
- Le bouton *annuler* est **inactif (grisé)** tant qu'aucune action annulable n'a été faite
  dans l'éditeur, et devient **actif** dès qu'au moins une action annulable a été effectuée.
- Le bouton *rétablir* est **inactif** par défaut et devient **actif** dès qu'on a annulé
  quelque chose que l'on peut rétablir. Toute **nouvelle action** effectuée après une
  annulation **vide la pile de rétablissement** (le bouton *rétablir* redevient inactif) —
  comportement standard.

### Ce qui compte comme un « pas » d'annulation (granularité — D1/D2)

Un appui sur *annuler* défait **une action** parmi :
- une **commande** de mise en forme ou de structure (marque gras/italique/souligné, couleur,
  taille/titre, liste, insertion image/vidéo/lien, scission par Entrée, fusion par Retour
  arrière) : chaque commande = **un pas** ;
- une **salve de saisie libre au clavier** : la frappe de texte **est annulable** et se
  regroupe en **un pas par mot / par pause de frappe** (on n'annule pas caractère par
  caractère). Concrètement, une suite de frappes est **coalescée** en un seul pas d'historique,
  la coupure se faisant sur une séparation de mot (espace, ponctuation) ou une pause de frappe.

### Sélection restaurée (D3)

Chaque pas d'historique **mémorise la sélection/curseur** associée à l'état. Après *annuler* ou
*rétablir*, l'éditeur restaure la **sélection telle qu'elle était** pour l'état ainsi rétabli,
afin que l'utilisateur reprenne l'édition au bon endroit.

### Cohérence d'affichage

L'historique vit **dans l'éditeur riche**, sur le modèle qui est déjà sa source de vérité.
Après une annulation ou un rétablissement, l'éditeur réutilise le **même cycle** que n'importe
quelle commande : il **re-rend** le document, **restaure le curseur/la sélection** mémorisé(e),
puis **émet** le nouveau modèle vers l'écran parent (`blocksChange` → `NoteEditor`), afin que la
sauvegarde reflète l'état courant. Il n'y a donc jamais d'écart entre ce qui est affiché et ce
qui sera sauvegardé.

### Déclenchement : boutons uniquement (D4)

Dans cette version, l'annulation et le rétablissement sont déclenchés **uniquement par les deux
boutons** de la barre. **Aucun raccourci clavier** (`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`) n'est
branché sur cet historique. Voir la limitation connue **L1** (risque de l'undo natif du
navigateur) en fin de document.

### Ce que ça change concrètement

- **Barre de mise en forme** : deux boutons supplémentaires, *annuler* et *rétablir*, avec un
  `title` et un `aria-label` explicites, chacun portant un état **actif/inactif**.
- **Éditeur** : mise en place d'un **historique** du modèle (pile « passé » + pile « futur »),
  chaque pas mémorisant l'état du document **et** la sélection associée. Chaque action annulable
  empile l'état ; *annuler* dépile vers le futur, *rétablir* re-dépile vers le passé.
- **Actions concernées** : les commandes (marques, couleur, taille/titre, listes, insertion
  image/vidéo/lien, scission/fusion de blocs) **et la saisie libre** de texte (regroupée par
  mot/pause).
- **Cohérence d'affichage** : annuler/rétablir passent par le même cycle *re-render +
  restauration de sélection + `blocksChange.emit`* que les autres commandes.

---

## Périmètre

### Inclus dans ce lot

- Ajout des boutons **« annuler »** et **« rétablir »** dans la barre de mise en forme, avec état
  actif/inactif (modèle des `.active` existants).
- Gestion d'un **historique** du modèle de document dans `RichTextEditor` (piles passé/futur),
  chaque pas mémorisant l'**état du document** et la **sélection** associée.
- **Activation/désactivation** visuelle des deux boutons selon l'état de l'historique
  (undo actif s'il y a un passé ; redo actif s'il y a un futur).
- **Invalidation** de la pile de rétablissement dès qu'une nouvelle action est effectuée après
  une annulation.
- Prise en charge de l'annulation/rétablissement des **commandes de mise en forme et de
  structure** : marques (gras/italique/souligné), couleur, taille/titre, listes, insertion
  image/vidéo/lien, scission (Entrée) et fusion (Retour arrière) de blocs.
- Prise en charge de l'annulation/rétablissement de la **saisie libre de texte**, regroupée en
  un pas **par mot / par pause de frappe** (granularité D1).
- **Restauration de la sélection** mémorisée à chaque annuler/rétablir (D3).
- **Bornage** de l'historique à environ **100 pas** : au-delà, les pas les plus anciens sont
  éjectés (D6).
- Après annuler/rétablir : **re-render** de la zone d'édition, **restauration** de la sélection,
  et **émission** du modèle courant vers le parent (`blocksChange`).

### Hors périmètre (reporté)

- **Raccourcis clavier** `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` branchés sur l'historique :
  **non** dans cette version (D4). Undo/redo seulement par les boutons.
- **Neutralisation de l'annulation native** du `contenteditable` : non traitée dans ce lot ;
  documentée comme **limitation connue L1** (voir ci-dessous), sans action côté specs.
- **Historique persistant** : l'historique est **en mémoire** pour la session d'édition en
  cours ; il n'est **pas** sauvegardé avec la note et est **réinitialisé** au (re)chargement de
  la note (hypothèse **H1**, D7).
- **Historique du titre et de la catégorie** de la note (champs de `NoteEditor`) : hors
  périmètre — l'historique ne couvre que le **corps** (les `blocks`) géré par `RichTextEditor`
  (D5).
- Historique **partagé** entre plusieurs notes ou entre sessions ; undo « collaboratif ».
- Cas limites de coalescence fine (IME, glisser-déposer, collage vs frappe) au-delà de la règle
  « un pas par mot/pause » : hors périmètre.

---

## User Stories

### US1 — Annuler la dernière action

**En tant qu'**utilisateur rédigeant une note, **je veux** un bouton « annuler » dans la barre
de mise en forme **afin de** revenir à l'état précédent après une action malencontreuse.

**Critères d'acceptation :**
- Un bouton « annuler » est présent dans la barre de mise en forme, avec un `title` et un
  `aria-label` explicites (ex. « Annuler »).
- Un appui sur ce bouton restaure le document tel qu'il était **avant la dernière action
  annulable**, puis re-rend la zone d'édition et émet le modèle vers le parent (`blocksChange`).
- Une **action annulable** est soit une commande (marque, couleur, taille/titre, liste,
  insertion image/vidéo/lien, scission/fusion de blocs), soit une **salve de saisie libre**
  regroupée par mot/pause (D1/D2).
- La **sélection mémorisée** pour l'état restauré est réappliquée (le curseur revient à
  l'endroit correspondant — D3).
- Plusieurs appuis successifs remontent l'historique action par action, jusqu'à l'état initial
  (dans la limite du bornage, cf. D6/US6).

### US2 — Bouton « annuler » actif seulement quand il y a quelque chose à annuler

**En tant qu'**utilisateur, **je veux** que le bouton « annuler » soit visiblement inactif tant
que rien n'a été fait **afin de** savoir d'un coup d'œil s'il y a quelque chose à annuler.

**Critères d'acceptation :**
- À l'ouverture d'une note (ou d'une note vierge), le bouton « annuler » est **inactif**
  (grisé) : aucune action annulable n'a encore eu lieu (historique de passé vide).
- Dès qu'une action annulable (commande ou salve de saisie) est effectuée dans l'éditeur, le
  bouton « annuler » devient **actif**.
- Quand l'historique est entièrement remonté (plus rien à annuler), le bouton redevient
  **inactif**.
- L'état actif/inactif s'appuie sur le même mécanisme visuel que la classe `.active` des autres
  boutons de la barre. Un bouton inactif ne déclenche aucune action au clic.

### US3 — Rétablir une action annulée

**En tant qu'**utilisateur, **je veux** un bouton « rétablir » dans la barre de mise en forme
**afin de** refaire une action que je viens d'annuler par erreur.

**Critères d'acceptation :**
- Un bouton « rétablir » est présent dans la barre de mise en forme, avec un `title` et un
  `aria-label` explicites (ex. « Rétablir »).
- Après une (ou plusieurs) annulation(s), un appui sur « rétablir » ré-applique la prochaine
  action annulée, puis re-rend et émet le modèle vers le parent.
- La **sélection mémorisée** pour l'état rétabli est réappliquée (D3).
- Plusieurs appuis successifs redescendent l'historique action par action.

### US4 — Bouton « rétablir » actif seulement après une annulation

**En tant qu'**utilisateur, **je veux** que le bouton « rétablir » soit inactif tant que je n'ai
rien annulé **afin de** comprendre quand il est pertinent.

**Critères d'acceptation :**
- Par défaut (aucune annulation en cours), le bouton « rétablir » est **inactif** (pile de futur
  vide).
- Dès qu'au moins une action a été annulée et peut être rétablie, le bouton devient **actif**.
- Toute **nouvelle action** effectuée après une annulation **vide la pile de rétablissement** :
  le bouton « rétablir » redevient **inactif**.
- Un bouton inactif ne déclenche aucune action au clic.

### US5 — Annuler/rétablir garde l'affichage et le modèle cohérents

**En tant qu'**utilisateur, **je veux** que l'annulation/rétablissement remette l'affichage
exactement dans l'état correspondant **afin de** ne jamais voir un texte affiché différent de
ce qui sera sauvegardé.

**Critères d'acceptation :**
- Après annuler/rétablir, le contenu affiché dans la zone d'édition correspond **exactement**
  au modèle restauré (pas de désynchronisation DOM/modèle).
- Le modèle restauré est **émis** vers l'écran parent (`blocksChange`), de sorte qu'une
  sauvegarde immédiate enregistre l'état visible.
- Annuler/rétablir réutilisent le même cycle *re-render + restauration de sélection + émission*
  que les commandes existantes.

### US6 — Historique borné et réinitialisé par note

**En tant qu'**utilisateur, **je veux** que l'historique reste raisonnable et propre à la note
en cours **afin de** ne pas consommer de mémoire à l'infini ni mélanger l'historique d'une note
à l'autre.

**Critères d'acceptation :**
- L'historique conserve au plus **~100 pas** ; au-delà, les pas les plus anciens sont **éjectés**
  (on ne peut plus remonter au-delà de cette fenêtre) — D6.
- L'historique est **en mémoire** uniquement ; il n'est **pas** persisté avec la note.
- Au **(re)chargement** d'une note (ouverture, passage création → édition), l'historique est
  **réinitialisé** : les deux boutons repartent inactifs (H1/D7).

---

## Décisions arrêtées (D1–D8)

> Toutes les décisions ci-dessous sont **tranchées** (arbitrage utilisateur du 2026-09-20).

- **D1 — Granularité = « commande » + frappe groupée.** Un pas = une commande de mise en
  forme/structure, ou une salve de saisie libre regroupée **par mot / par pause de frappe**
  (pas d'annulation caractère par caractère).
- **D2 — La saisie libre EST annulable.** Le texte tapé au clavier est capturé dans
  l'historique, regroupé selon la granularité D1.
- **D3 — Sélection mémorisée par pas.** Chaque pas d'historique enregistre la sélection/curseur ;
  elle est restaurée à l'annuler/rétablir.
- **D4 — Boutons uniquement.** Pas de raccourcis clavier `Ctrl+Z` / `Ctrl+Y` dans cette version.
  L'undo natif du `contenteditable` n'est **pas** neutralisé (voir limitation **L1**).
- **D5 — Corps seul.** L'historique couvre uniquement le corps (`blocks`) géré par
  `RichTextEditor` ; le titre et la catégorie (dans `NoteEditor`) sont hors périmètre.
- **D6 — Historique borné (~100 pas).** Au-delà, éjection des pas les plus anciens.
- **D7 — Réinitialisation par note.** Historique vidé au (re)chargement d'une note ; non persisté
  (cf. H1).
- **D8 — Deux boutons dans la barre, état actif/inactif.** Undo + redo dans la barre de
  l'éditeur, avec état actif/inactif sur le modèle des `.active` existants. Placement précis et
  icônes (ex. ↶ / ↷) **calés sur la maquette à l'étape approche** ; hypothèse par défaut :
  un **groupe dédié** dans la barre d'outils (voir H2).

---

## Hypothèses retenues

- **H1** — Historique **en mémoire**, propre à la session d'édition en cours ; non persisté avec
  la note, **réinitialisé** au (re)chargement (D7).
- **H2** — Les deux boutons sont regroupés dans un **groupe dédié** de la barre d'outils ;
  position exacte et icônes finalisées à l'étape approche/maquette (D8), sans bloquer les specs.
- **H3** — Annuler/rétablir réutilisent le **même cycle** que les commandes existantes
  (re-render via `paint`, restauration via `document-selection`, `blocksChange.emit`), pour
  garantir la cohérence DOM/modèle décrite en US5.

## Limitations connues

- **L1 — Undo natif du navigateur (risque résiduel accepté).** Comme cette version ne branche
  **aucun** raccourci clavier et **ne neutralise pas** l'annulation native du `contenteditable`,
  un `Ctrl+Z` (ou geste d'annulation natif du navigateur/OS) déclenché par l'utilisateur agit
  **sur le DOM** sans passer par notre historique de modèle, et peut donc **désynchroniser le
  DOM et le modèle**. Ce risque est **documenté et accepté** pour cette version : il n'est **pas
  traité** ici (neutralisation et prise en charge des raccourcis reportées à un lot ultérieur —
  cf. D4 et « Hors périmètre »).
