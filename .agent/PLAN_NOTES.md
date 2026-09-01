# Plan de Développement : Module "Notes" (Family-notes)

## 1. Vision et Objectifs
Le module "Notes" est le cœur de l'application. Il doit offrir une expérience de prise de notes fluide, riche et résiliente (fonctionne hors-ligne), avec une structure de données prête pour la synchronisation future via CRDT.

## 2. Spécifications Fonctionnelles

### A. Page de Gestion (Liste des Notes)
Une vue de type "Dashboard" pour organiser et retrouver rapidement ses pensées.
*   **Affichage :** Liste de cartes (Cards) avec aperçu.
*   **Informations par note :** Titre, Catégorie (avec code couleur), Date de modification, Aperçu textuel.
*   **Recherche :** Barre de recherche globale (titre et contenu).
*   **Filtrage :** Filtre par catégorie (menu déroulant ou sélection rapide).
*   **Actions (CRUD) :**
    *   **Créer :** Bouton d'ajout rapide.
    *   **Lire :** Sélection pour l'édition.
    *   **Modifier :** Accès direct à l'éditeur.
    *   **Supprimer :** Suppression logique (Soft Delete) pour permettre la synchronisation ultérieure.

### B. Page de l'Éditeur (Rédaction Riche)
Une interface immersive pour la création de contenu multimédia.
*   **En-tête :**
    *   Champ Titre (Style épuré).
    *   Sélecteur de Catégorie : Liste des catégories existantes + option "Nouvelle catégorie".
*   **Éditeur de Texte Riche (Rich Text) :**
    *   **Style de texte :** Gras, Italique, Souligné.
    *   **Typographie :** Choix de la taille de la police, Choix de la couleur du texte.
    *   **Structures :** Listes à puces (unordered), Listes numérotées (ordered).
    *   **Multimédia & Liens :**
        *   Insertion d'images (depuis la galerie ou caméra).
        *   Insertion de liens hypertexte.
        *   Insertion de vidéos (via URL/Embed).

---

## 3. Architecture Technique & Stockage

### A. Stratégie de Stockage (Hybride)
Pour optimiser les performances et la stabilité du téléphone :
1.  **SQLite (Base de données structurée) :** Stockage de toute la logique et des données légères.
    *   Titres, contenus (format Delta/JSON), relations, catégories, timestamps, états de suppression.
2.  **File System (Système de fichiers du téléphone) :** Stockage des fichiers lourds.
    *   Images, fichiers vidéo.
    *   *Note : La base de données SQLite ne stockera que le chemin (path) vers ces fichiers.*

### B. Modèle de Données (Schéma SQLite)

#### Table `categories`
- `id`: UUID (Primary Key)
- `name`: TEXT (Unique)
- `color`: TEXT (Hex code)
- `updated_at`: INTEGER (Timestamp)

#### Table `notes`
- `id`: UUID (Primary Key)
- `title`: TEXT
- `content`: TEXT (Format JSON/Delta pour le rich text)
- `category_id`: UUID (Foreign Key -> categories.id)
- `created_at`: INTEGER (Timestamp)
- `updated_at`: INTEGER (Timestamp)
- `is_deleted`: BOOLEAN (Pour la gestion de la synchronisation CRDT)

#### Table `media_assets` (Gestion des fichiers)
- `id`: UUID (Primary Key)
- `note_id`: UUID (Foreign Key -> notes.id)
- `file_path`: TEXT (Chemin local vers le fichier sur le téléphone)
- `file_type`: TEXT (image, video)
- `created_at`: INTEGER (Timestamp)

### C. Stack Technologique
*   **Framework :** Angular (Architecture modulaire, RxJS pour la réactivité).
*   **Mobile :** Capacitor (Accès natif au FileSystem et Camera).
*   **Base de données :** `capacitor-sqlite`.
*   **Moteur de texte riche :** Quill.js ou Tiptap (pour la gestion du formatage et du format JSON/Delta).

---

## 4. Phases de Développement

### Phase 1 : Fondations & Data
- Configuration de SQLite et des services de base.
- Création des modèles de données (Interfaces TypeScript).
- Implémentation du `NotesService` (CRUD de base sur SQLite).

### Phase 2 : Interface de Liste
- Développement de la `NotesListComponent`.
- Implémentation du système de filtrage par catégorie.
- Mise en place de la barre de recherche.

### Phase 3 : L'Éditeur de Texte
- Intégration de l'éditeur riche (Quill/Tiptap).
- Gestion du sélecteur de catégorie dynamique.
- Mise en place de la barre d'outils (Style, Listes, Couleurs).

### Phase 4 : Multimédia & Fichiers
- Intégration de la caméra/galerie via Capacitor.
- Logique d'enregistrement des fichiers sur le disque et liaison dans SQLite.
- Gestion de l'affichage des images et vidéos dans l'éditeur.

### Phase 5 : Finalisation & UX
- Animations de transition.
- Gestion des états "Hors-ligne".
- Test de performance et robustesse.
