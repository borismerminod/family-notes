---
name: tdd_cas_par_cas
description: Écrit un .spec.ts en TDD, UN cas de test à la fois, au contact du code réel. Rassemble le dossier de la fonctionnalité (.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE> — FEATURE_*, APPROCHE_*, PLAN_TESTS_*, MAQUETTE_*), lit le code de la cible et de ses jumeaux, puis livre un seul cas T#.x, le lance (si l'utilisateur l'y autorise) et rapporte son statut rouge, avant de s'arrêter pour relecture. N'écrit JAMAIS le composant ni le service testé : l'implémentation est confiée à un autre agent, piloté par l'utilisateur. Invoquer pour dérouler un plan de test cas par cas, en restant près du code.
---

# Skill — TDD cas par cas (`.spec.ts` écrit un cas à la fois)

> **But :** dérouler un plan de test **un cas `T#.x` à la fois**, en restant **au contact du code
> réel** (cible existante, jumeaux, gabarits), pour que l'utilisateur relise chaque cas avant de
> faire implémenter la cible par un **autre agent**.
>
> **Invocation :** « déroule le plan de test cas par cas », « écris le prochain cas de test »,
> « on fait du TDD au cas par cas sur X ».
>
> **Variante « près du code » de la paire [`ecrire_tests`](../ecrire_tests/SKILL.md) ⇄
> [`dev_par_cas`](../dev_par_cas/SKILL.md)**, qui tient le même grain mais **sans arrêt pour
> relecture** : elle enchaîne sous l'autorité d'un superviseur, pour les cas où l'utilisateur ne
> relit pas le code. Ici, au contraire, chaque cas **s'arrête pour relecture humaine**, et la
> lecture du code existant fait partie du travail.
>
> **Règle d'or :** ce skill **n'écrit que le `.spec.ts`**, et **un seul cas par tour**. Il ne touche
> **jamais** au composant ni au service testés : l'implémentation est le travail d'un **autre
> agent**, lancé et piloté par **l'utilisateur**. Même quand le chemin vers le vert est évident,
> ce skill ne l'emprunte pas. Son pendant côté code est
> [`implementer_cas`](../implementer_cas/SKILL.md), qui implémente la cible sans jamais toucher au
> `.spec.ts`.

---

## Prérequis

- Un **plan de test** `PLAN_TESTS_<CIBLE>.md` existe dans
  `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>` (par exemple `.agent/KANBAN/EDITION`), avec ses
  cas `T#.x`, ses **décisions `D#` figées** et son **Contrat DOM**. Sinon, le produire d'abord via
  le skill [`plan_test`](../plan_test/SKILL.md).
- La **cible** du `.spec.ts` est identifiée : **un** composant ou **un** service. Un plan couvrant
  deux objets (partie A service, partie B écran) donne **deux** passages de ce skill, un par
  fichier de spec.

---

## Étape 0 — Demander qui lance les tests (**obligatoire, en ouverture de session**)

**Premier échange du skill, avant toute lecture de fichier**, poser la question :

> « Est-ce que je peux lancer les tests moi-même dans cette session, ou est-ce toi qui les lances
> et me colles la sortie ? »

- **Oui, le skill lance les tests** → après chaque cas écrit, c'est lui qui exécute la commande et
  rapporte le statut du cas.
- **Non (agent local sans accès à l'exécution)** → le skill **ne promet aucun statut**. Il livre le
  cas, fournit la **commande exacte à lancer** (filtrée sur le cas, cf. ci-dessous) et attend la
  **sortie collée** par l'utilisateur pour en lire le statut. Ne jamais déduire un rouge ou un vert
  d'une simple lecture du code.

Noter la réponse et s'y tenir pour toute la session ; ne reposer la question que si l'utilisateur
change d'avis.

**Commandes de référence** (toutes depuis la racine du dépôt, cf.
[`COMMANDES.md`](../../COMMANDES.md) — rien ne s'exécute sur l'hôte) :

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false
```

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false --filter="T3.2"
```

Si Docker n'est pas disponible dans la session, demander à l'utilisateur **quelle commande utiliser**
plutôt que d'en inventer une ; une machine peut avoir un Node utilisable hors Docker (c'est noté
dans la mémoire projet `run-frontend-tests`).

---

## Étape 1 — Rassembler le dossier de la fonctionnalité

Lire, dans `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>`, **tout ce qui existe** :

| Fichier | Ce qu'on y cherche |
|---|---|
| `FEATURE_<NOM>.md` | le **besoin** et les user stories citées par les cas (`US1`, `US2`…) |
| `APPROCHE_<NOM>.md` | le **diagramme de classes** (noms exacts des méthodes, des entrées) et les algorithmes |
| `PLAN_TESTS_<CIBLE>.md` | les **cas `T#.x`**, les **décisions `D#`**, les **doublures prévues**, le **Contrat DOM**, l'**ordre TDD suggéré** |
| `MAQUETTE_*.html` | les **classes CSS** et la structure de l'écran, quand le Contrat DOM renvoie à la maquette |

Puis — c'est ce qui distingue ce skill — **lire le code** :

1. la **cible**, si elle existe déjà (classe, gabarit, feuille de style) : signatures réelles,
   entrées / sorties, sélecteurs réellement présents ;
2. le `.spec.ts` de la cible, s'il est déjà commencé : montage du banc de test, doublures, helpers
   en place — un nouveau cas **réutilise** ces helpers plutôt que d'en ajouter un jumeau ;
3. le **`.spec.ts` jumeau** cité par le plan (source de vérité des conventions) ;
4. les **modèles** et **services** touchés (`frontend/src/app/core/`).

**Signaler à l'utilisateur tout écart** entre les documents et le code (une méthode renommée, un
sélecteur absent, une décision `D#` contredite par le code livré) **avant** d'écrire le cas :
c'est à lui de trancher. Ne pas réécrire le plan de soi-même ; un manque de décision → retour à
[`plan_test`](../plan_test/SKILL.md).

---

## Étape 2 — Annoncer l'ordre des cas

Donner, **en une fois et en début de session**, la **liste ordonnée des cas** à dérouler : l'ordre
TDD suggéré du plan (§ *Ordre d'implémentation TDD suggéré*), aplati au grain du cas. Cette liste
sert de fil : à chaque tour, le skill dit où il en est (« `T3.2` — cas 7 sur 42 »).

L'utilisateur peut à tout moment demander un autre cas, en sauter un ou revenir en arrière ; son
choix prime sur la liste.

---

## Boucle — un cas, un tour (répéter jusqu'au bout de la liste)

### 1. Écrire **un seul** cas

- Un `it('T3.2 …')` et **rien d'autre** : titre reprenant **l'identifiant et l'énoncé du plan**.
- Créer le `describe` du groupe et le montage (`beforeEach`, doublures, helpers) **seulement au
  premier cas du groupe**, puis s'y greffer.
- **Boîte noire** : interagir par le **DOM** (sélecteurs du Contrat DOM) ou par l'**API publique**
  du service ; asserter l'**état observable** et les **appels aux doublures**.
- Conventions du projet (**Vitest**) : `import { vi } from 'vitest'` ; `describe`/`it`/`expect` en
  globals ; doublure de service par **DI** (`{ provide: X, useValue: { m: vi.fn()… } }`) ;
  `Router.navigate` espionné ; `ActivatedRoute` stubbé quand un paramètre de route pilote le mode ;
  `afterEach(() => vi.restoreAllMocks())` ; helper `render()` → `detectChanges()` →
  `await whenStable()` → `detectChanges()`.
- **Jamais de `vi.mock('@capacitor-community/sqlite')`** : doubler `DatabaseService` par DI
  (mémoire projet `run-frontend-tests`). **Tests de service** : asserter les **données renvoyées**,
  jamais la requête SQL émise.
- **Lisibilité** (mémoire `readable-test-bodies`) : **aucun commentaire dans le corps** d'un `it`
  ni d'un helper, **aucun appel imbriqué** — une **variable intermédiaire nommée** par étape. Le
  « pourquoi » va dans le titre du `it`, dans l'en-tête JSDoc du helper ou dans le plan de test.

### 2. Lancer (ou faire lancer) et lire le statut

Selon la réponse de l'**étape 0** :

- *le skill lance* : exécuter la suite (filtrée sur le cas pour le diagnostic, **complète** avant de
  conclure), puis extraire le statut du cas et les totaux réels ;
- *l'utilisateur lance* : fournir la commande filtrée et **attendre sa sortie**.

**Attendu en TDD : rouge.** Distinguer les deux rouges, ils ne disent pas la même chose :

- **rouge d'assertion** — le cas s'exécute et échoue : c'est le bon rouge, celui qui décrit le
  travail à faire ;
- **rouge de compilation** — ⚠️ `@angular/build:unit-test` compile **tout le bundle en une passe** :
  un spec qui importe une cible inexistante (`TS2307`) ou une API pas encore écrite
  (`TS2339`/`TS2345`) **bloque toutes les suites**. Le dire explicitement, sans le présenter comme
  un rouge d'assertion, et proposer (sans l'imposer) que l'**agent d'implémentation** commence par un
  squelette minimal de la cible.

Vérifier aussi qu'**aucun cas déjà vert ne casse** et qu'il n'y a pas d'`unhandled rejection`.

### 3. Rapporter, puis **s'arrêter**

Rapport honnête, court, en trois lignes :

- **le cas livré** : identifiant, énoncé, lien `fichier:ligne` ;
- **son statut réel** : rouge d'assertion (avec le **message d'échec**, qui dit ce qu'il reste à
  implémenter) ou rouge de compilation (avec l'erreur TS) ; totaux réels de la suite ;
- **ce qu'attend la cible** pour passer au vert : sélecteurs, méthode, comportement — formulé comme
  une **consigne utilisable telle quelle par l'agent d'implémentation**
  ([`implementer_cas`](../implementer_cas/SKILL.md)), sans écrire son code.

Puis **s'arrêter** : l'utilisateur relit le cas, lance son agent d'implémentation, et revient.
Ne pas enchaîner sur le cas suivant de soi-même, ne pas « aider » en touchant à la cible.

### 4. Reprise après l'implémentation

Quand l'utilisateur annonce que la cible est implémentée :

1. **relancer la suite** (ou demander sa sortie) et **confirmer le vert du cas** — jamais sur la
   foi du code lu ;
2. si le cas est **encore rouge** : expliquer l'écart entre l'attendu du plan et le comportement
   observé, et **laisser la correction à l'agent d'implémentation**. Ne retoucher le cas de test que si
   l'utilisateur reconnaît une **erreur dans le test** et le demande ;
3. si l'implémentation a fait passer **d'autres cas** au vert, ou cassé un cas déjà vert, le dire ;
4. demander le feu vert pour **le cas suivant**.

---

## Fin de parcours

- Tous les cas du périmètre verts → faire tourner la **suite complète**, confirmer `0 échec` et
  l'absence d'`unhandled`, puis lister ce qui reste **hors périmètre** (cf. § *Hors périmètre* du
  plan, par exemple les routes vérifiées à la main).
- Proposer (sans l'imposer) la suite de la chaîne :
  [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md) puis
  [`documenter_sources`](../documenter_sources/SKILL.md).
- Mettre à jour la **mémoire projet** si un piège nouveau est apparu, et son index `MEMORY.md`.

---

## Rappels

- **Un cas par tour**, relecture entre chaque — c'est le cœur du skill.
- **Aucune ligne d'implémentation**, jamais : la cible appartient à l'autre agent. En cas de doute,
  s'arrêter et demander.
- Les **décisions `D#`** et le **Contrat DOM** du plan font foi ; le code lu sert à écrire un test
  qui tient, pas à redécider le comportement.
- **Jamais de statut annoncé sans la sortie des tests**, qu'elle vienne du skill ou de
  l'utilisateur.
- Convertir les dates relatives en **dates absolues**.
- Ce skill vit dans `.agent/skill/tdd_cas_par_cas/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande, le copier dans un dossier de skills reconnu
  (ex. `.claude/skills/tdd_cas_par_cas/`), le frontmatter est déjà prêt.
