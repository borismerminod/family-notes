# Plan de Développement : Module "Notes" (Family-notes) - [Version Mise à Jour]

> ⚠️ **Mise à jour architecture (2026-09-10) — les blocs sont abandonnés.**
> Le contenu d'une note n'est plus un tableau de blocs JSON mais un **document HTML unique**
> (`Note.content: string`), édité dans une seule zone `contenteditable`. Toutes les sections
> ci-dessous mentionnant l'« architecture par blocs », le « tableau d'objets JSON », les
> `NoteBlock` / UUID par bloc et la synchro **CRDT par bloc** sont **caduques**.
> Référence : [`PLAN_PIVOT_DOCUMENT_RICHE.md`](PLAN_PIVOT_DOCUMENT_RICHE.md). La synchro
> multi-appareils éventuelle se fera au niveau du document HTML entier, pas par bloc.

## SQL Schema
Le schéma de la base de données est défini dans `scripts/schema_notes.sql`.

## 1. Vision et Objectifs
Le module "Notes" est le cœur de l'application. Il doit offrir une expérience de prise de notes fluide, riche et résiliente (fonctionne hors-ligne), basée sur une **architecture par blocs (Block-based Editor)**. Cette structure est choisie pour garantir une synchronisation future via **CRDT** (chaque bloc ayant un ID unique).

## 2. Spécifications Fonctionnelles

### A. Page de Gestion (Liste des Notes)
*(Inchangée - Voir version précédente)*
*   Affichage en cartes, recherche globale, filtrage par catégorie.

### B. Page de l'Éditeur (Système de Blocs Intelligents)
L'interface est composée de blocs indépendants et manipulables.

#### 1. En-tête (Header)
* **Titre :** Champ de saisie épuré et immersif.
* **Gestion des Catégories :** 
    * Champ de saisie intelligent (Autocomplete).
    * **Comportement dynamique :** Si l'utilisateur saisit une nouvelle catégorie, elle est automatiquement créée et enregistrée en base de données.

#### 2. Zone de Contenu (Le Canvas)
L'utilisateur construit sa note en empilant des blocs de différents types :
* **Blocs Texte (Paragraphes / Titres):** 
    * Saisie directe.
    * **Formatage Contextuel:** Lors de la sélection d'un texte, une barre d'outils flottante permet d'appliquer:
        * **Style:** Gras, Italique, Souligné.
        * **Taille:** Choix de la taille de la police (Petite, Normale, Grande, Titre).
        * **Couleur:** Application d'une couleur à partir d'une palette prédéfinie (ex: 8 couleurs de base).
    * **Détection automatique:** Un lien URL collé est automatiquement transformé en lien cliquable (Chip). Un lien vidéo (YouTube/Vimeo) est transformé en lecteur vidéo intégré (Embed).
* **Blocs Multimédia:**
    * **Images:** Ajout via bouton (Galerie/Caméra) ou via **Copier-Coller** direct de l'image.
    * **Vidéos:** Ajout via lien ou via fichier local.

#### 3. Interactions Utilisateur
* **Organisation:** Possibilité de déplacer les blocs par Drag & Drop.
* **Insertion rapide:** Boutons "+" pour ajouter un nouveau bloc (Texte, Image, Vidéo) à la suite.

---

## 3. Architecture Technique & Stockage

### A. Stratégie de Stockage (Hybride)
1.  **SQLite (Base de données structurée):** 
    *   Stockage de la structure de la note sous forme d'un **tableau d'objets JSON** (un objet par bloc).
    *   Chaque bloc possède un `id` (UUID) unique pour la synchronisation.
    *   Stockage des métadonnées (titre, catégorie, ordre des blocs).
2.  **File System (Système de fichiers du téléphone):** 
    *   Stockage des fichiers lourds (images, vidéos) via Capacitor Filesystem.
    *   La base de données ne stocke que le chemin local (`file_path`).

### B. Modèle de Données (Schéma JSON par Note)
```json
[
  { "id": "uuid-1", "type": "heading", "content": "Titre", "style": { "size": "h1" } },
  { "id": "uuid-2", "type": "text", "content": "Texte avec <span style='color:#FF0000'>couleur</span>", "style": { "size": "normal" } },
  { "id": "uuid-3", "type": "image", "src": "path/to/img.jpg" },
  { "id": "uuid-4", "type": "video", "url": "https://youtube.com/..." }
]
```

### C. Stack Technologique
* **Framework:** Angular (Architecture modulaire, RxJS pour l'auto-sauvegarde).
* **Mobile:** Capacitor (Accès Camera, Filesystem, Clipboard).
* **Base de données:** `capacitor-sqlite`.

---

## 4. Phases de Développement

### Phase 1 : Fondations & Data
- [ ] Configuration de SQLite et des modèles TypeScript (`Note`, `NoteBlock`).
- [ ] Implémentation du `NotesService` (CRUD sur le tableau de blocs).
- [ ] Mise en place de l'auto-sauvegarde (Auto-save) avec debounce.

### Phase 2 : Structure de l'Éditeur
- [ ] Développement du composant `NoteEditor` (le Canvas).
- [ ] Implémentation du `BlockRenderer` (gestion dynamique des types de blocs).
- [ ] Développement du `CategoryPicker` (gestion de l'ajout automatique).

### Phase 3 : Édition de Texte & Styles
- [ ] Implémentation du composant de texte avec gestion de la sélection.
- [ ] Création de la barre d'outils flottante (Gras, Italique, Taille, Couleur).
- [ ] Développement du système de détection de liens et vidéos.

### Phase 4 : Multimédia & Copier-Coller
- [ ] Intégration de la gestion des images (Bouton + Interception du Clipboard).
- [ ] Intégration de la gestion des vidéos (Embed + Fichiers locaux).
- [ ] Gestion du stockage physique des fichiers via Capacitor.

### Phase 5 : Finalisation & UX
- [ ] Implémentation du Drag & Drop pour les blocs.
- [ ] Optimisation des performances de rendu.
- [ ] Tests de robustesse (mode hors-ligne, gestion des fichiers corrompus).