---
name: ecrire_tests
description: Écrit UNIQUEMENT les tests dans le projet, sous forme de code (.spec.ts), à partir d'un plan de test déjà validé (PLAN_TESTS_*.md). Traduit les cas groupés (T#.x), décisions D# et Contrat DOM du plan en un .spec.ts Vitest boîte noire, le lance et rapporte honnêtement l'état (rouge attendu en TDD). N'écrit JAMAIS le composant ni l'implémentation. Invoquer quand un plan de test existe et qu'on veut le concrétiser en code de test.
---

# Skill — Écriture des tests (plan validé → `.spec.ts`)

> **But :** traduire un **plan de test validé** (`.agent/PLAN_TESTS_<CIBLE>.md`) en un fichier
> de test exécutable (`.spec.ts`), en TDD boîte noire. Suite naturelle du skill
> [`plan_test`](../plan_test/SKILL.md), et amont de [`dev_par_groupes`](../dev_par_groupes/SKILL.md).
>
> **Invocation :** « écris les tests de X », « concrétise le plan de test en code »,
> « génère le `.spec.ts` » — dès lors qu'un plan de test validé existe.
>
> **Règle d'or :** ce skill écrit **UNIQUEMENT le `.spec.ts`**. Il **n'écrit ni composant, ni
> logique d'implémentation** (TDD pur), sauf demande explicite contraire.

---

## Prérequis

- Un **plan de test validé** (`.agent/PLAN_TESTS_<CIBLE>.md`) existe, avec cas groupés
  (`Groupe N`, `T1.1`, `T1.2`…), **décisions `D#` figées** et **Contrat DOM**. Sinon, le
  produire d'abord via le skill [`plan_test`](../plan_test/SKILL.md).
- Connaître le **périmètre validé** et l'**ordre TDD suggéré** du plan.

## Étape 0 — Relire le plan et les conventions

1. Relire le plan de test : cas `T#.x`, décisions `D#`, Contrat DOM (sélecteurs), doublures
   prévues. Ce sont les **assertions exactes** à écrire — ne rien re-décider ici ; si une
   décision manque, revenir à [`plan_test`](../plan_test/SKILL.md) plutôt qu'improviser.
2. Relire un **`.spec.ts` jumeau** existant (source de vérité des conventions) et la mémoire
   `test-setup-notes-service`.

## Étape 1 — Écrire le `.spec.ts` (et rien d'autre)

Fichier : à côté de la cible (`frontend/src/app/<cible>/<cible>.spec.ts`). Conventions du
projet (**Vitest**, pas Karma — cf. mémoire `test-setup-notes-service`) :

- `import { vi } from 'vitest'` ; `describe`/`it`/`expect` en globals.
- `TestBed.configureTestingModule({ imports: [Composant], providers: [...] })`.
- **Doublures** : service via `{ provide: X, useValue: { m: vi.fn().mockResolvedValue(...) } }` ;
  `Router.navigate` espionné (`vi.spyOn(router,'navigate').mockResolvedValue(true)`) ;
  `ActivatedRoute` stubbé (`convertToParamMap`) quand un paramètre de route pilote le mode.
- **Boîte noire** : interagir via le **DOM** (helpers `type()`, `click…()`, requêtes par
  classe du Contrat DOM) ; asserter via l'état du DOM **et** les appels aux doublures.
- Un `describe` par groupe, un `it` par cas (`T1.1 …` en titre), commentaires reliant aux
  décisions `D#`. `afterEach(() => vi.restoreAllMocks())`.
- Helper `render()` : `detectChanges()` → `await whenStable()` → `detectChanges()`.

## Étape 2 — Vérifier et rapporter honnêtement

- Lancer : `cd frontend && npx ng test --watch=false`.
- **Attendu (TDD)** : rouge. ⚠️ **Piège builder** : `@angular/build:unit-test` compile
  **tout le bundle en une passe**. Si le spec importe une cible **inexistante**, la
  compilation échoue (`TS2307`) et **bloque toutes les suites** — ce n'est pas un « rouge
  sur assertions ». Le signaler à l'utilisateur et proposer (sans l'imposer) un **squelette
  minimal** de la cible (classe vide + template placeholder) pour obtenir un vrai rouge
  d'assertions exécutable. Créer ce squelette **seulement** s'il le demande.
- Rapporter : ce qui a été livré (liens fichiers), l'état réel des tests, ce qui reste.

## Étape 3 — Clôturer

Une fois le `.spec.ts` livré et l'état réel rapporté, proposer (sans l'imposer) d'enchaîner
sur [`dev_par_groupes`](../dev_par_groupes/SKILL.md) pour implémenter la cible groupe par
groupe jusqu'au vert.

## Rappels

- Ne jamais glisser d'implémentation fonctionnelle dans ce skill : **le `.spec.ts` seul**.
- Ne pas re-décider le comportement : les **décisions `D#`** et le **Contrat DOM** du plan
  font foi. Un manque → retour à [`plan_test`](../plan_test/SKILL.md).
- Rapporter l'**état réel** de la suite (jamais « c'est bon » sans la sortie des tests).
- Convertir les dates relatives en absolues.
- Ce skill vit dans `.agent/skill/ecrire_tests/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande, le copier dans un dossier de skills reconnu
  (ex. `.claude/skills/ecrire_tests/`), le frontmatter est déjà prêt.
