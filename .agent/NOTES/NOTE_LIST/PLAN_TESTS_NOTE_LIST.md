# Plan de Test (TDD) — Écran "Liste des Notes"

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement attendu** de l'écran
> avant toute implémentation. Il ne fait référence à **aucune** classe, service, modèle
> ou route existants : on part du principe que rien n'est encore écrit. Les noms de
> dépendances (« source de données », « navigation », « confirmation ») sont volontairement
> abstraits ; ils seront concrétisés au moment d'écrire les specs.

## 1. Objet testé

L'écran qui liste les notes de l'utilisateur. Rôle fonctionnel :
- afficher les notes existantes sous forme de cartes ;
- permettre de **rechercher/filtrer** dans ces notes ;
- permettre de **créer**, **ouvrir/éditer** et **supprimer** une note ;
- gérer les états de **chargement** et de **liste vide**.

## 2. Dépendances (abstraites) et doublures de test

Pour tester l'écran en isolation, on remplace ses collaborateurs par des doublures :

- **Source de données des notes** : fournit la liste des notes ; permet de supprimer une note.
  - simulée pour renvoyer une liste connue, une liste vide, ou une erreur.
- **Navigation** : permet d'aller vers l'écran de création ou d'édition.
  - espionnée pour vérifier la destination demandée.
- **Confirmation utilisateur** (avant suppression) : renvoie oui/non.
  - simulée pour tester le cas « confirmé » et le cas « annulé ».

> Aucune de ces doublures ne suppose une signature d'API précise : au moment d'écrire les
> specs, on définira l'interface minimale nécessaire (c'est le TDD qui fait émerger le contrat).

## 3. Décisions de conception à figer (impactent les assertions)

- **D1 — Après une suppression réussie :** on retire la note **localement** de la liste
  affichée (pas de rechargement complet de la source). *(à confirmer)*
- **D2 — En cas d'échec de suppression :** comportement **pessimiste** — la note n'est
  retirée de l'affichage **qu'après** confirmation du succès ; en cas d'erreur elle **reste**
  affichée. *(à confirmer)*

## 4. Cas de test

### Groupe 1 — Chargement initial
- **T1.1** À l'ouverture de l'écran, les notes sont demandées à la source de données.
- **T1.2** Les notes obtenues sont affichées : une carte par note.
- **T1.3** Chaque carte présente au minimum le **titre**, la **catégorie** et la **date** de la note.

### Groupe 2 — État de chargement
- **T2.1** Tant que les notes ne sont pas arrivées, un indicateur de chargement est visible.
- **T2.2** Une fois les notes arrivées, l'indicateur disparaît et la liste s'affiche.
- **T2.3** Si la source de données échoue, l'indicateur de chargement se termine quand même
  (pas d'état bloqué) et l'écran ne plante pas.

### Groupe 3 — Liste vide
- **T3.1** Si la source renvoie zéro note, un message « aucune note » est affiché.
- **T3.2** Si une recherche ne correspond à aucune note, un message d'absence de résultat est affiché.

### Groupe 4 — Recherche / filtrage
- **T4.1** Saisir un terme n'affiche que les notes dont le **titre** contient ce terme.
- **T4.2** Le filtre correspond aussi à la **catégorie**.
- **T4.3** La recherche est **insensible à la casse** et ignore les espaces de début/fin.
- **T4.4** Effacer la recherche (terme vide) réaffiche **toutes** les notes.
- **T4.5** Le filtrage s'effectue **sur les données déjà chargées** : taper un terme ne
  redemande pas les notes à la source.

### Groupe 5 — Création
- **T5.1** Déclencher « Nouvelle note » demande la navigation vers l'écran de **création**.

### Groupe 6 — Ouverture / édition
- **T6.1** Ouvrir une note demande la navigation vers l'écran d'**édition** de **cette** note
  (l'identifiant transmis correspond à la note choisie).
- **T6.2** Déclencher l'action « éditer » d'une carte ne déclenche pas simultanément l'action
  d'ouverture par défaut de la carte (pas de double action).

### Groupe 7 — Suppression
- **T7.1** Déclencher « Supprimer » demande d'abord une **confirmation**.
- **T7.2** Si l'utilisateur **confirme**, la suppression de **cette** note est demandée à la
  source de données (bon identifiant).
- **T7.3** Après suppression réussie, la note **disparaît** de la liste affichée (cf. D1).
- **T7.4** Si l'utilisateur **annule** la confirmation, **aucune** suppression n'est demandée
  et la liste reste inchangée.
- **T7.5** Si la suppression échoue, la note **reste** affichée (cf. D2) et l'écran ne plante pas.
- **T7.6** Déclencher « Supprimer » ne déclenche pas simultanément l'action d'ouverture de la carte.

## 5. Hors périmètre (pour ce lot de tests)

- Le contenu détaillé de la note (blocs, multimédia) — relève de l'écran d'édition.
- La persistance réelle (SQLite / fichiers) — testée séparément au niveau de la source de données.
- Le style visuel (CSS) au-delà de la présence/absence des éléments clés.

## 6. Ordre d'implémentation TDD suggéré

1. Groupe 1 (affichage de base) → 2. Groupe 2 (chargement) → 3. Groupe 3 (vide) →
4. Groupe 4 (recherche) → 5. Groupes 5–6 (navigation) → 6. Groupe 7 (suppression).

À chaque cas : écrire le test (rouge), écrire le minimum de code pour le faire passer (vert),
refactorer si besoin.
