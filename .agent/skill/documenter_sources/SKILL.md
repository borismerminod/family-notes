---
name: documenter_sources
description: Documente le code d'implémentation livré lors d'une réalisation (fichiers modifiés pendant le dev, PAS les .spec.ts) en ajoutant/complétant les en-têtes de documentation — fichier, classe, fonction/méthode, attribut — au format JSDoc du projet et EN ANGLAIS. S'appuie sur les plans (FEATURE_*.md, APPROCHE_*.md, PLAN_TESTS_*.md, REVUE_*.md) pour documenter l'intention, les contrats et les décisions D#, sans reparaphraser le code ligne à ligne. Documentation UNIQUEMENT : ne change jamais le comportement, ne touche pas aux tests. Fait valider l'utilisateur, fichier par fichier. Invoquer quand une fonctionnalité vient d'être développée et qu'on veut documenter ses sources.
---

# Skill — Documentation des sources d'implémentation (code livré → en-têtes documentés en anglais)

> **But :** documenter le **code d'implémentation** d'une réalisation **déjà développée**, en
> ajoutant ou complétant les **en-têtes de documentation** (fichier, classe, fonction/méthode,
> attribut) au **format JSDoc du projet** et **en anglais**. La documentation explique
> l'**intention**, les **contrats** et les **décisions** — en s'appuyant sur les plans
> (`FEATURE_*.md`, `APPROCHE_*.md`, `PLAN_TESTS_*.md`, `REVUE_*.md`) — et **non** une
> paraphrase ligne à ligne du code. Suite naturelle de
> [`dev_par_groupes`](../dev_par_groupes/SKILL.md) et de
> [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md).
>
> **Invocation :** quand une réalisation est terminée (groupes verts) et que l'utilisateur veut
> **documenter le code livré** (« documente les sources de la fonctionnalité X », « ajoute les
> commentaires d'en-tête », « commente les classes et fonctions du lot »).
>
> **Règle d'or :** **documenter, c'est ajouter du sens sans changer le comportement.** Ce skill
> **n'écrit que des commentaires de documentation** — jamais de logique, jamais de test. Toute
> la suite reste verte. Les commentaires sont **en anglais**. Cible = **code d'implémentation**,
> **pas** les `.spec.ts`.

---

## Prérequis

- Une réalisation **terminée** dont le code d'implémentation a été livré (idéalement suite de
  tests verte à la sortie de [`dev_par_groupes`](../dev_par_groupes/SKILL.md)).
- Les **docs de cadrage** décrivant l'intention, sources de vérité pour la doc :
  - la **SPEC** (`.agent/FEATURE_<NOM>.md` — user stories, critères d'acceptation),
  - le **plan d'implémentation** (`.agent/APPROCHE_<NOM>.md` — classes, algorithmes, décisions
    de cadrage numérotées),
  - le **plan de test** (`.agent/PLAN_TESTS_<CIBLE>.md` — décisions `D#`, Contrat DOM),
  - la **revue** si elle existe (`.agent/REVUE_<NOM>.md` — constats, refactorings appliqués).
  Si un doc manque, le signaler : la doc reste possible mais s'appuie sur moins d'intention
  (dire sur quoi elle se fonde réellement).
- Connaître la **convention de documentation existante** du projet (voir Étape 1) et la
  **mémoire projet** (conventions, pièges).

## Étape 0 — Reconstituer le périmètre à documenter

Cibler **le code d'implémentation qui a été créé/modifié pendant le dev** — pas les tests.

1. Lire les docs de cadrage (SPEC, APPROCHE, PLAN_TESTS, REVUE) pour connaître l'**intention**,
   les **décisions `D#`/de cadrage**, les **contrats** (Contrat DOM, signatures publiques) et le
   vocabulaire du domaine. C'est ce que la doc doit refléter, pas la mécanique du code.
2. Lister les fichiers modifiés du lot :

   ```bash
   cd /home/mateus/family-notes-agent
   git status --porcelain                       # modifs non commitées
   git diff --stat main...HEAD                   # modifs de la branche vs main
   ```
3. **Écarter les fichiers de test et le bruit**, ne garder que l'**implémentation** :
   - exclure `*.spec.ts`, `*.test.ts`, `src/test-setup.ts`, mocks/fixtures de test ;
   - exclure la config pure (`angular.json`, `tsconfig*.json`, `package.json`) ;
   - garder : modèles (`core/models`), services (`core/services`), composants (`.ts` et, si
     pertinent, `.html`/`.css` via commentaires de leur langage), helpers, utilitaires.
   Les `.spec.ts` se **lisent** (ils révèlent le contrat de comportement à documenter) mais ne
   sont **jamais** documentés ni modifiés par ce skill.
4. Lire **intégralement** chaque fichier retenu (pas seulement le diff) : une bonne doc
   d'en-tête tient compte du fichier entier, de ses dépendances et de ses appelants.

## Étape 1 — Fixer la convention de documentation (une fois)

Avant d'écrire, **s'aligner sur l'existant** pour que la doc soit homogène.

1. Repérer la convention déjà en place dans le code (ex. `external-link.ts`, `url-sanitize.ts`
   utilisent du **JSDoc** `/** … */` avec `@file` / `@description` en tête de fichier, et
   `@param` / `@returns` sur les fonctions). **Reprendre cette convention**, ne pas en inventer
   une nouvelle.
2. **Langue = anglais** (règle de ce skill). Le code existant peut porter des en-têtes en
   **français** : lors de la documentation d'un fichier, **harmoniser ses en-têtes en anglais**
   pour ne pas laisser un mélange des deux langues dans un même fichier. Le **signaler** dans le
   rapport (c'est une traduction, pas un changement de comportement).
3. Format cible (calqué sur l'existant), à titre de repère :

   ```ts
   /**
    * @file external-link.ts
    * @description Opens a URL OUTSIDE the app: native browser via `@capacitor/browser` on
    * mobile, `window.open` fallback on web (dev). See
    * .agent/URL_LINK/PLAN_TESTS_INSERTION_LIEN.md §E1 and APPROCHE_INSERTION_LIEN.md §3 Lot E.
    */
   @Injectable({ providedIn: 'root' })
   export class ExternalLinkService {
     /**
      * Opens `url` outside the app (DL8): sanitize first (no-op if empty/rejected), then
      * native `Browser.open` or web `window.open(..., 'noopener')`.
      * @param url The URL to open.
      */
     async open(url: string): Promise<void> { /* … */ }
   }
   ```

## Étape 2 — Documenter, fichier par fichier

Pour **chaque fichier** d'implémentation retenu, ajouter/compléter les **en-têtes** aux quatre
niveaux ci-dessous. Documenter **depuis l'en-tête** : le lecteur doit comprendre le rôle et le
contrat **sans lire le corps**.

- **Fichier** (`@file` + `@description`) : rôle du module en une à trois phrases — **pourquoi**
  il existe, sa responsabilité, ses frontières. Renvoyer aux sections de plan pertinentes
  (`cf. APPROCHE_<NOM>.md §…`, `PLAN_TESTS §…`) comme le fait déjà le code existant.
- **Classe / interface / type** : responsabilité de l'abstraction, sa place dans le
  diagramme de classes (`DIAGRAMME_CLASSES_*.md`), les invariants qu'elle garantit.
- **Fonction / méthode** : ce qu'elle fait et **pourquoi** (pas comment), `@param` pour chaque
  paramètre, `@returns`, `@throws` si pertinent. Documenter les **cas limites**, effets de bord,
  et rattacher aux **décisions `D#`** qu'elle implémente (comme `(DL8)` dans l'exemple).
- **Attribut / champ / signal** : sens et rôle de la donnée, unité/format, valeur par défaut,
  invariant. Documenter en priorité l'**API publique** et les champs **non triviaux** ; ne pas
  alourdir un champ dont le nom se suffit.

Principes :
- **Intention, pas paraphrase** : ne pas redire ce que le code dit déjà (`// increment i`).
  Documenter le **pourquoi**, le **contrat**, les **invariants**, les **pièges** — ce qu'on ne
  lit pas dans le code.
- **Rester exact** : la doc doit décrire le comportement **réel** du code livré. En cas d'écart
  entre le code et un plan, **documenter le code tel qu'il est** et **signaler l'écart** à
  l'utilisateur (ne pas documenter une intention non réalisée comme si elle l'était).
- **Aucune modification de logique** : on ne touche **qu'aux commentaires**. Renommer, réordonner
  ou « corriger » du code n'appartient pas à ce skill (ça relève de
  [`appliquer_refactoring`](../appliquer_refactoring/SKILL.md)). Si la doc révèle un vrai
  problème, le **noter** comme constat à porter en revue, sans le corriger ici.
- **Bon dosage** : documenter ce qui a de la valeur (modules, API publiques, algorithmes,
  décisions), pas chaque ligne. Une doc trop bavarde vieillit mal.
- Pour un **template `.html`** ou une **feuille `.css`**, utiliser la syntaxe de commentaire du
  langage (`<!-- … -->`, `/* … */`) et rester sobre (bloc de tête décrivant la zone/section).

## Étape 3 — Vérifier que rien n'est cassé

La documentation est inerte à l'exécution, mais une édition peut **accidentellement** toucher du
code ou casser un template. **Prouver que la suite reste verte** (cf. mémoire `run-frontend-tests`) :

```bash
cd /home/mateus/family-notes-agent/frontend
NODE=/home/mateus/.lmstudio/.internal/utils/node
PATH="/home/mateus/.lmstudio/.internal/utils:$PATH" "$NODE" \
  node_modules/@angular/cli/bin/ng.js test --watch=false > /tmp/doc-out.txt 2>&1
grep -E "Test Files|Tests " /tmp/doc-out.txt | tail -n 2
grep -ciE "unhandled" /tmp/doc-out.txt
```

- **Attendu : totaux identiques à avant, 0 échec, 0 `unhandled`.** ⚠️ Le builder compile tout le
  bundle en une passe — une accolade de commentaire mal fermée bloque **toutes** les suites.
- Relire le **diff** (`git diff`) et confirmer qu'il ne contient **que** des lignes de
  commentaire (aucune ligne de code exécutable modifiée).
- Si un `.html` a été documenté et que le rendu est observable, le **vérifier inchangé** via le
  **Browser pane** (`preview_start`, `navigate`, `read_page`/`computer screenshot`).

## Étape 4 — Faire valider par l'utilisateur — PUIS s'arrêter

Rapporter **honnêtement**, par fichier :
- fichiers documentés (liens `file`) et **niveaux** couverts (fichier / classe / méthode / champ) ;
- **preuve d'innocuité** : diff = commentaires uniquement, totaux verts inchangés, 0 `unhandled` ;
- en-têtes **traduits** du français vers l'anglais (le cas échéant), et tout **écart code ↔ plan**
  repéré en documentant (à porter éventuellement en revue) ;
- ce qui reste à documenter.

Puis **demander explicitement la validation** (« je valide la doc de `external-link.ts` et
j'enchaîne sur le suivant ? ») et **attendre** : l'utilisateur valide, ajuste (ton, niveau de
détail, langue), ou reporte. **Ne pas enchaîner de soi-même.**

## Fin de parcours

- Quand tous les fichiers du périmètre sont documentés : relancer la **suite complète**,
  confirmer les **totaux inchangés** (`0 échec`, `0 unhandled`), et lister ce qui reste **hors
  périmètre**.
- Si la documentation fait ressortir un **écart durable** (code vs plan) ou une **convention** à
  fixer, proposer une note de **mémoire projet** + une ligne dans `MEMORY.md`.
- Ne **pas** commiter / ouvrir de PR de soi-même : le proposer, laisser l'utilisateur décider.

## Rappels

- **Documenter = ajouter du sens, pas changer le comportement.** Le diff ne contient **que** des
  commentaires ; la suite de tests verte le confirme.
- **Cible = code d'implémentation modifié** ; les `.spec.ts` se **lisent** (contrat de
  comportement à documenter) mais ne sont **jamais** documentés ni touchés.
- **En-têtes en anglais**, au **format JSDoc existant** ; harmoniser en anglais les en-têtes
  français des fichiers documentés (et le signaler).
- **Intention, contrat, invariants, décisions `D#`** — pas de paraphrase ligne à ligne. Renvoyer
  aux sections de plan comme le fait déjà le code.
- **Documenter le code tel qu'il est** ; signaler les écarts avec les plans plutôt que de les
  masquer. Ne rien « corriger » : un vrai problème devient un constat pour
  [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md).
- Toujours rapporter l'**état réel** (diff = commentaires, totaux verts). Convertir les dates
  relatives en absolues. Attendre l'**accord explicite** avant de clore chaque fichier.
- Ce skill vit dans `.agent/skill/documenter_sources/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de skills
  reconnu (ex. `.claude/skills/documenter_sources/`) ; le frontmatter est déjà prêt.
