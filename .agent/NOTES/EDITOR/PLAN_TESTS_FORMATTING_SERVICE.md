# Plan de Test (TDD) — `FormattingService` (service pur de mise en forme)

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable** du service
> avant toute implémentation. Calqué sur `PLAN_TESTS_NOTE_LIST.md`.
>
> **Contexte (2026-09-13).** On repart sur un `FormattingService` de conception **différente**
> de la précédente (qui s'appuyait sur `document.execCommand` — supprimée). Nouveau modèle validé
> avec l'utilisateur : un service **pur** qui **prend le HTML d'une sélection et renvoie le HTML
> transformé** ; c'est le **composant** (`RichTextEditor`) qui possède la sélection du
> `contenteditable` et **réinsère** le résultat. Ce choix **révise la décision D1 de
> `PLAN_REFONTE_EDITION_TEXTE.md` §5** (moteur natif `execCommand`).
>
> **Avantage clé :** le service ne touche **jamais** au `document` global ni à la sélection —
> ce sont des fonctions pures `string → string`. Il est donc **entièrement testable sous jsdom**,
> sans mock global (contrairement à `execCommand`/`queryCommand*`).

## 1. Objet testé

Un service qui transforme un fragment de HTML (le contenu **sélectionné** dans l'éditeur) selon
une **action de mise en forme**, et renvoie le HTML résultant.

Rôle fonctionnel :
- **envelopper** une sélection dans la mise en forme demandée (marque, couleur, taille, liste) ;
- **basculer (toggle)** : si la sélection porte **déjà** la marque, la **retirer** ;
- **cumuler** proprement des mises en forme différentes (gras **et** souligné) par imbrication ;
- rester **pur** : mêmes entrées → mêmes sorties, aucun effet de bord.

### Périmètre validé (ce lot de tests)
Transformation d'une sélection : marques (gras / italique / souligné), couleur, taille, listes ;
toggle des marques ; cumul par imbrication ; cas limites (sélection vide).

### Hors périmètre (explicite)
- La **capture** de la sélection et la **réinsertion** dans le `contenteditable` → responsabilité
  du composant `RichTextEditor` (testée côté composant).
- L'**insertion média** (image / vidéo au caret) → insertion au curseur, concern du composant.
- Les **sélections partielles / mixtes** (une partie seulement du texte déjà grasse, styles
  hétérogènes) → **hors de ce premier lot** ; on traite d'abord les cas « sélection entière ».
  Le comportement sur sélection mixte sera spécifié dans un lot ultérieur.
- L'**état actif** des boutons de la toolbar → voir §4bis (proposé en option, `à confirmer`).
- Le **style visuel** et la persistance.

## 2. Dépendances (abstraites) et doublures de test

Le service est **pur** : pas de collaborateur à doubler, pas de `document` global, pas de réseau.
- Il peut utiliser une primitive d'**analyse HTML** (p.ex. un élément gabarit / `DOMParser`) pour
  inspecter la sélection entrante — mais uniquement des API DOM **locales** (supportées par jsdom),
  jamais l'API d'édition (`execCommand`) ni la sélection globale (`window.getSelection`).
- Les tests appellent directement les fonctions et **asservissent la sortie** (chaîne HTML
  attendue). Aucune doublure nécessaire.

## 3. Décisions de conception à figer (impactent les assertions)

- **D1 — Service pur `string → string`.** Entrée : HTML de la sélection. Sortie : HTML transformé.
  Aucun accès `document` global / sélection. *(validé)*
- **D2 — Marques = toggle.** Si la sélection est **déjà entièrement** enveloppée par la marque
  demandée → on **désenrobe** ; sinon → on **enveloppe**. *(à confirmer ; alternative : « ajout
  simple » qui empile — écarté car reproduit les bugs du plan de refonte §1)*
- **D3 — Balises sémantiques.** `bold → <strong>`, `italic → <em>`, `underline → <u>`
  (cohérent avec l'ancienne toolbar et le HTML stocké). *(à confirmer)*
- **D4 — Couleur & taille = `<span style>` avec remplacement.** Ré-appliquer une couleur (resp.
  une taille) **remplace** le style existant de même nature plutôt que d'empiler un span. *(à confirmer)*
- **D5 — Taille : mapping.** `small`/`large` → `font-size` inline ; `normal` → **texte inchangé**
  (aucun span) ; `h1`/`h2` → balises `<h1>`/`<h2>` (cohérent avec le contenu « document riche »).
  *(à confirmer — valeurs exactes à figer au spec)*
- **D6 — Listes.** Multi-lignes (séparées par `\n`) → un `<li>` par ligne, enveloppées dans
  `<ul>` (puces) ou `<ol>` (numérotée). *(à confirmer ; toggle des listes hors de ce lot)*
- **D7 — Cumul par imbrication.** Appliquer une marque sur une sélection portant **une autre**
  mise en forme **imbrique** sans écraser l'existant (p.ex. gras sur `<u>x</u>` → `<strong><u>x</u></strong>`).
- **D8 — Sélection vide → sortie vide** (garde ; rien à formater).

## 4. Cas de test

### Groupe 1 — Marques : envelopper une sélection nue
- **T1.1** `bold` sur `Bonjour` → `<strong>Bonjour</strong>`.
- **T1.2** `italic` sur `Bonjour` → `<em>Bonjour</em>`.
- **T1.3** `underline` sur `Bonjour` → `<u>Bonjour</u>`.

### Groupe 2 — Marques : toggle (désenrober) — D2
- **T2.1** `bold` sur `<strong>Bonjour</strong>` → `Bonjour` (marque retirée).
- **T2.2** `italic` sur `<em>Salut</em>` → `Salut`.
- **T2.3** `underline` sur `<u>Note</u>` → `Note`.
- **T2.4** `bold` sur `<em>Salut</em>` (pas déjà gras) → **enveloppe** en préservant l'italique
  → `<strong><em>Salut</em></strong>` (toggle ⇒ ajoute car marque absente ; cf. D7).

### Groupe 3 — Marques : cumul par imbrication — D7
- **T3.1** `bold` sur `<u>x</u>` → `<strong><u>x</u></strong>` (gras **et** souligné).
- **T3.2** `italic` sur `<strong>x</strong>` → `<em><strong>x</strong></em>`.

### Groupe 4 — Couleur — D4
- **T4.1** `color(#FF3B30)` sur `x` → `<span style="color:#FF3B30">x</span>`.
- **T4.2** Ré-appliquer `color(#007AFF)` sur `<span style="color:#FF3B30">x</span>` → **remplace**
  → `<span style="color:#007AFF">x</span>` (pas d'empilement de spans).

### Groupe 5 — Taille — D5
- **T5.1** `size(small)` sur `x` → un span de taille réduite (valeur exacte figée au spec).
- **T5.2** `size(large)` sur `x` → un span de taille agrandie.
- **T5.3** `size(normal)` sur `x` → `x` **inchangé** (aucun span de taille).
- **T5.4** `size(h1)` sur `Titre` → `<h1>Titre</h1>` ; `size(h2)` → `<h2>…</h2>`.
- **T5.5** Ré-appliquer une taille **remplace** la précédente (pas d'empilement).

### Groupe 6 — Listes — D6
- **T6.1** `list(bullet)` sur `Ligne 1\nLigne 2` → `<ul><li>Ligne 1</li><li>Ligne 2</li></ul>`.
- **T6.2** `list(numbered)` sur `Ligne 1\nLigne 2` → `<ol><li>Ligne 1</li><li>Ligne 2</li></ol>`.
- **T6.3** `list(bullet)` sur une seule ligne `Élément` → `<ul><li>Élément</li></ul>`.

### Groupe 7 — Cas limites — D8
- **T7.1** Sélection **vide** (`''`) → sortie vide (`''`), quelle que soit l'action.
- **T7.2** La fonction est **pure** : deux appels identiques renvoient exactement la même sortie
  et n'altèrent pas l'entrée.

## 4bis. Groupe optionnel — Requête d'état actif *(à confirmer)*

Utile au composant pour la surbrillance des boutons ; à trancher : dans le service (pur) ou côté
composant. Si retenu dans le service :
- **T8.1** « la sélection est-elle déjà en gras ? » : vrai sur `<strong>x</strong>`, faux sur `x`.
- **T8.2** idem italique / souligné.

## 5. Contrat d'API (fixe le contrat que l'implémentation devra honorer)

Décrit sans figer l'implémentation ; les noms précis seront arrêtés au spec.

- **Type d'action** (union discriminée, reprise/adaptée de l'ancienne toolbar) :
  ```
  type FormatAction =
    | { type: 'bold' | 'italic' | 'underline' }
    | { type: 'color'; color: string }
    | { type: 'size'; size: BlockSize }        // BlockSize: small|normal|large|h2|h1
    | { type: 'list'; style: 'bullet' | 'numbered' };
  ```
- **Transformation** : `applyFormat(html: string, action: FormatAction): string`
  — cœur du service ; pur ; sélection vide → `''`.
- **(optionnel, 4bis)** `isActive(html: string, action: FormatAction): boolean`
  — la sélection porte-t-elle déjà cette mise en forme ? *(à confirmer)*

## 6. Ordre d'implémentation TDD suggéré

1. **Groupe 1** (envelopper les marques) →
2. **Groupe 2** (toggle / désenrober) →
3. **Groupe 3** (cumul par imbrication) →
4. **Groupe 4** (couleur + remplacement) →
5. **Groupe 5** (taille + remplacement) →
6. **Groupe 6** (listes) →
7. **Groupe 7** (cas limites / pureté) →
8. *(si retenu)* **Groupe 4bis** (`isActive`).

À chaque cas : écrire le test (**rouge**), écrire le minimum de code pour le faire passer
(**vert**), refactorer si besoin.

## 7. Points à valider avant d'écrire le `.spec.ts`

1. **D2 — toggle vs ajout simple** : on confirme le **toggle** (recliquer retire) ? *(recommandé)*
2. **D5 — taille** : `small/large` en `font-size` inline et `h1/h2` en balises `<h1>/<h2>` ?
   valeurs `font-size` exactes ?
3. **4bis — `isActive`** : dans le service (pur) ou laissé au composant ?
4. **Périmètre** : on garde bien les **sélections partielles/mixtes hors** de ce premier lot ?
