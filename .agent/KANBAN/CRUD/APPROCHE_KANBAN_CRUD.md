# Approche de développement — Kanban : gestion (CRUD) des tableaux

> **Date :** 2026-09-29 · **Révisé le :** 2026-10-07 · **Statut :** brouillon — à valider
> **SPEC :** `.agent/KANBAN/CRUD/FEATURE_KANBAN_CRUD.md` · **Maquette :** `MAQUETTE_KANBAN_LIST.html`
> **Docs de référence :** `.agent/PLAN_GLOBAL.md` §2.C, `.agent/DIAGRAMME_CLASSES_NOTES.md` §1–4,
> `.agent/MODELE_DONNEES_NOTES.md`
> **Code de référence :** `core/services/{sqlite-service,notes-service}.ts`, `note-list/`,
> `core/components/confirm-dialog/`, `app.routes.ts`

---

## 0. Décisions de cadrage (hypothèses de la SPEC tranchées — à valider)

| # | Sujet | Choix proposé |
|---|-------|---------------|
| D-K1 | H1 — attributs d'un kanban | Un identifiant, un nom et une date de dernière modification. **Pas de description.** La base garde aussi une date de création, non affichée. |
| D-K2 | H2 — formulaire | **Révisée le 2026-10-07 : pas de popup.** Le nom se saisit dans l'écran d'édition du tableau, qui porte un bouton d'enregistrement. Les écrans 2 et 3 de la maquette ne sont plus la cible. *(Choix initial du 2026-09-29 : une popup partagée création / renommage.)* |
| D-K3 | H3 — action « Modifier » | **Révisée le 2026-10-07 : aucune icône crayon.** Toucher la carte ouvre l'écran d'édition, qui est l'endroit du renommage. Seule la corbeille reste sur la carte. *(Choix initial : une icône crayon sur chaque carte.)* |
| D-K4 | H4 — unicité du nom | **Aucun contrôle** : deux kanbans peuvent porter le même nom. |
| D-K5 | H5 — point d'entrée | La **route `/kanban`** seulement ; pas de menu global dans ce lot. |
| D-K6 | Création de la table | La table est créée **au démarrage du service** si elle n'existe pas. Raison : la base de départ n'est copiée qu'au tout premier lancement, les installations existantes n'auraient donc jamais la table. |
| D-K7 | Mise à jour de la liste | **Après succès en base uniquement**, comme pour la suppression des notes. En cas d'échec, l'écran reste tel quel et un message s'affiche. |
| D-K8 | Affichage de la date | Même format que la page « Mes Notes ». Le libellé relatif de la maquette (« Modifié aujourd'hui / hier / le … ») est une **option** à confirmer (voir Lot 2). |
| D-K9 | Écran d'édition (US3) | **Report levé le 2026-10-07.** L'écran devient le **lot suivant**, dont US2 et US4 dépendent : c'est lui qui porte la saisie du nom et l'enregistrement. Ce lot ne livre que la **navigation** vers cet écran, depuis « + » et depuis une carte. Voir §5. |
| D-K10 | Nom d'un tableau neuf | « **Sans titre** » tant que l'utilisateur n'a rien saisi. Raison : le service refuse un nom vide, et une carte sans libellé serait illisible dans la liste. Aucune modification du service n'est donc nécessaire. |
| D-K11 | Moment de la création | Au **clic sur le bouton d'enregistrement** de l'écran d'édition, pas au clic sur « + ». Conséquence : toucher « + » n'écrit rien, et quitter l'écran sans enregistrer ne laisse aucun tableau fantôme. |
| D-K12 | Routes | `/kanban/new` pour un nouveau tableau, `/kanban/edit/:id` pour un tableau existant, par symétrie avec `/notes/new` et `/notes/edit/:id`. |

---

## 1. Diagramme de classes

> **Légende :** « EXISTANT » = réutilisé tel quel ; « À CRÉER » = nouveau code. `?` = optionnel.

```mermaid
classDiagram
    direction TB

    %% ---------- Modèle du domaine ----------
    class Kanban {
        <<interface — À CRÉER>>
        +string id
        +string name
        +string updatedAt
    }

    %% ---------- Services ----------
    class SqliteService {
        <<Injectable root — EXISTANT>>
        #SQLiteDBConnection db
        #Promise~void~ ready
        #runQuery(errorMessage, operation) Promise~T~
        #persist() Promise~void~
    }

    class KanbanService {
        <<Injectable root — À CRÉER>>
        -ensureSchema() Promise~void~
        -mapRowToKanban(row) Kanban
        +getAllKanbans() Promise~Kanban[]~
        +createKanban(name) Promise~Kanban~
        +renameKanban(id, name) Promise~Kanban~
        +deleteKanban(id) Promise~void~
    }

    %% ---------- Composants (UI) ----------
    class KanbanList {
        <<Component app-kanban-list — À CRÉER>>
        -KanbanService kanbanService
        -Router router
        +Signal~Kanban[]~ kanbans
        +Signal~boolean~ isLoading
        +Signal~boolean~ loadError
        +Signal~string~ actionError?
        +Signal~Kanban~ kanbanToDelete?
        +Signal~boolean~ confirmOpen
        +ngOnInit() void
        +loadKanbans() Promise~void~
        +onAddKanban() void
        +onOpenKanban(kanban) void
        +onDeleteKanban(kanban) void
        +onDeleteConfirmed(confirmed) Promise~void~
    }

    class ConfirmDialog {
        <<Component app-confirm-dialog — EXISTANT>>
        +InputSignal~string~ message
        +ModelSignal~boolean~ open
        +InputSignal~string~ confirmLabel
        +InputSignal~string~ cancelLabel
        +OutputEmitter~boolean~ answered
    }

    %% ---------- Relations ----------
    KanbanService --|> SqliteService : extends
    KanbanService ..> Kanban : produit / persiste

    KanbanList --> KanbanService : inject()
    KanbanList "1" *-- "1" ConfirmDialog : suppression
    KanbanList "1" o-- "0..*" Kanban : affiche
```

**Existant réutilisé :** `SqliteService` (connexion à la base, attente d'initialisation, gestion des
erreurs, sauvegarde web) et `ConfirmDialog` (sans modification).
**À créer :** le modèle `Kanban`, le service `KanbanService`, la page `KanbanList`, la route
`/kanban`, et le script de référence `scripts/schema_kanban.sql`.
La page ne porte **aucun formulaire** : depuis la révision du 2026-10-07 (D-K2), le nom se saisit
dans l'écran d'édition du tableau, que la liste se contente d'ouvrir. `createKanban` et
`renameKanban` restent dans le service, mais c'est cet écran qui les appellera, pas la liste.

### Table SQLite `kanbans` (à créer)

| Colonne | Type | Contrainte | Champ `Kanban` |
|---|---|---|---|
| `id` | TEXT | clé primaire | `id` |
| `name` | TEXT | obligatoire, non vide | `name` |
| `created_at` | TEXT | obligatoire, date ISO | — (non exposé) |
| `updated_at` | TEXT | obligatoire, date ISO | `updatedAt` |

Un index sur `updated_at` accélère le tri de la liste.

---

## 2. Lecture des relations

| Relation | Signification |
|---|---|
| `KanbanService` hérite de `SqliteService` | Même principe que `NotesService` : une seule base `family_notes`, chaque requête attend que la base soit prête, chaque écriture est sauvegardée. |
| `KanbanList` utilise `KanbanService` | La page passe par le service pour lire et écrire ; elle ne touche jamais la base directement. |
| `KanbanList` contient `ConfirmDialog` | Même popup de confirmation que pour les notes (US5). C'est la **seule** popup de la page depuis D-K2 révisée. |
| `KanbanList` utilise `Router` | La page ouvre l'écran d'édition : `/kanban/new` depuis « + », `/kanban/edit/:id` depuis une carte (D-K12). Elle ne crée ni ne renomme rien elle-même. |
| `KanbanList` affiche des `Kanban` | La page garde en mémoire la liste chargée et la met à jour après chaque opération réussie. |

---

## 3. Approche de développement

### Règle commune : validation du nom (US2, US4)

Le nom est **nettoyé des espaces en début et en fin** ; ceux à l'intérieur sont conservés. S'il est
vide après ce nettoyage, le service refuse d'écrire. C'est l'**écran d'édition** qui porte cette
règle côté interface depuis D-K2 révisée : la liste ne saisit plus aucun nom, et un tableau neuf
part de « Sans titre » (D-K10), de sorte qu'un nom vide ne remonte jamais jusqu'au service.

### Lot 1 — Modèle et persistance : `KanbanService` (US1, US2, US4, US5)

**Préparation de la table.** Au démarrage, le service attend que la connexion à la base soit prête,
puis crée la table `kanbans` et son index s'ils n'existent pas encore, et sauvegarde la base
(indispensable sur le web, sinon la table disparaît au rechargement). Toutes les autres opérations
attendent la fin de cette préparation. L'opération peut être rejouée à chaque lancement sans effet.
Si elle échoue, toutes les opérations échouent et la page affiche son état d'erreur.

**Lire tous les kanbans.** Le service renvoie tous les kanbans, du plus récemment modifié au plus
ancien, en convertissant chaque ligne de la base vers le modèle `Kanban`. S'il n'y en a aucun, il
renvoie une liste vide.

**Créer un kanban.** Le service valide le nom, génère un nouvel identifiant et la date du moment,
enregistre le kanban, sauvegarde la base, puis renvoie le kanban créé.

**Renommer un kanban.** Le service valide le nom, met à jour le nom et la date de modification,
puis sauvegarde. Si aucune ligne n'a été modifiée (kanban supprimé entre-temps), il signale une
erreur « Kanban introuvable ». Il renvoie le kanban à jour, ce qui évite de recharger toute la liste.

**Supprimer un kanban.** Le service supprime le kanban puis sauvegarde. Supprimer un kanban déjà
absent n'est pas une erreur.

*Pour plus tard :* les futures listes et cartes seront rattachées au kanban et supprimées avec lui
(suppression en cascade) — hors de ce lot.

### Lot 2 — Page liste : `KanbanList` (US1, US2, US4, US5) — route `/kanban`

**Affichage et chargement (US1).** À l'ouverture, la page affiche un indicateur de chargement et
appelle `getAllKanbans()`.
- Si tout va bien, elle affiche les kanbans (nom et date de modification), avec le titre
  « Mes Kanbans » et leur nombre.
- S'il n'y en a aucun, elle affiche « Aucun tableau pour l'instant. Touchez « + » pour en créer un. ».
- En cas d'échec, elle affiche un message d'erreur et un bouton « Réessayer » qui relance le chargement.

**Création (US2).** Le bouton « + » **ouvre l'écran d'édition d'un nouveau tableau** (`/kanban/new`)
et rien d'autre : aucune écriture en base à ce moment (D-K11). La création effective, le nom par
défaut « Sans titre » (D-K10) et le bouton d'enregistrement appartiennent à cet écran, donc au lot
suivant. La liste retrouvera le nouveau tableau à son prochain chargement.

**Ouverture et renommage (US3, US4).** Toucher une carte ouvre l'écran d'édition de ce tableau
(`/kanban/edit/:id`), qui est l'endroit du renommage. La liste ne porte plus d'icône crayon, et
n'appelle plus `renameKanban()`.

**Suppression (US5).** L'icône corbeille mémorise le kanban visé et ouvre `ConfirmDialog` avec le
message « Supprimer le tableau « <nom> » ? » et les boutons « Annuler » / « Confirmer ».
- Si l'utilisateur annule (bouton, clic hors de la popup, Échap), rien n'est supprimé.
- S'il confirme, la page appelle `deleteKanban()`. En cas de succès, le kanban est retiré de la liste.
  En cas d'échec, il reste affiché et un message « Impossible de supprimer le tableau. » s'affiche.

**Messages d'erreur.** La suppression étant désormais la seule écriture faite depuis la liste, le
bandeau d'erreur non bloquant ne concerne plus qu'elle ; il est effacé au début de l'action
suivante. C'est un écart volontaire avec la page « Mes Notes », qui se contente d'écrire l'erreur
dans la console : la SPEC demande un message visible.

**Option D-K8 (si validée).** Afficher la date sous la forme « Modifié aujourd'hui », « Modifié hier »
ou « Modifié le jj/mm/aaaa ». La comparaison se fait sur le jour du calendrier local (et non sur un
écart de 24 h), pour rester juste autour de minuit et des changements d'heure.

### Lot 3 — Routage

Ajouter la route `/kanban` dans `app.routes.ts`, **avant** la route « toute adresse inconnue » qui
redirige vers les notes. Depuis D-K12, deux routes supplémentaires sont nécessaires :
`/kanban/new` et `/kanban/edit/:id`. Elles sont servies par l'écran d'édition, livré au lot
suivant ; la liste ne fait que les appeler.

---

## 4. Impacts et points d'attention

- **Installations existantes** : la table est créée au démarrage (D-K6). Le script
  `scripts/schema_kanban.sql` sert de documentation ; régénérer la base de départ est facultatif.
- **Connexion partagée** : `KanbanService` est un service distinct de `NotesService`, mais utilise
  la même base. Il faut vérifier qu'ouvrir une deuxième connexion sur la même base ne provoque pas
  d'erreur « connexion déjà existante » (la situation existe déjà avec `NotesService` et
  `CalendarService`). Sinon, récupérer la connexion déjà ouverte.
- **Cartes cliquables** : depuis D-K2 révisée, toucher une carte ouvre l'écran d'édition. Le clic
  sur la corbeille **ne doit pas se propager** à la carte, sans quoi supprimer ouvrirait aussi le
  tableau. C'est le point de vigilance principal de la page.
- **Pas de régression sur les notes** : seuls `app.routes.ts` et l'export des modèles
  (`core/models/index.ts`) sont modifiés parmi les fichiers existants.
- **Accessibilité** : libellés accessibles « Supprimer » sur la corbeille et « Nouveau tableau » sur
  le bouton « + » ; la seule popup de la page, celle de confirmation de suppression, est
  `ConfirmDialog` et garde son comportement (fenêtre modale, Échap, clic hors de la popup).

---

## 5. Découpage suggéré

| Ordre | Lot | Dépend de | US servies | Ce qu'il faudra tester (→ `plan_test`) |
|---|---|---|---|---|
| 1 | Modèle + `KanbanService` | — | US1, US2, US4, US5 | création de la table, tri, validation du nom, kanban introuvable |
| 2 | Page liste + route | 1 | US1, US5 + navigation US2/US3/US4 | chargement / vide / erreur, ouverture de l'écran d'édition sans écriture, confirmation de suppression, non-propagation du clic corbeille |
| 3 | Écran d'édition d'un tableau | 1, 2 | US2, US3, US4 | nom par défaut « Sans titre », enregistrement, retour sans enregistrer, identifiant inexistant |

**Note du 2026-10-07.** Le lot 3 remplace le report de D-K9 : US2 et US4 ne sont complètes qu'avec
cet écran, le lot 2 n'en livrant que la navigation. Le service, lui, est déjà prêt — `createKanban`
et `renameKanban` existent et sont testés, c'est l'écran d'édition qui les appellera.

**Hors périmètre de ce lot** : listes et cartes, glisser-déposer, recherche / tri / filtre, couleurs
ou catégories de tableau, menu de navigation global, synchronisation CRDT / P2P, pilotage par l'IA.
