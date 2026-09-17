# Plan — `SelectionAnalysisService` (analyse DOM de la sélection, alimente le service pur)

> **Approche :** plan de fonctionnalité. Renvois : `PLAN_REFONTE_EDITION_TEXTE.md` (refonte
> édition), `PLAN_TESTS_FORMATTING_SERVICE.md` (service pur `string → string`),
> `PLAN_TESTS_SELECTION_ANALYSIS_SERVICE.md` (plan de test de ce service).
>
> **Contexte (2026-09-13).** Le formatage des marques est confié à un `FormattingService`
> **pur** (`applyFormat(html, action): string`), alimenté par `range.cloneContents()`. Bug :
> `cloneContents()` copie le **contenu** de la sélection, **pas ses ancêtres**. Quand la
> sélection est **à l'intérieur** d'un `<strong>` (ou `<strong><em>…`), le service reçoit du
> texte nu, ne « voit » pas la mise en forme environnante → le bouton ne s'allume pas et
> recliquer **réenveloppe** au lieu de **retirer**. La détection couleur/taille/listes est en
> plus morte (`FormattingService.isActive` renvoie `false` pour ces cas,
> `formatting-service.ts:77-79`).
>
> **Décision.** Introduire un **service supplémentaire d'analyse**, DOM-aware et **en lecture
> seule**, qui (1) récupère de façon fiable le **HTML structurant** de la sélection (ancêtres
> inclus), (2) le fournit au `FormattingService` pur pour un toggle correct (ajouter si absent,
> retirer si présent), et (3) détecte les balises structurantes pour **signaler à la toolbar**
> quels styles sont actifs. `Selection`/`Range`/DOM sont supportés par jsdom → **testable en
> unitaire** (contrairement à `execCommand`, jamais utilisé ici).

## 1. Objet testé / responsabilités

Un service qui, pour un **élément éditeur** (`contenteditable`) donné et la **sélection
courante** (`window.getSelection()`), **sans jamais muter le DOM**, sait :

- **récupérer le HTML structurant** de la sélection avec ses **ancêtres de mise en forme**
  reconstruits jusqu'à la borne éditeur — ex. sélection dans `<strong><em>texte</em></strong>`
  → renvoie `<strong><em>texte</em></strong>` et non `texte` ;
- **détecter l'état des styles actifs** `{ bold, italic, underline, bullet, numbered, color,
  size }` par remontée d'ancêtres bornée à l'éditeur (pour la surbrillance des boutons) ;
- **désigner la cible de remplacement** : le `Range`/nœud réel que le composant doit remplacer à
  la réinsertion (par défaut le `Range` courant ; pour un désenrobage, l'**ancêtre** de marque
  qui couvre entièrement la sélection).

La **mutation** (envelopper/désenrober, en `string → string`) **reste dans le `FormattingService`
pur** (inchangé). Le composant `RichTextEditor` **orchestre** : il demande le HTML structurant et
la cible au service d'analyse, transforme via le service pur, puis réinsère.

## 2. Dépendances et doublures de test

- Aucune doublure : le service utilise les **vraies** API `window.getSelection()` / `Range` /
  DOM, **supportées par jsdom**. **Jamais** d'`execCommand`/`queryCommand*`.
- Les tests montent un éditeur réel : élément attaché à `document.body`, `innerHTML` connu, puis
  une **vraie sélection** posée sur un `Range` (helper `selectText(...)`). Ils asservissent
  ensuite la chaîne retournée et/ou l'objet `ActiveStyles`.
- `FormattingService` (pur) reste testé séparément par `formatting-service.spec.ts` (non modifié).

## 3. Décisions de conception à figer (impactent les assertions)

- **D1 — Lecture seule / DOM-aware.** Le service reçoit l'**élément éditeur**, lit la **sélection
  courante**, inspecte le DOM vivant mais **ne le mute jamais**. La mutation reste dans
  `FormattingService`, orchestrée par le composant. *(validé)*
- **D2 — Détection par ancêtre bornée.** « style actif » ⇔ le nœud de la sélection possède un
  **ancêtre** portant la balise/le style, **contenu dans l'éditeur** (remontée type
  `closest(...)` arrêtée à la borne `editor`). *(validé)*
- **D3 — HTML structurant reconstruit.** À partir du contenu cloné de la sélection, **ré-envelopper
  par les ancêtres de mise en forme** rencontrés en remontant jusqu'à l'éditeur, dans l'ordre,
  afin que le service pur reçoive `<strong><em>…</em></strong>` (et non du texte nu). *(à confirmer)*
- **D4 — Cible de remplacement.** Envelopper (style absent) → remplacer le **`Range` courant**.
  Désenrober (marque présente couvrant **toute** la sélection) → remplacer l'**ancêtre** de
  marque. *(à confirmer)*
- **D5 — Balises / styles.** `bold → <strong>`, `italic → <em>`, `underline → <u>` (cohérent avec
  `FormattingService.MARK_TAG`, `formatting-service.ts:29-33`) ; **couleur** = `color` inline
  d'un `<span>` ancêtre ; **taille** = balise `<h1>`/`<h2>` ancêtre ou `font-size` inline d'un
  `<span>` ancêtre ; **liste** = ancêtre `<ul>` (bullet) / `<ol>` (numbered). *(validé)*
- **D6 — Périmètre détection = tous les styles.** marques + listes + couleur + taille. *(validé)*
- **D7 — Gardes.** Pas de sélection, sélection **hors** de l'éditeur, ou sélection **repliée**
  (curseur seul) → HTML structurant `''`, `ActiveStyles` neutres, cible `null`. *(validé)*
- **D8 — État `ActiveStyles`.** Reprend exactement la forme du signal `active` déjà présent dans
  `rich-text-editor.ts:62-78` → substitution directe sans changer le template de la toolbar. *(validé)*

## 4. Cas de test

### Groupe 1 — Détection de l'état actif (`getActiveStyles`)
- **T1.1** Sélection **dans** un `<strong>` → `bold` = **vrai**.
- **T1.2** Sélection de texte **nu** → tous les booléens **faux**, `color = ''`, `size = 'normal'`.
- **T1.3** Sélection dans `<strong><em>…</em></strong>` → `bold` **et** `italic` **vrais**
  (marques imbriquées : gras ET italique).
- **T1.4** Sélection dans un `<span style="color:…">` → `color` = la couleur détectée.
- **T1.5** Sélection dans un `<h1>`/`<h2>` ou un `<span style="font-size:…">` → `size` détectée.
- **T1.6** Sélection dans un `<ul>`/`<ol>` → `bullet`/`numbered` = **vrai**.
- **T1.7** Sélection **hors** éditeur / pas de sélection / repliée → tout neutre (D7).

### Groupe 2 — HTML structurant (`getStructuringHtml`)
- **T2.1** Éditeur = `<strong>Bonjour</strong>`, sélection = « Bonjour » → renvoie
  `<strong>Bonjour</strong>` (l'ancêtre est reconstruit, pas juste `Bonjour`).
- **T2.2** Sélection dans `<strong><em>Bonjour</em></strong>` → renvoie
  `<strong><em>Bonjour</em></strong>` (ancêtres imbriqués reconstruits dans l'ordre).
- **T2.3** Texte nu sélectionné → renvoie le texte tel quel (aucun ancêtre de mise en forme).
- **T2.4** Pas de sélection utile (D7) → renvoie `''`.

### Groupe 3 — Cible de remplacement (`getReplacementRange`)
- **T3.1** Style **absent** + action d'ajout → renvoie le **`Range` courant**.
- **T3.2** Marque **présente couvrant toute** la sélection + action de la même marque → renvoie
  un `Range` sur l'**ancêtre** de marque (permet au composant de le remplacer par le résultat
  désenrobé).
- **T3.3** Pas de sélection utile (D7) → renvoie `null`.

### Groupe 4 — Intégration (dans `RichTextEditor`, vérif. navigateur)
- **T4.1** Sélection dans un `<strong>` : le bouton **gras s'allume** (surbrillance).
- **T4.2** Recliquer sur gras : le `<strong>` est **retiré** (plus de réenveloppement).
- **T4.3** Gras+italique imbriqués : les deux boutons s'allument ; retirer l'un conserve l'autre.

## 5. Contrat d'API (à affiner au spec)

```ts
interface ActiveStyles {
  bold: boolean; italic: boolean; underline: boolean;
  bullet: boolean; numbered: boolean;
  color: string;      // '' si aucune
  size: BlockSize;    // 'normal' par défaut
}

getStructuringHtml(editor: HTMLElement): string;
  // HTML structurant de la sélection, ancêtres de mise en forme inclus ; '' si sélection inutile.

getActiveStyles(editor: HTMLElement): ActiveStyles;
  // état des styles actifs (remontée d'ancêtres bornée à l'éditeur) pour la surbrillance toolbar.

getReplacementRange(editor: HTMLElement, action: FormatAction): Range | null;
  // Range à remplacer : Range courant (ajout) ou ancêtre de marque (désenrobage) ; null si inutile.
```

> Le composant appellera : sur commande, `getStructuringHtml` + `getReplacementRange`, puis
> `FormattingService.applyFormat(...)`, puis réinsertion dans le `Range` cible ; sur
> `selectionchange`, `getActiveStyles` pour mettre à jour le signal `active`.

## 6. Intégration dans `RichTextEditor` (`rich-text-editor.ts`)

- `applyToSelection` (`rich-text-editor.ts:140-159`) : remplacer l'extraction par
  `holder.appendChild(range.cloneContents())` par
  `selectionAnalysis.getStructuringHtml(editor)` ; réinsérer via
  `selectionAnalysis.getReplacementRange(editor, action)` plutôt que le seul `range` courant.
- `refreshActive` (`rich-text-editor.ts:184-219`) : remplacer les appels à
  `FormattingService.isActive(...)` par `this.active.set(selectionAnalysis.getActiveStyles(editor))`
  (détection fiable de **tous** les styles).
- `FormattingService` (`formatting-service.ts`) : **inchangé** ; continue le `string → string`.
  Son `isActive` peut rester pour ses propres tests unitaires.

## 7. Hors périmètre (explicite)

- **Désenrobage partiel** (la marque **déborde** la sélection → il faut *découper* l'ancêtre pour
  ne retirer le style que sur la portion sélectionnée) → **lot ultérieur**. La **détection**
  (surbrillance) fonctionne quand même dans ce cas ; seul le **retrait propre** est reporté.
- **Frappe curseur-replié** (« marque armée » : taper du gras sans sélection) → lot ultérieur.
- **Toggle off des listes** côté mutation (le service pur ne fait qu'envelopper aujourd'hui,
  `formatting-service.ts:131-138`) → seule la **détection** de liste est couverte ici.
- Restauration fine du curseur au-delà de « la sélection reste sur le texte affecté ».

## 8. Réconciliation (historique)

Un plan de test antérieur (`PLAN_TESTS_SELECTION_FORMAT_SERVICE.md`, **supprimé**) supposait un
service DOM-aware qui **mutait** lui-même le DOM (design **A** : `toggle(editor, mark)` +
`isActive(editor, mark)`, marques seules). On retient ici le design **B** : service d'analyse
**en lecture seule** + mutation **conservée** dans le `FormattingService` pur, et périmètre de
détection **élargi à tous les styles**. Le plan de test à jour est
`PLAN_TESTS_SELECTION_ANALYSIS_SERVICE.md` (API `getStructuringHtml` / `getActiveStyles` /
`getReplacementRange`, aucune mutation dans le service).

## 9. Vérification

- **Unitaire (jsdom)** : `selection-analysis-service.spec.ts` avec helper `selectText(...)`,
  éditeur attaché à `document.body` ; couvre les Groupes 1 à 3 (marques imbriquées gras+italique,
  couleur, taille, listes, reconstruction du HTML structurant, cible de remplacement, gardes).
- **Non-régression** : `npm test` (Karma) pour `FormattingService` (inchangé) et
  `RichTextEditor`.
- **Navigateur** (jsdom ne rend pas le rich text) : sélectionner du texte dans / hors d'un
  `<strong>`, vérifier la surbrillance des boutons (T4.1) et le toggle correct — ajout puis
  retrait (T4.2, T4.3).

## 10. Points à valider avant d'écrire le `.spec.ts`

1. **Nom & emplacement** : `SelectionAnalysisService` dans
   `core/services/selection-analysis-service.ts` (vs `SelectionFormatService` du plan de test à
   réconcilier) ?
2. **Reconstruction du HTML structurant (D3)** et **cible de remplacement (D4)** : approche
   `Range`/clonage + ré-enveloppement vs remplacement d'ancêtre — figer avant les assertions.
3. Confirmer le **report** du désenrobage partiel et du toggle-off des listes à un lot ultérieur.

## Fichiers concernés (à l'implémentation)

- **Créer** : `frontend/src/app/core/services/selection-analysis-service.ts` (+ `.spec.ts`).
- **Modifier** : `frontend/src/app/rich-text-editor/rich-text-editor.ts` (`applyToSelection`,
  `refreshActive`).
- **Inchangé** : `frontend/src/app/core/services/formatting-service.ts`.
- **Plan de test** : `.agent/PLAN_TESTS_SELECTION_ANALYSIS_SERVICE.md`.
