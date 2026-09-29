import { EditHistory, HistoryEntry, TYPING_COALESCE_PAUSE_MS } from './edit-history';
import { DocModel } from '../models/document.model';
import { ModelSelection } from './document-selection';

/**
 * Tests de `EditHistory` — cœur PUR de l'historique undo/redo (pile passé/futur + coalescing de
 * frappe + bornage), sans aucune dépendance Angular/DOM — TDD / boîte noire.
 * Voir .agent/UNDO_REDO/PLAN_TESTS_EDIT_HISTORY.md (Lot A, validé 2026-09-20) et
 * .agent/UNDO_REDO/APPROCHE_UNDO_REDO.md.
 *
 * Doublures : AUCUNE, aucun DOM. On instancie directement (`new EditHistory()`), comme
 * `DocumentModelService` dans `document-model.spec.ts`. L'horloge est **injectée par paramètre**
 * (`recordTyping(entry, now, …)`) → coalescing déterministe et instantané, pas de `vi.useFakeTimers`.
 *
 * Décisions figées (cf. plan §3 + §7, arbitrage utilisateur 2026-09-20) :
 *   D1 — `recordTyping(entry, now, isBoundary = false)` ; frontière de mot = 3ᵉ arg booléen.
 *   D2 — pause `>= 500 ms` scelle (Δ = 500 pile → nouveau pas ; Δ = 499 → regroupé).
 *   D3 — `new EditHistory(limit = 100)` ; au-delà, éjection FIFO du plus ancien pas.
 *   D4 — `seal()` public et testé directement ; `truncateFuture`/`enforceLimit` internes
 *        (jamais appelés par les tests, couverts via `push`/`recordTyping`).
 *   D5 — séparateur (`isBoundary`) étend PUIS scelle le pas courant (« mot + espace » = 1 pas) ;
 *        le caractère non-séparateur suivant ouvre un nouveau pas.
 *   D6 — construction vide (`canUndo`/`canRedo` = false) ; premier `push`/`recordTyping` à froid toléré.
 *   D7 — snapshot = référence (pas de clone) : undo/redo renvoient l'entrée poussée (`toBe`).
 *   D8 — `recordTyping` ouvre un pas via `push` (scelle/tronque/borne) ; prolonge via remplacement en place.
 */

// --- Helpers de construction (aucun montage DOM) ------------------------------

/** Faux `DocModel` minimaliste ; chaque appel crée une **référence distincte** (sentinelle d'identité, D7). */
function mkModel(text: string): DocModel {
  return [{ id: 'b1', kind: 'text', text, marks: [] }];
}

/** Construit un `HistoryEntry` (paire {model, selection}) à référence unique, transportée telle quelle. */
function mkEntry(text: string, selection: ModelSelection | null = null): HistoryEntry {
  return { model: mkModel(text), selection };
}

/** Sélection modèle littérale (bloc `b1`), pour vérifier la mémorisation par pas (D3). */
function sel(fromOffset: number, toOffset: number): ModelSelection {
  return { from: { blockId: 'b1', offset: fromOffset }, to: { blockId: 'b1', offset: toOffset } };
}

describe('EditHistory (historique undo/redo, pur)', () => {
  let history: EditHistory;

  beforeEach(() => {
    history = new EditHistory();
  });

  // ==========================================================================
  // Groupe 1 — Amorçage & reset (US2, US4, US6, D7/C4)
  // ==========================================================================
  describe('amorçage & reset', () => {
    it('T1.1 à la construction (avant amorçage) : canUndo et canRedo = false (D6)', () => {
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('T1.2 reset(e0) pose un pas initial : passé ET futur vides (US2/US4/US6)', () => {
      history.reset(mkEntry('e0'));
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('T1.3 un nouveau reset repurge tout : canUndo/canRedo = false et undo() = null (D7)', () => {
      history.reset(mkEntry('e0'));
      history.push(mkEntry('e1'));
      history.push(mkEntry('e2'));
      history.reset(mkEntry('eN'));
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
      expect(history.undo()).toBeNull();
    });

    it('T1.4 undo()/redo() juste après reset (aucune action) → null chacun (no-op)', () => {
      history.reset(mkEntry('e0'));
      expect(history.undo()).toBeNull();
      expect(history.redo()).toBeNull();
    });

    it('T1.5 reset(e0) referme la salve ouverte (C1/R2, APPROCHE §3) : une frappe rapprochée (Δ < 500 ms) après reset OUVRE un nouveau pas au lieu d\'écraser le seed en place', () => {
      // Scénario réel (Lot C recharge une note) : une salve est OUVERTE dans la note précédente,
      // puis `reset` réamorce l'historique. Sans `run = null` dans `reset`, l'ancien run survit :
      // la 1re frappe de la note rechargée à Δ < 500 ms « prolonge en place » (entries[index] =
      // entry) et ÉCRASE le pas d'ouverture propre — coalescing inter-note parasite.
      const r0 = mkEntry('r0');
      history.recordTyping(mkEntry('eA'), 1000, false); // salve ouverte (run.open = true, lastEditAt = 1000)
      history.reset(r0); // réamorçage : DOIT refermer la salve (run = null)
      history.recordTyping(mkEntry('rA'), 1400, false); // Δ = 400 < 500 : NE doit PAS étendre l'ancien run
      expect(history.canUndo()).toBe(true); // un nouveau pas a bien été empilé (rA distinct de r0)
      expect(history.undo()).toBe(r0); // le seed du reset est intact, atteignable par undo
    });
  });

  // ==========================================================================
  // Groupe 2 — Empilement d'une commande & disponibilité undo/redo (US1–US4)
  // ==========================================================================
  describe('push & disponibilité undo/redo', () => {
    it('T2.1 reset(e0) puis push(e1) : canUndo = true, canRedo = false (US1/US2)', () => {
      history.reset(mkEntry('e0'));
      history.push(mkEntry('e1'));
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
    });

    it('T2.2 undo() renvoie l\'entrée précédente e0 ; ensuite canUndo = false, canRedo = true', () => {
      const e0 = mkEntry('e0');
      history.reset(e0);
      history.push(mkEntry('e1'));
      expect(history.undo()).toBe(e0);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);
    });

    it('T2.3 redo() après ce undo renvoie e1 et rebranche canUndo = true, canRedo = false (US3)', () => {
      const e1 = mkEntry('e1');
      history.reset(mkEntry('e0'));
      history.push(e1);
      history.undo();
      expect(history.redo()).toBe(e1);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
    });

    it('T2.4 trois push puis trois undo renvoient e2, e1, e0 ; un undo de plus → null (US1)', () => {
      const e0 = mkEntry('e0');
      const e1 = mkEntry('e1');
      const e2 = mkEntry('e2');
      const e3 = mkEntry('e3');
      history.reset(e0);
      history.push(e1);
      history.push(e2);
      history.push(e3);
      expect(history.undo()).toBe(e2);
      expect(history.undo()).toBe(e1);
      expect(history.undo()).toBe(e0);
      expect(history.undo()).toBeNull();
    });

    it('T2.5 symétrique : après remontée, trois redo renvoient e1, e2, e3 ; un de plus → null (US3)', () => {
      const e1 = mkEntry('e1');
      const e2 = mkEntry('e2');
      const e3 = mkEntry('e3');
      history.reset(mkEntry('e0'));
      history.push(e1);
      history.push(e2);
      history.push(e3);
      history.undo();
      history.undo();
      history.undo();
      expect(history.redo()).toBe(e1);
      expect(history.redo()).toBe(e2);
      expect(history.redo()).toBe(e3);
      expect(history.redo()).toBeNull();
    });

    it('T2.6 identité du snapshot (D7/C2) : undo/redo renvoient la référence identique, modèle non cloné', () => {
      const e0 = mkEntry('e0');
      const e1 = mkEntry('e1');
      history.reset(e0);
      history.push(e1);
      const undone = history.undo();
      expect(undone).toBe(e0);
      expect(undone?.model).toBe(e0.model); // aucun deep-copy
      const redone = history.redo();
      expect(redone).toBe(e1);
      expect(redone?.model).toBe(e1.model);
    });

    it('T2.7 sélection mémorisée (D3) : .selection restituée exactement (valeur ET null)', () => {
      const s = sel(2, 5);
      const e0 = mkEntry('e0', null);
      const e1 = mkEntry('e1', s);
      history.reset(e0);
      history.push(e1);
      expect(history.undo()?.selection).toBeNull(); // e0 sans sélection
      expect(history.redo()?.selection).toBe(s); // e1 restitue S à l'identique
    });
  });

  // ==========================================================================
  // Groupe 3 — Troncature du futur (US4)
  // ==========================================================================
  describe('troncature du futur', () => {
    it('T3.1 une nouvelle commande après un undo vide le redo (US4)', () => {
      history.reset(mkEntry('e0'));
      history.push(mkEntry('e1'));
      history.push(mkEntry('e2'));
      history.undo();
      expect(history.canRedo()).toBe(true);
      history.push(mkEntry('e3'));
      expect(history.canRedo()).toBe(false);
      expect(history.redo()).toBeNull();
    });

    it('T3.2 après T3.1, undo() renvoie e1 (et non e2) : e3 a remplacé la branche future', () => {
      const e1 = mkEntry('e1');
      history.reset(mkEntry('e0'));
      history.push(e1);
      history.push(mkEntry('e2'));
      history.undo();
      history.push(mkEntry('e3'));
      expect(history.undo()).toBe(e1);
    });

    it('T3.3 une frappe qui ouvre un pas après un undo tronque aussi le futur (US4/D8)', () => {
      history.reset(mkEntry('e0'));
      history.push(mkEntry('e1'));
      history.undo();
      expect(history.canRedo()).toBe(true);
      history.recordTyping(mkEntry('eT'), 1000, false);
      expect(history.canRedo()).toBe(false);
    });
  });

  // ==========================================================================
  // Groupe 4 — Coalescing de la saisie libre (D1, C3) — cœur du Lot A
  // ==========================================================================
  describe('coalescing de la saisie', () => {
    it('T4.1 regroupement < 500 ms, même mot → un seul pas (étendu en place vers eC, D8)', () => {
      const e0 = mkEntry('e0');
      const eC = mkEntry('eC');
      history.reset(e0);
      history.recordTyping(mkEntry('eA'), 1000, false);
      history.recordTyping(mkEntry('eB'), 1200, false);
      history.recordTyping(eC, 1400, false);
      expect(history.canUndo()).toBe(true);
      expect(history.undo()).toBe(e0); // un seul undo ramène à e0
      expect(history.canUndo()).toBe(false); // pas d'autre pas
      expect(history.redo()).toBe(eC); // le pas courant porte le dernier snapshot eC
    });

    it('T4.2 pause >= 500 ms scelle (Δ = 600) → deux pas', () => {
      const e0 = mkEntry('e0');
      const eA = mkEntry('eA');
      history.reset(e0);
      history.recordTyping(eA, 1000, false);
      history.recordTyping(mkEntry('eB'), 1600, false); // Δ = 600 >= 500
      expect(history.undo()).toBe(eA);
      expect(history.undo()).toBe(e0);
    });

    it('T4.3 seuil exact Δ = 500 ms scelle (D2) ; Δ = 499 ms regroupe', () => {
      // Δ = 500 pile → deux pas (borne inclusive `now - lastEditAt >= 500`).
      const h500 = new EditHistory();
      const e0 = mkEntry('e0');
      const eA = mkEntry('eA');
      h500.reset(e0);
      h500.recordTyping(eA, 1000, false);
      h500.recordTyping(mkEntry('eB'), 1500, false); // Δ = 500
      expect(h500.undo()).toBe(eA);
      expect(h500.undo()).toBe(e0);

      // Contrôle jumeau : Δ = 499 → un seul pas.
      const h499 = new EditHistory();
      const f0 = mkEntry('f0');
      h499.reset(f0);
      h499.recordTyping(mkEntry('fA'), 1000, false);
      h499.recordTyping(mkEntry('fB'), 1499, false); // Δ = 499
      expect(h499.undo()).toBe(f0); // un seul undo → regroupé
      expect(h499.canUndo()).toBe(false);
    });

    it('T4.4 frontière de mot scelle (D5) : « mot + espace » = 1 pas, la frappe suivante ouvre un nouveau pas', () => {
      const e0 = mkEntry('e0');
      const eEspace = mkEntry('eEspace');
      history.reset(e0);
      history.recordTyping(mkEntry('eMot'), 1000, false);
      history.recordTyping(eEspace, 1100, true); // séparateur : étend puis scelle
      history.recordTyping(mkEntry('eMot2'), 1150, false); // ouvre un nouveau pas
      expect(history.undo()).toBe(eEspace); // 1er undo : le pas « mot + espace »
      expect(history.undo()).toBe(e0); // 2ᵉ undo : état initial
    });

    it('T4.5 après un séparateur, la frappe suivante ouvre un nouveau pas même à Δ < 500 ms (C3)', () => {
      const e0 = mkEntry('e0');
      const eSep = mkEntry('eSep');
      history.reset(e0);
      history.recordTyping(mkEntry('eA'), 1000, false);
      history.recordTyping(eSep, 1050, true); // Δ = 50, mais frontière → scelle
      history.recordTyping(mkEntry('eB'), 1100, false); // Δ = 50 < 500, mais salve scellée → nouveau pas
      expect(history.undo()).toBe(eSep); // la frappe eB était bien un pas distinct
      expect(history.undo()).toBe(e0);
    });

    it('T4.6 première frappe après une commande : pas distinct de la commande', () => {
      const e0 = mkEntry('e0');
      const e1 = mkEntry('e1');
      history.reset(e0);
      history.push(e1); // commande
      history.recordTyping(mkEntry('eT'), 1000, false); // ouvre un nouveau pas
      expect(history.undo()).toBe(e1); // sépare la frappe de la commande
      expect(history.undo()).toBe(e0);
    });

    it('T4.7 seal() explicite (D4) : la frappe suivante ouvre un nouveau pas malgré Δ < 500 ms', () => {
      const e0 = mkEntry('e0');
      const eA = mkEntry('eA');
      history.reset(e0);
      history.recordTyping(eA, 1000, false);
      history.seal(); // ferme la salve
      history.recordTyping(mkEntry('eB'), 1100, false); // Δ = 100 < 500, mais scellé → nouveau pas
      expect(history.undo()).toBe(eA);
      expect(history.undo()).toBe(e0);
    });

    it('T4.8 undo scelle la salve : un undo ramène à l\'état d\'avant la salve, pas au caractère précédent', () => {
      const e0 = mkEntry('e0');
      history.reset(e0);
      history.recordTyping(mkEntry('eA'), 1000, false);
      history.recordTyping(mkEntry('eB'), 1100, false); // même salve (Δ = 100)
      expect(history.undo()).toBe(e0); // la salve entière = un pas
      expect(history.canUndo()).toBe(false);
    });
  });

  // ==========================================================================
  // Groupe 5 — Bornage ~100 pas (US6, D6/D3) — limite réduite injectable
  // ==========================================================================
  describe('bornage (limite injectable, FIFO)', () => {
    it('T5.1 éjection FIFO au-delà de la borne : le plus ancien (e0) n\'est plus jamais atteint', () => {
      const bounded = new EditHistory(3);
      const e0 = mkEntry('e0');
      const e1 = mkEntry('e1');
      const e2 = mkEntry('e2');
      const e3 = mkEntry('e3');
      bounded.reset(e0);
      bounded.push(e1);
      bounded.push(e2);
      bounded.push(e3); // total 4 entrées > 3 → e0 éjecté
      expect(bounded.undo()).toBe(e2);
      expect(bounded.undo()).toBe(e1);
      expect(bounded.undo()).toBeNull(); // e0 a bien été éjecté (jamais renvoyé)
    });

    it('T5.2 l\'index courant reste valide : canRedo = false au sommet, undo → avant-dernière poussée', () => {
      const bounded = new EditHistory(3);
      const e2 = mkEntry('e2');
      bounded.reset(mkEntry('e0'));
      bounded.push(mkEntry('e1'));
      bounded.push(e2);
      bounded.push(mkEntry('e3'));
      expect(bounded.canRedo()).toBe(false); // on est au sommet
      expect(bounded.undo()).toBe(e2); // l'éjection FIFO n'a pas décalé le « présent »
    });

    it('T5.3 bornage pendant une salve de frappe : éjecte les plus anciens sans corrompre canUndo (D8)', () => {
      const bounded = new EditHistory(2);
      const eB = mkEntry('eB');
      bounded.reset(mkEntry('e0'));
      bounded.recordTyping(mkEntry('eA'), 1000, false); // pas 1
      bounded.recordTyping(eB, 2000, false); // Δ = 1000 → pas 2 ; e0 éjecté
      bounded.recordTyping(mkEntry('eC'), 3000, false); // Δ = 1000 → pas 3 ; eA éjecté
      expect(bounded.canUndo()).toBe(true);
      expect(bounded.undo()).toBe(eB); // reste [eB, eC]
      expect(bounded.undo()).toBeNull(); // e0/eA évincés
    });
  });

  // ==========================================================================
  // Groupe 6 — Cas limites & robustesse
  // ==========================================================================
  describe('cas limites & robustesse', () => {
    it('T6.1 undo() au fond (index 0) → null, canUndo reste false, aucune exception', () => {
      history.reset(mkEntry('e0'));
      expect(() => history.undo()).not.toThrow();
      expect(history.undo()).toBeNull();
      expect(history.canUndo()).toBe(false);
    });

    it('T6.2 redo() au sommet (aucun futur) → null, canRedo reste false, aucune exception', () => {
      history.reset(mkEntry('e0'));
      expect(() => history.redo()).not.toThrow();
      expect(history.redo()).toBeNull();
      expect(history.canRedo()).toBe(false);
    });

    it('T6.3 seal() sans salve ouverte → no-op, aucune exception, canUndo/canRedo inchangés (D4)', () => {
      history.reset(mkEntry('e0'));
      history.push(mkEntry('e1'));
      expect(() => history.seal()).not.toThrow();
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
    });

    it('T6.4 état à froid (D6) : sans reset, un premier push amorce sans passé (canUndo = false, undo = null)', () => {
      const cold = new EditHistory();
      expect(cold.canUndo()).toBe(false);
      expect(cold.canRedo()).toBe(false);
      cold.push(mkEntry('e1')); // à froid, toléré : e1 devient le seul pas
      expect(cold.canUndo()).toBe(false);
      expect(cold.undo()).toBeNull();
    });

    it('T6.5 selection = null transportée intacte : undo/redo renvoient .selection === null sans lever', () => {
      const e0 = mkEntry('e0', null);
      const e1 = mkEntry('e1', null);
      history.reset(e0);
      history.push(e1);
      expect(() => history.undo()).not.toThrow();
      history.redo(); // revient au sommet
      history.undo();
      expect(history.undo()).toBeNull(); // au fond, pas d'exception
    });
  });

  // ==========================================================================
  // Constante exportée — contrat d'API §5
  // ==========================================================================
  it('expose TYPING_COALESCE_PAUSE_MS = 500 (C3, figée)', () => {
    expect(TYPING_COALESCE_PAUSE_MS).toBe(500);
  });
});
