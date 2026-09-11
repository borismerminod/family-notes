---
name: dev_par_groupes
description: Développe un composant/service en TDD, un groupe de contrôle à la fois. À partir d'un .spec.ts déjà écrit (rouge), implémente le minimum pour faire passer UN groupe (cas T#.x), lance la suite, rapporte honnêtement l'état, fait vérifier à l'utilisateur, et attend sa validation (ou ses ajustements) avant de passer au groupe suivant. Invoquer quand on implémente une réalisation dont le plan de test / spec existe déjà.
---

# Skill — Développement par résolution des groupes de contrôle (TDD)

> **But :** transformer un `.spec.ts` rouge en composant fonctionnel, **groupe par groupe**,
> en faisant valider l'utilisateur à chaque étape. Suite naturelle du skill
> [`plan_test`](../plan_test/SKILL.md).
>
> **Invocation :** « implémente le composant X », « résous le Groupe N », « continue le
> développement » — dès lors qu'un plan de test et un `.spec.ts` existent déjà.
>
> **Règle d'or :** on n'avance **jamais** au groupe suivant sans le **feu vert explicite**
> de l'utilisateur. Chaque étape = un groupe, une vérification, une validation.

---

## Prérequis

- Un **plan de test** (`.agent/PLAN_TESTS_<CIBLE>.md`) et un **`.spec.ts`** existent, avec
  des cas groupés (`Groupe N`, cas `T1.1`, `T1.2`…) et des **décisions D#** figées.
  Sinon, produire d'abord le plan + spec via le skill [`plan_test`](../plan_test/SKILL.md).
- Connaître le **périmètre validé** (ex. « squelette fonctionnel ») et l'**ordre TDD suggéré**
  du plan.

## Boucle par groupe (répéter pour chaque Groupe N)

### 1. Cibler UN groupe
Prendre le prochain groupe dans l'ordre TDD suggéré (ou celui demandé par l'utilisateur).
Relire ses cas `T#.x` dans le `.spec.ts` : ce sont les **assertions exactes** à satisfaire
(sélecteurs du Contrat DOM, appels aux doublures, valeurs attendues).

### 2. Implémenter le minimum
Écrire **le strict nécessaire** pour faire passer ce groupe, en respectant les décisions
`D#`. Ne pas anticiper les groupes suivants ; les laisser rouges (vrai TDD).
- Repérer les **couplages** : un même élément (ex. bouton « Enregistrer ») peut être exigé
  par plusieurs groupes ; l'implémenter fait passer des cas d'autres groupes → **le signaler**
  comme effet de bord assumé, sans élargir le périmètre au-delà du nécessaire.
- **Hygiène** : pas d'`unhandled rejection` (envelopper l'asynchrone qui peut échouer même
  si la gestion fine relève d'un groupe ultérieur).
- Tenir à jour les **commentaires** de la cible (quels groupes réalisés / restants).

### 3. Vérifier (tests d'abord)
Lancer la suite et **extraire l'état du groupe** :

```bash
cd frontend && npx ng test --watch=false > /tmp/test-out.txt 2>&1
grep -E "FAIL .*<cible>.spec" /tmp/test-out.txt | grep -oE "T[0-9]\.[0-9][^\"]*" | sort -u
grep -ciE "unhandled" /tmp/test-out.txt
grep -E "Test Files|Tests " /tmp/test-out.txt | tail -n 2
```

Attendu : le groupe ciblé **disparaît des échecs**, aucun test précédemment vert ne casse,
0 `unhandled`. ⚠️ **Piège builder** : `@angular/build:unit-test` compile tout le bundle en
une passe — une erreur de compilation bloque toutes les suites (cf. `plan_test`).

### 4. Vérifier (rendu réel, si observable)
Si le comportement est visible dans l'app, le prouver via le **Browser pane** :
`preview_start` (ou se connecter au serveur existant), `navigate`, puis `read_page` /
`javascript_tool` / `computer screenshot`. Ne jamais demander à l'utilisateur de vérifier
à la main un état qu'on peut capturer soi-même. Fournir une **capture** ou une preuve DOM.

### 5. Faire valider par l'utilisateur — PUIS s'arrêter
Rapporter **honnêtement** :
- cas du groupe passés (✅) et cas volontairement laissés rouges (❌ + pourquoi) ;
- effets de bord sur d'autres groupes ;
- totaux réels (« X/Y verts »), présence/absence d'`unhandled` ;
- fichiers modifiés (liens `file`).
Puis **demander explicitement la validation** (« je valide et j'enchaîne sur le Groupe N+1 ? »)
et **attendre** : l'utilisateur valide, ou donne des **instructions d'ajustement** à appliquer
avant de continuer. Ne pas enchaîner de soi-même.

## Fin de parcours

- Quand tous les groupes du périmètre sont verts : faire tourner la **suite complète**,
  confirmer `0 échec`, et lister ce qui reste **hors périmètre** (lots ultérieurs).
- Mettre à jour la **mémoire projet** (état livré, pièges découverts) et l'index `MEMORY.md`.
- Ajouter/ajuster les **routes** ou le câblage nécessaires pour un test manuel **seulement**
  si l'utilisateur le demande (ça a été un pas séparé pour le NoteEditor).

## Rappels

- **Un groupe à la fois**, validation entre chaque — c'est le cœur du skill.
- Rester dans le **périmètre validé** ; ne pas glisser vers les fonctionnalités hors lot.
- Les **décisions D#** du plan font foi pour les choix de comportement.
- Toujours rapporter l'**état réel** (jamais « c'est bon » sans preuve de la suite).
- Conventions de test & mock : voir mémoire `test-setup-notes-service` et le skill
  `plan_test`. Pour rendre ce skill invocable en `/`-commande, le copier dans un dossier de
  skills reconnu (ex. `.claude/skills/dev_par_groupes/`), le frontmatter est déjà prêt.
