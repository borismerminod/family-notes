# Plan de Test (TDD) — Éditeur « document riche » (`NoteEditor`)

> Réécrit le 2026-09-10 après le pivot **document riche unique** (cf.
> `PLAN_PIVOT_DOCUMENT_RICHE.md`), puis restreint : la **barre d'outils** (mise en forme +
> insertion média) est déplacée dans un **composant séparé** avec ses propres tests
> (cf. `PLAN_TESTS_EDITOR_TOOLBAR.md`, à venir).
> Approche boîte noire / TDD, conventions du skill `plan_test`.

## 1. Objet testé

L'écran d'édition/création d'une note dont le contenu est **un document HTML unique**
(`Note.content: string`), rendu et édité **sur place** dans une zone `contenteditable`.

**Entourage :** titre, catégorie, enregistrement (bouton), annulation, états chargement /
erreurs. **Cœur ajouté :** rendu direct du contenu riche + édition sur place.

**Hors périmètre de CE composant :** la **barre d'outils** (gras / italique / souligné,
couleur, taille, listes) et l'**insertion média** (image par lien/directe, vidéo incrustée) —
elles vivront dans un composant dédié qui agira sur le même contenu.

## 2. Doublures

- **Source de données** (`NotesService`) : `getNoteById`, `createNote`, `updateNote`.
- **Contexte de route** (`ActivatedRoute`) : id présent → édition, absent → création.
- **Navigation** (`Router.navigate`) : espionnée (retour `/notes`).

## 3. Contrat DOM

`.editor-title`, `.editor-category`, **`.editor-content`** (le `contenteditable`),
`.btn-save`, `.btn-cancel`, `.spinner`, `.not-found`.

## 4. Décisions de conception

- **D1 — Contenu = HTML unique** (`Note.content: string`), stocké tel quel (colonne `TEXT`).
- **D2 — Édition** : `.editor-content` est `contenteditable` ; à chaque saisie, `innerHTML` →
  `content`. Rendu = HTML affiché formaté (via `DomSanitizer`).
- **D3 — Enregistrement / navigation / annulation / états** : retour `/notes` au succès,
  pessimiste à l'échec, spinner pendant le chargement, « note introuvable » si id inconnu.

## 5. Cas de test

### Groupe 1 — Chargement en mode édition
- **T1.1** ouverture avec id → `getNoteById(id)`.
- **T1.2** titre et catégorie affichés.
- **T1.3** le contenu HTML chargé est **rendu** dans `.editor-content`.

### Groupe 2 — Chargement en mode création
- **T2.1** sans id → `getNoteById` non appelé.
- **T2.2** vierge : titre vide, catégorie vide, `.editor-content` vide.

### Groupe 3 — États de chargement / erreurs
- **T3.1** spinner pendant l'attente ; **T3.2** spinner masqué après chargement ;
  **T3.3** id inconnu → `.not-found` (pas d'éditeur) ; **T3.4** source en échec → fin propre.

### Groupe 4 — Métadonnées
- **T4.1** titre modifié reflété à l'enregistrement ; **T4.2** catégorie idem.

### Groupe 5 — Rendu & édition du contenu
- **T5.1** le contenu chargé est visible/éditable dans `.editor-content`.
- **T5.2** éditer `.editor-content` met à jour `content` (reflété à l'enregistrement).

### Groupe 6 — Enregistrement
- **T6.1** édition → `updateNote({ id, …, content })` (pas `createNote`).
- **T6.2** création → `createNote({ …, content })` (pas `updateNote`).
- **T6.3** succès → navigation `/notes`.
- **T6.4** échec → pas de navigation, l'écran reste, pas de plantage.

### Groupe 7 — Annulation
- **T7.1** `.btn-cancel` → `/notes` sans créer ni mettre à jour.

## 6. Déplacé vers le composant « barre d'outils » (hors ce spec)

Mise en forme (gras / italique / souligné via `execCommand`), insertion d'image (lien /
directe), insertion de vidéo incrustée (lien / directe). Ces cas seront écrits dans le plan
et le spec du composant barre d'outils.

## 7. Concrétisation

Spec : `frontend/src/app/note-editor/note-editor.spec.ts` (Vitest). Échantillons typés par un
contrat local `{ id, title, category, content, updatedAt }` (découplé du modèle tant que le
pivot data n'est pas fait). Implémentation ensuite via le skill `dev_par_groupes`.
