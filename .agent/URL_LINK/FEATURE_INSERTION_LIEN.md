# Feature — Insertion d'un lien dans une note

**Date :** 2026-09-18
**Statut :** brouillon — à valider
**Écran concerné :** éditeur de note riche (`rich-text-editor`), barre de mise en forme (`format-toolbar`)

---

## Explication du développement à réaliser

Aujourd'hui, l'éditeur de note riche permet d'insérer des **images** et des **vidéos** :
un bouton dédié dans la barre de mise en forme ouvre une petite fenêtre (popup) dans
laquelle on colle un lien, puis on insère le média dans la note.

On veut offrir le même geste pour un **lien hypertexte** (URL) : ajouter un **nouveau bouton
« lien »** dans la barre de mise en forme, à côté des boutons image et vidéo. Un appui sur ce
bouton ouvre, **sous la barre d'outils, une barre d'insertion pleine largeur** — exactement
comme la barre vidéo actuelle : un champ de saisie, un bouton « Insérer… » à droite, et une
croix de fermeture. Contrairement à une image ou une vidéo — qui sont des éléments autonomes
sans texte —, un lien a besoin d'un **texte affiché** (le libellé sur lequel on clique). Cette
barre porte donc **deux champs** au lieu d'un seul : l'**URL** de destination et le **libellé**
à afficher, suivis du bouton **« Insérer le lien »** et de la croix. À la validation, un lien
cliquable est **inséré à l'emplacement du curseur** dans le texte de la note.

> Repère visuel : la barre vidéo actuelle affiche `[ Lien de la vidéo (YouTube, Vimeo…) ]
> [ Insérer la vidéo ]  ✕`. La barre lien reprend la même disposition avec un champ de plus :
> `[ Lien (https://…) ] [ Texte à afficher ] [ Insérer le lien ]  ✕`.

Dans la note, le lien apparaît visuellement comme un lien (souligné / colorisé selon le style
de l'app). Lorsqu'on **touche un lien** (mode consultation de la note), l'URL s'ouvre dans le
**navigateur du système, en dehors de l'application** — comportement usuel d'une app mobile,
pour ne pas sortir l'utilisateur de son contexte d'édition.

Le lien n'est pas un bloc à part (à la différence de l'image et de la vidéo) : c'est un
**enrichissement inline du texte**, au même titre que le gras, l'italique ou la couleur. Il
s'inscrit donc naturellement dans le modèle de document existant (une **marque** portée sur un
intervalle de texte, cf. `document.model.ts`), et non comme un nouveau type de bloc.

### Ce que ça change concrètement

- **Barre de mise en forme** : un bouton « lien » supplémentaire dans le groupe des boutons
  d'insertion (image / vidéo).
- **Barre d'insertion de lien** : barre pleine largeur sous la barre d'outils (même modèle que
  la barre vidéo), avec deux champs (URL + libellé), un bouton « Insérer le lien » et une croix
  de fermeture.
- **Éditeur** : à l'insertion, le libellé est ajouté au texte du bloc courant à la position du
  curseur, porteur d'une marque de lien (URL en valeur).
- **Rendu / affichage** : le texte porteur d'une marque de lien est affiché comme un lien
  cliquable.
- **Ouverture** : au clic/tap sur un lien en consultation, ouverture de l'URL dans le
  navigateur externe du système.

---

## Périmètre

### Inclus dans ce lot

- Ajout du bouton « lien » dans la barre de mise en forme, à côté de image / vidéo.
- Ouverture d'une popup d'insertion de lien avec deux champs : **URL** et **libellé**.
- Insertion du lien (libellé cliquable) à l'emplacement du curseur dans la note.
- Affichage du lien comme un élément cliquable dans la note.
- Ouverture de l'URL dans le **navigateur externe** au tap sur un lien en consultation.
- Persistance du lien avec la note (sauvegarde / rechargement conservent le lien).

### Hors périmètre (reporté)

- **Modifier / éditer** un lien déjà posé (changer l'URL ou le libellé via une UI dédiée) :
  non prévu. Le **retrait** d'un lien se fait naturellement en **effaçant le texte** du lien
  dans l'éditeur (retour arrière), comme pour n'importe quel texte formaté — aucun bouton
  « retirer le lien » n'est prévu dans ce lot.
- Prévisualisation enrichie du lien (vignette / titre de la page distante).
- Détection automatique d'une URL tapée au fil de l'eau (auto-linkification).
- Validation « métier » poussée de l'URL (vérification que la page existe, etc.).
- Gestion de liens internes (renvoi vers une autre note, une date du calendrier…).

---

## User Stories

### US1 — Ouvrir la fenêtre d'insertion de lien

**En tant qu'**utilisateur rédigeant une note, **je veux** un bouton « lien » dans la barre de
mise en forme **afin de** déclencher l'insertion d'un lien comme je le fais déjà pour une image
ou une vidéo.

**Critères d'acceptation :**
- Un bouton « lien » est présent dans la barre de mise en forme, dans le groupe des boutons
  d'insertion (près de image / vidéo), avec un `title` et un `aria-label` explicites.
- Un appui sur ce bouton ouvre la barre d'insertion de lien, **sous la barre d'outils, en
  pleine largeur**, sur le même modèle que la barre vidéo existante.
- La barre affiche deux champs (URL + libellé), un bouton « Insérer le lien » à droite, et une
  croix de fermeture.
- La croix ferme la barre sans rien insérer ; à la fermeture, les champs sont réinitialisés.

### US2 — Saisir l'URL et le libellé du lien

**En tant qu'**utilisateur, **je veux** saisir dans la fenêtre l'adresse (URL) et le texte à
afficher **afin de** définir où mène le lien et quel mot/phrase sera cliquable.

**Critères d'acceptation :**
- La popup contient deux champs distincts : **URL** (avec un placeholder du type
  « Lien (https://…) ») et **libellé** (« Texte à afficher »).
- Le bouton « Insérer » ne produit rien si l'URL est vide (no-op, comme pour l'insertion
  d'image par URL vide).
- Si le libellé est laissé vide, le texte affiché du lien **retombe sur l'URL** elle-même
  (l'URL sert alors de libellé).
- Les champs saisis sont nettoyés des espaces superflus (trim) avant insertion.

### US3 — Insérer le lien dans la note

**En tant qu'**utilisateur, **je veux** qu'en validant, le lien s'insère à l'endroit où se
trouve mon curseur **afin de** placer le lien exactement dans mon texte.

**Critères d'acceptation :**
- À la validation, le **libellé** est inséré dans le texte du bloc courant, à la position du
  curseur, et porte l'information de lien (l'URL).
- Le texte inséré apparaît immédiatement stylé comme un lien (distinct du texte normal).
- Après insertion, la popup se ferme et ses champs sont réinitialisés.
- Le curseur se replace de façon cohérente après le libellé inséré (la frappe se poursuit
  hors du lien).
- Si aucun bloc/curseur n'est actif, l'insertion se fait de façon cohérente avec le
  comportement d'insertion existant (fin de document, à l'instar des médias).

### US4 — Voir et reconnaître un lien dans la note

**En tant qu'**utilisateur consultant une note, **je veux** que les liens soient visuellement
identifiables **afin de** savoir sur quoi je peux cliquer.

**Critères d'acceptation :**
- Le texte porteur d'un lien est affiché avec un style de lien (p. ex. souligné et/ou coloré,
  cohérent avec le thème clair de l'app).
- Le style de lien se combine correctement avec les autres marques (gras, italique, couleur,
  taille) sur le même texte.
- Le lien est conservé à l'identique après sauvegarde puis rechargement de la note.

### US5 — Ouvrir un lien dans le navigateur externe

**En tant qu'**utilisateur, **je veux** qu'un appui sur un lien ouvre la page dans le
navigateur de mon téléphone **afin de** consulter la ressource sans perdre ma note.

**Critères d'acceptation :**
- Un tap/clic sur un lien en consultation ouvre l'URL dans le **navigateur externe** du
  système (hors de l'application).
- L'application reste ouverte en arrière-plan ; revenir en arrière ramène sur la note.
- En cours d'**édition**, le tap sur un lien ne déclenche pas l'ouverture (on doit pouvoir
  placer le curseur dans/autour du lien pour l'effacer) — l'ouverture ne concerne que la
  consultation.

### US6 — Retirer un lien en effaçant son texte

**En tant qu'**utilisateur, **je veux** pouvoir supprimer un lien simplement en effaçant son
texte dans l'éditeur **afin de** ne pas avoir à chercher une action dédiée.

**Critères d'acceptation :**
- Effacer (retour arrière / suppression) le texte du lien supprime aussi le lien : plus aucun
  résidu de lien ne subsiste sur du texte vide.
- Effacer une partie du texte du lien conserve le lien sur la portion restante.
- Aucun bouton « retirer le lien » n'est requis dans ce lot.

---

## Questions ouvertes / hypothèses

- **Ouverture externe (technique)** : l'ouverture « hors de l'application » suppose un plugin
  Capacitor dédié (p. ex. `@capacitor/browser` ou `@capacitor/app`), **non présent** dans les
  dépendances actuelles → une **dépendance à ajouter**. En contexte purement web (dev), le
  repli naturel est un `target="_blank"`. À confirmer au moment de l'implémentation.
- **Modèle de données** : hypothèse retenue — le lien est une **marque inline** (nouveau
  `MarkType`, l'URL portée par le champ `value`), et non un bloc. Cela impacte le modèle, le
  rendu (`<a href>`), l'analyse (parse des balises `<a>`) et la barre d'outils, mais reste
  aligné sur l'existant (couleur/taille). À trancher définitivement à l'étape `plan_test`.
- **Sécurité des URL** : faut-il restreindre les schémas autorisés (http/https uniquement,
  refus de `javascript:` …) ? Proposé comme garde-fou minimal, à confirmer.
- **Style visuel exact** du lien (couleur, soulignement) : à caler sur la maquette / le thème.
