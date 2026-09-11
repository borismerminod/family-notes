---
name: plan_test
description: Rédige les tests d'une réalisation à venir en TDD boîte noire — prend connaissance du besoin, pose les questions de cadrage, écrit un plan de test dans .agent, demande validation, puis écrit UNIQUEMENT le .spec.ts (jamais le composant ni l'implémentation). Invoquer quand l'utilisateur demande de préparer/écrire les tests d'un composant, service ou écran.
---

# Skill — Rédaction de tests (plan → validation → `.spec.ts`)

> **But :** produire des tests fonctionnels pour une réalisation à venir, en TDD boîte
> noire, selon le processus éprouvé sur `NoteList` et `NoteEditor`.
>
> **Invocation :** quand l'utilisateur demande d'écrire / de préparer les tests d'un
> composant, service ou écran (« fais un plan de test pour… », « écris les tests de… »).
>
> **Règle d'or :** ce skill **s'arrête** après le plan validé + le `.spec.ts`. Il **n'écrit
> ni composant, ni logique d'implémentation** (TDD pur), sauf demande explicite contraire.

---

## Étape 0 — Prendre connaissance de la réalisation

1. Lire les documents `.agent/*.md` pertinents (`PLAN_NOTES.md`, `MODELE_DONNEES_*.md`,
   `DIAGRAMME_CLASSES_*.md`, les `PLAN_TESTS_*.md` existants) et la mémoire projet
   (`test-setup-notes-service`, `notes-service-findings`).
2. Lire le code concerné et ses voisins : modèles (`core/models`), service(s)
   (`core/services`), composants existants et **leur `.spec.ts`** (source de vérité des
   conventions), routes (`app.routes.ts`).
3. Repérer ce qui existe déjà et **doit être réutilisé** (méthodes de service, doublures,
   helpers DOM, composants partagés comme `ConfirmDialog`) — ne pas réinventer.

## Étape 1 — Poser les questions de cadrage (si nécessaire)

Utiliser `AskUserQuestion` **uniquement** pour les choix qui changent les assertions.
Questions typiques :
- **Périmètre** : squelette fonctionnel vs minimal vs complet (découper si le sujet couvre
  plusieurs phases — un `.spec.ts` reste focalisé).
- **Déclencheurs** : bouton explicite vs auto-save/debounce ; création + édition vs édition
  seule ; route unique vs routes séparées.
- Toute ambiguïté de comportement observable.

Ne pas demander ce qui a un défaut évident (nom de fichier, conventions déjà établies) :
choisir, l'annoncer, avancer.

## Étape 2 — Écrire le plan de test dans `.agent`

Fichier : `.agent/PLAN_TESTS_<CIBLE>.md` (ex. `PLAN_TESTS_NOTE_EDITOR.md`), calqué sur
`PLAN_TESTS_NOTE_LIST.md`. Structure obligatoire :

1. **En-tête** : approche boîte noire / TDD, référence au jumeau existant.
2. **Objet testé** : rôle fonctionnel, périmètre validé, **hors périmètre** explicite.
3. **Dépendances (abstraites) & doublures** : source de données, navigation, route,
   confirmation… décrites sans figer de signature d'API précise.
4. **Décisions de conception à figer** (`D1`, `D2`, …) : chaque décision qui impacte une
   assertion, suivie de *(à confirmer)*.
5. **Cas de test** groupés (`Groupe N`) et numérotés (`T1.1`, `T1.2`, …), un comportement
   observable par cas, formulé en langage métier.
6. **Contrat DOM** : table des sélecteurs ciblés par les tests (fixe le contrat que
   l'implémentation devra honorer).
7. **Ordre d'implémentation TDD suggéré** (rouge → vert, groupe par groupe).

## Étape 3 — Demander validation

Présenter le plan et **attendre l'accord explicite** avant d'écrire le `.spec.ts`.
En mode plan : `ExitPlanMode`. Sinon : demander clairement « je pars là-dessus ? ».
**Ne pas** écrire le spec avant le feu vert.

## Étape 4 — Écrire le `.spec.ts` (et rien d'autre)

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

## Étape 5 — Vérifier et rapporter honnêtement

- Lancer : `cd frontend && npx ng test --watch=false`.
- **Attendu (TDD)** : rouge. ⚠️ **Piège builder** : `@angular/build:unit-test` compile
  **tout le bundle en une passe**. Si le spec importe une cible **inexistante**, la
  compilation échoue (`TS2307`) et **bloque toutes les suites** — ce n'est pas un « rouge
  sur assertions ». Le signaler à l'utilisateur et proposer (sans l'imposer) un **squelette
  minimal** de la cible (classe vide + template placeholder) pour obtenir un vrai rouge
  d'assertions exécutable. Créer ce squelette **seulement** s'il le demande.
- Rapporter : ce qui a été livré (liens fichiers), l'état réel des tests, ce qui reste.

## Rappels

- Ne jamais glisser d'implémentation fonctionnelle dans ce skill.
- Convertir les dates relatives en absolues dans les docs.
- Si le sujet est trop large pour un `.spec.ts`, proposer un découpage plutôt qu'un plan
  géant.
- Ce skill vit dans `.agent/skill/plan_test/SKILL.md` (format `SKILL.md` + frontmatter). Pour
  le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de skills
  reconnu (ex. `.claude/skills/plan_test/`), le frontmatter (`name`, `description`) est déjà prêt.
