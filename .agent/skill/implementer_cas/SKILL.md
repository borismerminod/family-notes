---
name: implementer_cas
description: Écrit UNIQUEMENT l'implémentation qui fait passer au vert les cas de test déjà présents dans un .spec.ts — composant (.ts + .html + .css) ou service. S'appuie sur le dossier de la fonctionnalité (.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE> — FEATURE_*, APPROCHE_*, PLAN_TESTS_*, MAQUETTE_*) et sur le cas de test lui-même, lance la commande de test (si l'utilisateur l'y autorise), confirme le vert sans régression, puis rend la main. N'écrit JAMAIS de test et ne touche jamais au .spec.ts : l'écriture du cas suivant revient à l'autre agent. Invoquer quand un cas de test rouge attend son implémentation.
---

# Skill — Implémentation d'un cas de test (`.spec.ts` rouge → vert)

> **But :** écrire le code qui **résout le ou les cas de test rouges** d'un `.spec.ts` déjà écrit —
> dans un **composant** (`.ts`, `.html`, `.css`) ou dans un **service** — puis rendre la main une
> fois le vert prouvé.
>
> **Invocation :** « implémente le cas `T3.2` », « fais passer ce cas au vert », « réalise
> l'implémentation du spec ».
>
> **Pendant de [`tdd_cas_par_cas`](../tdd_cas_par_cas/SKILL.md)**, qui écrit les cas un à un sans
> jamais toucher à la cible. Les deux skills se relaient autour du même `.spec.ts` : l'un écrit le
> cas, celui-ci le résout, et la main revient à l'autre pour le cas suivant.
>
> **Règle d'or :** ce skill **n'écrit aucun test**. Il ne modifie **jamais** le `.spec.ts` — ni un
> titre, ni une assertion, ni un helper, ni un `beforeEach`, même pour « corriger » un cas qui
> paraît faux. Un cas douteux se **signale** à l'utilisateur, qui pilote l'agent d'écriture des
> tests. Adapter le test au code au lieu du code au test viderait le TDD de son sens.

---

## Prérequis

- Un **`.spec.ts`** existe, avec au moins un cas `T#.x` **rouge** à résoudre.
- Le **dossier de la fonctionnalité** `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>` (par exemple
  `.agent/KANBAN/EDITION`) contient le plan de test de référence et ses **décisions `D#`**.
- La **cible** est identifiée : **un** composant (`frontend/src/app/<cible>/`) ou **un** service
  (`frontend/src/app/core/services/`).

---

## Étape 0 — Demander qui lance les tests (**obligatoire, en ouverture de session**)

**Premier échange du skill, avant toute lecture de fichier**, poser la question :

> « Est-ce que je peux lancer les tests moi-même dans cette session, ou est-ce toi qui les lances
> et me colles la sortie ? »

- **Oui, le skill lance les tests** → c'est lui qui exécute la commande après chaque passe
  d'implémentation, et qui ne conclut qu'au vu de la sortie.
- **Non (agent local sans accès à l'exécution)** → le skill **n'annonce jamais un vert** de
  lui-même. Il livre le code, fournit la **commande exacte** à lancer, et attend la **sortie
  collée** par l'utilisateur. Un code « qui devrait passer » n'est pas un cas vert : ne pas rendre
  la main sur une déduction.

Noter la réponse et s'y tenir pour toute la session ; ne reposer la question que si l'utilisateur
change d'avis.

**Commandes de référence** (depuis la racine du dépôt, cf. [`COMMANDES.md`](../../COMMANDES.md) —
rien ne s'exécute sur l'hôte) :

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false
```

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false --filter="T3.2"
```

Le filtre sert au **diagnostic** pendant l'écriture ; la **suite complète** fait seule foi avant de
rendre la main (c'est elle qui révèle les régressions). Si Docker n'est pas disponible dans la
session, demander **quelle commande utiliser** plutôt que d'en inventer une (une machine peut avoir
un Node utilisable hors Docker — voir la mémoire projet `run-frontend-tests`).

---

## Étape 1 — Lire le contrat avant d'écrire

Dans l'ordre, et **sans rien écrire** :

1. **Le cas de test lui-même** dans le `.spec.ts` : c'est le **contrat exécutable**. En relever les
   **sélecteurs** interrogés, les **appels aux doublures** attendus, les **valeurs** et **textes**
   exacts, et le montage du banc de test (quelles dépendances sont fournies, donc injectables).
2. `PLAN_TESTS_<CIBLE>.md` : l'énoncé du cas, ses **décisions `D#`** et le **Contrat DOM** — la
   table des sélecteurs que le gabarit **doit** honorer.
3. `APPROCHE_<NOM>.md` : le **diagramme de classes** (noms exacts des méthodes, entrées / sorties)
   et les **algorithmes** à suivre. L'implémentation s'y conforme plutôt que d'improviser sa propre
   structure.
4. `FEATURE_<NOM>.md` : la user story citée par le cas, pour comprendre l'intention.
5. `MAQUETTE_*.html`, quand elle existe : **classes CSS**, structure et styles de l'écran. Le `.css`
   du composant s'en inspire directement ; les sélecteurs du Contrat DOM priment en cas d'écart.
6. **Le code existant** : la cible, ses **jumeaux** (un composant d'écran déjà livré), les
   **modèles** et **services** de `frontend/src/app/core/`.

Si le cas de test **contredit** le plan ou l'approche, ou exige un comportement impossible :
**s'arrêter et le signaler** avec les deux lectures en regard. Ne pas trancher seul, ne pas
contourner par le code, ne pas modifier le test.

---

## Étape 2 — Implémenter le minimum

- **Le strict nécessaire** pour les cas ciblés, en respectant les **décisions `D#`**. Ne pas
  anticiper les cas que l'autre agent n'a pas encore écrits : les laisser rouges est le
  fonctionnement normal du TDD.
- **Rouge de compilation** : si le spec importe une cible **inexistante** (`TS2307`) ou une API pas
  encore écrite (`TS2339`/`TS2345`), `@angular/build:unit-test` compile **tout le bundle en une
  passe** et **bloque toutes les suites**. Première tâche : créer le **squelette** de la cible
  (classe, gabarit, feuille de style) pour débloquer la compilation et obtenir un vrai rouge
  d'assertions.
- **Composant** → les **trois fichiers** : la classe `.ts`, le gabarit `.html` honorant les
  sélecteurs du Contrat DOM, et le `.css` reprenant la maquette. Composant **standalone**
  (Angular 21).
- **Service** → l'API du diagramme de classes. **Migrations SQLite** : des fichiers `.sql` dans
  `frontend/public/assets/migrations/`, joués par `SchemaMigrationService` — **jamais de SQL
  dupliqué en TypeScript**. Aucun **état partagé dans un `static`** : il fuit d'un fichier de spec
  à l'autre (mémoire `run-frontend-tests`).
- **Règles de code du projet** (cf. [`AGENT.md`](../../AGENT.md) § 4) : **SOLID**, une
  responsabilité par classe / fonction ; **nommage porteur de sens** ; la **lisibilité prime sur la
  concision** ; **pas d'appels imbriqués** — des variables intermédiaires nommées ; **commentaires
  en en-tête** de classe, de fonction et d'attribut (**JSDoc en anglais**), **jamais dans le corps
  d'une fonction** — un bloc qui a besoin d'être expliqué devient une fonction nommée.
- **Hygiène** : aucun `unhandled rejection` — envelopper l'asynchrone qui peut échouer, même quand
  sa gestion fine relève d'un cas ultérieur.

---

## Étape 3 — Vérifier (la sortie des tests, rien d'autre)

Selon la réponse de l'**étape 0**, lancer la suite ou demander sa sortie, puis vérifier les
**trois** points :

1. le ou les **cas ciblés sont verts** ;
2. **aucun cas déjà vert n'a cassé** — comparer les totaux, pas seulement le cas du jour ;
3. **zéro `unhandled`**.

Tant que l'un des trois manque, continuer à corriger **la cible** — jamais le test.

**Vérification du rendu réel (facultative).** Si le comportement est visible dans l'application et
que l'utilisateur a autorisé l'exécution de commandes, en fournir une **preuve** (capture d'écran ou
état du DOM) plutôt que de lui demander de vérifier à la main. ⚠️ `ng serve` échoue depuis certains
shells (droits `root` sur `.angular/cache`) : si c'est le cas, le dire au lieu d'insister.

---

## Étape 4 — Rapporter et **rendre la main**

Rapport honnête et court :

- **les cas passés au vert** (identifiants) et les **fichiers écrits** (liens `fichier:ligne`) ;
- les **totaux réels** de la suite (« X/Y verts, 0 `unhandled` »), issus de la **sortie** ;
- les **effets de bord** assumés : un sélecteur ou un bouton exigé par le cas du jour peut faire
  passer des cas suivants au vert — le signaler, sans élargir le périmètre pour autant ;
- les **cas volontairement laissés rouges**, et pourquoi ;
- les **écarts** relevés à l'étape 1 et laissés à l'arbitrage de l'utilisateur.

Puis **s'arrêter** et dire explicitement que la main revient à l'**agent d'écriture des tests**
([`tdd_cas_par_cas`](../tdd_cas_par_cas/SKILL.md)) pour le **cas suivant**. Ne pas écrire ce cas,
ne pas le deviner, ne pas enchaîner.

---

## Fin de parcours

- Tous les cas du périmètre verts → **suite complète**, `0 échec` confirmé, puis liste de ce qui
  reste **hors périmètre** (cf. § *Hors périmètre* du plan de test : routes vérifiées à la main,
  lots ultérieurs…).
- Proposer (sans l'imposer) la suite de la chaîne :
  [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md) puis
  [`documenter_sources`](../documenter_sources/SKILL.md).
- Mettre à jour la **mémoire projet** si un piège nouveau est apparu, et son index `MEMORY.md`.

---

## Rappels

- **Zéro ligne de test.** Le `.spec.ts` est en lecture seule pour ce skill ; un cas douteux se
  signale, il ne se corrige pas.
- **Le minimum pour le vert** : rester dans le périmètre du cas, ne pas anticiper les suivants.
- Les **décisions `D#`**, le **Contrat DOM** et le **diagramme de classes** font foi — l'approche
  n'est pas réinventée au moment d'implémenter.
- **Jamais de vert annoncé sans la sortie des tests**, qu'elle vienne du skill ou de l'utilisateur.
- Convertir les dates relatives en **dates absolues**.
- Ce skill vit dans `.agent/skill/implementer_cas/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande, le copier dans un dossier de skills reconnu
  (ex. `.claude/skills/implementer_cas/`), le frontmatter est déjà prêt.
