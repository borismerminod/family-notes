# AGENT.md — point d'entrée pour un agent sur Family-notes

> **Toutes les informations utiles à un agent sont dans le répertoire `.agent/` du projet.**
> Ce fichier dit uniquement **où chercher quoi**. Commence par lui, puis ouvre les documents
> cités ci-dessous selon la tâche demandée.

## 1. Lancer le projet

Tout passe par **Docker** : il n'y a pas de `package.json` à la racine, et Node / Angular CLI ne
sont pas installés sur l'hôte. Les commandes se lancent **depuis la racine du dépôt** et montent
`frontend` dans le conteneur.

**→ [COMMANDES.md](COMMANDES.md) est la référence complète** : build Angular, build de l'APK
Android, installation sur le téléphone, génération de fichiers Angular, `docker-compose`,
synchronisation Capacitor, et une section « Pièges connus » (droits root sur les fichiers générés,
version de Node, wrapper Gradle absent, versions Capacitor).

Les plus fréquentes :

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false
```

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npm run build
```

```bash
docker run --rm -it -p 4200:4200 -v "${PWD}/frontend:/app" -w /app node:lts npx ng serve --host 0.0.0.0
```

## 2. Procédures de développement par fonctionnalité

Les documents de conception sont rangés en sous-dossiers
**`<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>`** — par exemple `KANBAN/CRUD`. Dossiers existants :

| Dossier | Sujet |
|---|---|
| [KANBAN/CRUD](KANBAN/CRUD) | Page Kanban : liste, ouverture, création, suppression confirmée |
| [CATEGORIES](CATEGORIES) | Sélecteur de catégories |
| [URL_LINK](URL_LINK) | Insertion de lien dans l'éditeur |
| [UNDO_REDO](UNDO_REDO) | Historique d'édition (annuler / rétablir) |

Chaque dossier suit le même jeu de livrables, dans l'ordre du cycle de développement :

1. `FEATURE_<NOM>.md` — la **SPEC** : le besoin cadré et ses user stories (le « quoi ») ;
2. `APPROCHE_<NOM>.md` — l'**approche de dev** : diagramme de classes Mermaid + algorithmes
   (le « comment ») ;
3. `PLAN_TESTS_<CIBLE>.md` — le **plan de test** TDD boîte noire : cas groupés `T#.x`,
   décisions `D#`, contrat DOM ;
4. `REVUE_<NOM>.md` — la **revue** du code livré et le plan de refactoring priorisé ;
5. `MAQUETTE_*.html` — maquette HTML de l'écran, quand il y en a une.

**Les autres fichiers `.md` à la racine de `.agent/`** (`PLAN_GLOBAL.md`, `PLAN_NOTES.md`,
`MODELE_DONNEES_NOTES.md`, `DIAGRAMME_CLASSES_NOTES.md`, `PROBLEME_BUILD_ANDROID.md`, les
`PLAN_TESTS_*.md` et `PLAN_*.md` isolés…) sont des documents antérieurs à cette organisation :
le dossier **n'est pas encore rangé**, c'est normal. Ils restent valables comme source
d'information ; les nouveaux documents vont dans un sous-dossier
`<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>`.

## 3. Skills lançables

Les skills du projet sont dans **[`skill/`](skill)**, un dossier par skill contenant un `SKILL.md`
(nom + description en en-tête YAML). C'est là qu'il faut chercher une procédure avant d'improviser.

Ils s'enchaînent dans l'ordre du cycle de développement :

| Skill | Rôle |
|---|---|
| [`formaliser_demande`](skill/formaliser_demande/SKILL.md) | Besoin oral → `FEATURE_*.md` validé |
| [`approche_dev`](skill/approche_dev/SKILL.md) | SPEC → `APPROCHE_*.md` (diagramme de classes + algos) |
| [`plan_test`](skill/plan_test/SKILL.md) | Co-construction Cause-Effet → `PLAN_TESTS_*.md` |
| [`ecrire_tests`](skill/ecrire_tests/SKILL.md) | Plan de test → `.spec.ts` (rouge attendu), **sans** implémentation |
| [`dev_par_groupes`](skill/dev_par_groupes/SKILL.md) | TDD : un groupe de contrôle à la fois, validé par l'utilisateur |
| [`revue_fonctionnalite`](skill/revue_fonctionnalite/SKILL.md) | Code livré → `REVUE_*.md` (constats + refactorings priorisés) |
| [`appliquer_refactoring`](skill/appliquer_refactoring/SKILL.md) | Exécute un plan de refactoring validé, tests verts à chaque étape |
| [`documenter_sources`](skill/documenter_sources/SKILL.md) | Ajoute les en-têtes JSDoc **en anglais** sur le code livré |
| [`diagramme_classes`](skill/diagramme_classes/SKILL.md) | Met à jour les `DIAGRAMME_CLASSES_*.md` d'après le code réel |
| [`superviser_realisation`](skill/superviser_realisation/SKILL.md) | Orchestre toute la chaîne en déléguant chaque étape à un sous-agent |

## 4. Implémentation

### Stack

- **Angular 21** (`@angular/core ^21.2`, TypeScript 5.9), composants standalone ;
- **Vitest** pour les tests unitaires (`*.spec.ts` à côté du code testé) ;
- **Capacitor 8** + `@capacitor-community/sqlite` pour l'application Android ;
- le code vit dans `frontend/src/app` : un dossier par écran / composant, et
  `core/` pour les `models/`, `services/` et `components/` partagés ;
- **toutes les commandes d'application se lancent via Docker** (cf. §1), jamais en local.

### Règles de code

- **SOLID** et **clean code** : une responsabilité par classe / fonction ;
- **nommage porteur de sens** pour les fonctions, variables, classes et attributs — le nom doit
  dire ce que la chose fait ou contient ;
- **le code est relu par un humain : la lisibilité prime sur la concision** ;
- **éviter les appels de fonction imbriqués** : passer par des **variables intermédiaires**
  nommées, y compris dans les tests ;
- **les commentaires se placent en en-tête** de fonction, de classe et d'attribut (format JSDoc du
  projet, en anglais) — **jamais dans le corps des fonctions** : si un bloc a besoin d'être
  expliqué, l'explication va dans l'en-tête, ou le bloc devient une fonction nommée ;
- **tests de service** : asserter les **données renvoyées**, jamais la requête SQL émise ;
- **migrations SQLite** : des fichiers `.sql` dans `frontend/public/assets/migrations/`, joués au
  démarrage par `SchemaMigrationService` — **jamais de SQL dupliqué en TypeScript**. Après tout
  changement de schéma : `npm run build` puis `npx cap sync` (cf.
  [scripts/README.md](../scripts/README.md)).
