---
name: ecrire_tests
description: Écrit UNIQUEMENT les tests d'une cible dans le projet (.spec.ts), UN cas T#.x à la fois, à partir du dossier de la fonctionnalité (.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE> — FEATURE_*, APPROCHE_*, PLAN_TESTS_*, MAQUETTE_*). Après chaque cas écrit il lance la suite : cas vert → il enchaîne sur le cas suivant ; cas rouge → il S'ARRÊTE et rend la main au superviseur, qui fera implémenter la cible par le skill dev_par_cas. N'écrit JAMAIS le composant ni le service testé. Conçu pour alterner avec dev_par_cas sous un superviseur (skill superviser_realisation, ou l'utilisateur lui-même). Invoquer quand un plan de test validé doit devenir du code de test.
---

# Skill — Écriture des tests (plan validé → `.spec.ts`, **un cas à la fois**)

> **But :** traduire un **plan de test validé** (`PLAN_TESTS_<CIBLE>.md`) en cas de test
> exécutables, **un cas `T#.x` par tour**, et s'arrêter dès qu'un cas est **rouge** — c'est le
> signal que la cible a du travail à faire.
>
> **Invocation :** « écris les tests de X », « écris le cas de test suivant », « concrétise le plan
> de test en code ».
>
> **Règle d'or :** ce skill écrit **UNIQUEMENT le `.spec.ts`**. Il **n'écrit ni composant, ni
> service, ni squelette, ni la moindre ligne d'implémentation** — pas même pour débloquer une
> compilation. Cette part du travail appartient à
> [`dev_par_cas`](../dev_par_cas/SKILL.md).

---

## La paire et son superviseur

Ce skill et [`dev_par_cas`](../dev_par_cas/SKILL.md) **fonctionnent en paire**, en se
relayant autour du même `.spec.ts` sous l'autorité d'un **superviseur** :

```
superviseur ──▶ ecrire_tests      : écrit T1.1 → vert → écrit T1.2 → ROUGE → s'arrête, rapporte
            ◀──
superviseur ──▶ dev_par_cas       : implémente jusqu'à T1.2 vert → s'arrête, rapporte
            ◀──
superviseur ──▶ ecrire_tests      : écrit T1.3 → …
```

Le **superviseur** est, selon le contexte :

- l'**agent de supervision** du skill [`superviser_realisation`](../superviser_realisation/SKILL.md),
  qui ouvre un sous-agent par tour ;
- ou l'**utilisateur lui-même**, quand il lance la session à la main et pilote l'alternance.

Dans les deux cas le fonctionnement du skill est **identique** : il travaille, il s'arrête au
premier rouge, il **rapporte**. Il ne lance pas l'implémentation, ne l'attend pas et ne la devine
pas.

> **Ce skill ne fait relire le code à personne.** Quand l'utilisateur veut **relire chaque cas**
> avant qu'il soit implémenté, c'est la paire
> [`tdd_cas_par_cas`](../tdd_cas_par_cas/SKILL.md) + [`implementer_cas`](../implementer_cas/SKILL.md)
> qu'il faut employer : même grain, mais un arrêt pour relecture humaine à chaque cas.

---

## Prérequis

- Un **plan de test validé** `PLAN_TESTS_<CIBLE>.md` dans
  `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>` (par exemple `.agent/KANBAN/EDITION`), avec ses
  cas `T#.x`, ses **décisions `D#` figées** et son **Contrat DOM**. Sinon, le produire d'abord via
  le skill [`plan_test`](../plan_test/SKILL.md).
- La **cible** est identifiée : **un** composant ou **un** service, donc **un** `.spec.ts`. Un plan
  couvrant deux objets (partie A service, partie B écran) donne **deux** passages de ce skill.

---

## Étape 0 — Établir qui lance les tests (**en ouverture de session**)

Ce skill a **besoin** de lancer la suite après chaque cas : c'est elle qui dit s'il faut enchaîner
ou rendre la main. Avant toute lecture de fichier, **établir qui la lance** :

- **La mission reçue du superviseur le précise** → s'y tenir, sans rien demander.
- **Sinon, poser la question** — à l'utilisateur quand il supervise lui-même :

  > « Est-ce que je peux lancer les tests moi-même dans cette session, ou est-ce toi qui les lances
  > et me colles la sortie ? »

  (En sous-agent d'un superviseur, cette question **remonte au superviseur**, jamais à
  l'utilisateur directement.)

- **Si le skill ne peut pas lancer les tests** (agent local sans accès à l'exécution) → il
  **n'annonce aucun statut** : il livre le cas, fournit la **commande exacte**, et attend la
  **sortie collée**. Sans sortie, pas de décision : il ne devine ni le vert ni le rouge, et
  n'enchaîne pas sur le cas suivant.

**Commandes de référence** (depuis la racine du dépôt, cf. [`COMMANDES.md`](../../COMMANDES.md) —
rien ne s'exécute sur l'hôte) :

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false
```

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false --filter="T1.2"
```

Le filtre sert au **diagnostic** du cas ; la **suite complète** fait seule foi pour détecter une
régression. Si Docker n'est pas disponible, demander **quelle commande utiliser** plutôt que d'en
inventer une (une machine peut avoir un Node utilisable hors Docker — mémoire projet
`run-frontend-tests`).

---

## Étape 1 — Lire le dossier de la fonctionnalité et situer la reprise

Un nouveau tour part souvent d'un **sous-agent neuf**, sans mémoire des tours précédents : l'état
du travail se lit **dans les fichiers**, pas dans le souvenir.

1. Lire, dans `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>`, **tout ce qui existe** :

   | Fichier | Ce qu'on y cherche |
   |---|---|
   | `PLAN_TESTS_<CIBLE>.md` | les **cas `T#.x`** (assertions exactes), les **décisions `D#`**, les **doublures prévues**, le **Contrat DOM**, l'**ordre TDD suggéré** |
   | `APPROCHE_<NOM>.md` | le **diagramme de classes** : noms exacts des méthodes, entrées / sorties à invoquer |
   | `FEATURE_<NOM>.md` | le **besoin** et les user stories citées par les cas (`US1`, `US2`…) |
   | `MAQUETTE_*.html` | les **classes CSS** de l'écran, quand le Contrat DOM y renvoie |

2. Lire le **`.spec.ts` de la cible**, s'il existe : les cas `T#.x` **déjà présents** disent où
   l'on en est. Le montage du banc de test et les helpers en place se **réutilisent** — un nouveau
   cas n'ajoute pas un helper jumeau.
3. Lire un **`.spec.ts` jumeau** existant : c'est la source de vérité des **conventions** du projet.
4. **Déterminer le prochain cas** : le premier cas de l'**ordre TDD suggéré** du plan qui n'est pas
   encore dans le `.spec.ts` — sauf si le superviseur en a désigné un autre, auquel cas son choix
   prime.

Ne **rien re-décider** ici : les **décisions `D#`** et le **Contrat DOM** font foi. Une décision
manquante ou contredite → **s'arrêter et la remonter** au superviseur, plutôt que d'improviser.

---

## Boucle — écrire un cas, le lancer, décider

### 1. Écrire **un seul** cas

- Un `it('T1.2 …')` et **rien d'autre** : titre reprenant **l'identifiant et l'énoncé du plan**.
- Créer le `describe` du groupe et son montage (`beforeEach`, doublures, helpers) **seulement au
  premier cas du groupe**, puis s'y greffer.
- **Boîte noire** : interagir par le **DOM** (sélecteurs du Contrat DOM, helpers `type()`,
  `click…()`) ou par l'**API publique** du service ; asserter l'**état observable** et les **appels
  aux doublures**.
- Conventions du projet (**Vitest**, pas Karma) : `import { vi } from 'vitest'` ;
  `describe`/`it`/`expect` en globals ;
  `TestBed.configureTestingModule({ imports: [Composant], providers: [...] })` ; doublure de service
  par **DI** (`{ provide: X, useValue: { m: vi.fn().mockResolvedValue(...) } }`) ; `Router.navigate`
  espionné (`vi.spyOn(router, 'navigate').mockResolvedValue(true)`) ; `ActivatedRoute` stubbé
  (`convertToParamMap`) quand un paramètre de route pilote le mode ;
  `afterEach(() => vi.restoreAllMocks())` ; helper `render()` : `detectChanges()` →
  `await whenStable()` → `detectChanges()`.
- **Jamais de `vi.mock('@capacitor-community/sqlite')`** : doubler `DatabaseService` par DI
  (mémoire `run-frontend-tests`). **Tests de service** : asserter les **données renvoyées**, jamais
  la requête SQL émise.
- **Lisibilité** (mémoire `readable-test-bodies`) : **aucun commentaire dans le corps** d'un `it`
  ni d'un helper, **aucun appel imbriqué** — une **variable intermédiaire nommée** par étape. Le
  « pourquoi » vit dans le titre du `it`, dans l'en-tête JSDoc du helper ou dans le plan de test.

### 2. Lancer et lire le statut

Selon l'étape 0 : lancer la suite, ou fournir la commande et attendre la sortie collée. Puis
classer le résultat — **trois issues, trois conduites** :

| Issue | Conduite |
|---|---|
| **Cas vert** | La cible satisfait déjà ce comportement. **Enchaîner sur le cas suivant** (retour au point 1), sans rien demander. |
| **Cas rouge d'assertion** | Le bon rouge : il décrit le travail de la cible. **S'ARRÊTER** et rapporter (point 3). |
| **Cas rouge de compilation** | ⚠️ `@angular/build:unit-test` compile **tout le bundle en une passe** : un cas qui cite une cible inexistante (`TS2307`) ou une API pas encore écrite (`TS2339`/`TS2345`) **bloque toutes les suites**. Ce n'est pas un rouge d'assertion. **S'ARRÊTER** et rapporter en le nommant comme tel — le squelette de la cible est le travail de `dev_par_cas`, **pas** celui de ce skill. |

⚠️ **Un cas vert du premier coup se vérifie.** Un vert normal (la cible couvre déjà le
comportement) ne se distingue d'un **faux vert** (assertion qui ne mord sur rien : sélecteur absent,
doublure jamais appelée, promesse non attendue) que par un coup d'œil. Au moindre doute, s'assurer
que le cas **échouerait** si le comportement disparaissait ; un faux vert est un **défaut du test**,
à corriger tout de suite — c'est le seul cas où l'on retouche un cas déjà écrit.

Vérifier aussi qu'**aucun cas déjà vert ne casse** et qu'il n'y a pas d'`unhandled rejection`.

### 3. Rapporter, puis **rendre la main**

Au premier rouge — et seulement là — **s'arrêter** et produire le **rapport de passation**, lisible
tel quel par le superviseur :

- **Cas écrits ce tour** : identifiants et statut (`T1.1 vert`, `T1.2 vert`, `T1.3 rouge`).
- **Cas bloquant** : identifiant, énoncé du plan, lien `fichier:ligne`.
- **Nature du rouge** : assertion, ou compilation (avec le code `TS####`).
- **Message d'échec** réel, extrait de la sortie — c'est lui qui dit ce qui manque.
- **Ce que la cible doit faire pour le vert** : sélecteurs, méthode, comportement attendu —
  formulé comme une **consigne directement utilisable par `dev_par_cas`**, sans écrire son code.
- **Totaux réels** de la suite et présence / absence d'`unhandled`.
- **Cas suivant prévu**, pour que le tour d'après sache où reprendre.

Puis **s'arrêter net** : ne pas implémenter, ne pas attendre, ne pas écrire le cas suivant. La main
revient au superviseur, qui lance [`dev_par_cas`](../dev_par_cas/SKILL.md).

---

## Fin de parcours

- **Tous les cas du plan écrits et verts** → faire tourner la **suite complète**, confirmer
  `0 échec` et l'absence d'`unhandled`, puis le rapporter comme **fin du périmètre** : le plan est
  épuisé, il n'y a plus de rouge à faire résoudre.
- Lister ce qui reste **hors périmètre** (cf. § *Hors périmètre* du plan : routes vérifiées à la
  main, lots ultérieurs…).
- Proposer (sans l'imposer) la suite de la chaîne :
  [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md), puis
  [`documenter_sources`](../documenter_sources/SKILL.md).

---

## Rappels

- **Zéro implémentation**, jamais : le `.spec.ts` seul. Pas de squelette de cible, même pour
  débloquer la compilation — c'est le premier travail de `dev_par_cas`.
- **Un cas par tour**, et **arrêt au premier rouge** : c'est ce qui fait tourner la paire.
- **Un vert enchaîne, un rouge rend la main.** Aucune autre conduite.
- Ne pas re-décider le comportement : les **décisions `D#`** et le **Contrat DOM** du plan font
  foi. Un manque → retour à [`plan_test`](../plan_test/SKILL.md), via le superviseur.
- **Jamais de statut annoncé sans la sortie des tests**, qu'elle vienne du skill ou de
  l'utilisateur.
- Convertir les dates relatives en **dates absolues**.
- Ce skill vit dans `.agent/skill/ecrire_tests/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande, le copier dans un dossier de skills reconnu
  (ex. `.claude/skills/ecrire_tests/`), le frontmatter est déjà prêt.
