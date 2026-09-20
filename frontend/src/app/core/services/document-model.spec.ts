import { DocumentModelService } from './document-model';
import { DocModel, ImageBlock, Mark, MarkType, TextBlock, TextBlockKind } from '../models/document.model';

/**
 * Tests du `DocumentModelService` — cœur PUR du modèle de document (normalize + algèbre
 * d'intervalles + commandes) — TDD / boîte noire.
 * Voir .agent/PLAN_TESTS_DOCUMENT_MODEL.md et .agent/PLAN_MODELE_DOCUMENT_JSON.md (§4.4/§4.5).
 *
 * Doublures : AUCUNE, aucun DOM. Le service est 100 % pur ; on l'instancie directement
 * (`new DocumentModelService()`), comme `FormattingService` dans `formatting-service.spec.ts`.
 *
 * Décisions figées (cf. plan §4 + tranchées avec le porteur, §7) :
 *   DA — Immutabilité : toute méthode renvoie de nouveaux objets ; l'entrée n'est jamais mutée.
 *   DB — Tri canonique par (type, value, start). Ordre de `type` = ordre de nesting D7 :
 *        bold ▸ italic ▸ underline ▸ color ▸ size. `value` : undefined avant défini, puis
 *        lexicographique (localeCompare).
 *   DC — Fusion des marques même type+value qui se touchent/chevauchent (m1.end >= m2.start) ;
 *        jamais par-dessus un trou.
 *   DD — color/size = remplacement (pas d'empilement) sur l'intersection.
 *   DE — Bornage à [0, text.length] ; marque jetée si start >= end.
 *   DF — Retrait partiel : toggleMark off coupe les runs qui débordent (soustraction).
 *   DG — Gardes : id inexistant ou bloc void → modèle inchangé.
 *   §7.1 — setColor/setSize sont de VRAIS toggles : re-poser la même valeur sur une zone
 *        entièrement couverte la retire.
 *   §7.2 — splitBlock : le bloc droit HÉRITE du `kind`.
 *   §7.4 — Les commandes inline sont typées `TextBlock` strict ; le garde void ne concerne que les
 *        commandes de niveau DocModel (setBlockKind / splitBlock / mergeBlocks).
 *   §7.5 — isMarkActive sur une sélection repliée (from === to) → false.
 */

// --- Helpers de construction (aucun montage DOM) ------------------------------

/** Construit une `Mark` ; omet `value` quand absent (aligné sur ce que renvoie le service). */
function mark(type: MarkType, start: number, end: number, value?: string): Mark {
  return value === undefined ? { type, start, end } : { type, start, end, value };
}

/** Construit un `TextBlock` (id `'b1'` par défaut, surchargeable pour les commandes de bloc). */
function mkText(kind: TextBlockKind, text: string, marks: Mark[] = [], id = 'b1'): TextBlock {
  return { id, kind, text, marks };
}

/** Construit un `ImageBlock` (bloc void, pour tester les gardes). */
function mkImage(id: string, src = 'file://x.png'): ImageBlock {
  return { id, kind: 'image', src };
}

describe('DocumentModelService (modèle de document, pur)', () => {
  let service: DocumentModelService;

  beforeEach(() => {
    service = new DocumentModelService();
  });

  // ==========================================================================
  // Groupe 1 — normalize (le plus testé)
  // ==========================================================================
  describe('normalize', () => {
    it('T1.1 borne les marques à [0, text.length]', () => {
      const block = mkText('text', 'abcde', [mark('bold', -2, 100)]);
      expect(service.normalize(block).marks).toEqual([mark('bold', 0, 5)]);
    });

    it('T1.2 jette les marques nulles (start >= end)', () => {
      const block = mkText('text', 'abcde', [mark('bold', 3, 3), mark('italic', 5, 2)]);
      expect(service.normalize(block).marks).toEqual([]);
    });

    it('T1.3 fusionne deux runs contigus de même type', () => {
      const block = mkText('text', 'abcdef', [mark('bold', 0, 3), mark('bold', 3, 5)]);
      expect(service.normalize(block).marks).toEqual([mark('bold', 0, 5)]);
    });

    it('T1.4 fusionne deux runs qui se chevauchent', () => {
      const block = mkText('text', 'abcdefg', [mark('bold', 0, 4), mark('bold', 2, 6)]);
      expect(service.normalize(block).marks).toEqual([mark('bold', 0, 6)]);
    });

    it('T1.5 ne fusionne JAMAIS par-dessus un trou', () => {
      const block = mkText('text', 'abcdefgh', [mark('bold', 0, 3), mark('bold', 5, 8)]);
      expect(service.normalize(block).marks).toEqual([mark('bold', 0, 3), mark('bold', 5, 8)]);
    });

    it('T1.6 trie par (type, value, start)', () => {
      const block = mkText('text', 'abcdefghij', [
        mark('italic', 2, 4),
        mark('bold', 5, 7),
        mark('bold', 0, 3),
        mark('color', 1, 2, '#000000'),
      ]);
      expect(service.normalize(block).marks).toEqual([
        mark('bold', 0, 3),
        mark('bold', 5, 7),
        mark('italic', 2, 4),
        mark('color', 1, 2, '#000000'),
      ]);
    });

    it('T1.7 ne fusionne pas des types différents', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 5), mark('italic', 0, 5)]);
      expect(service.normalize(block).marks).toEqual([mark('bold', 0, 5), mark('italic', 0, 5)]);
    });

    it('T1.8 ne fusionne pas des `value` différentes, même contiguës', () => {
      const block = mkText('text', 'abcdefgh', [
        mark('color', 0, 5, '#ffffff'),
        mark('color', 5, 8, '#000000'),
      ]);
      // Tri (type, value, start) : '#000000' < '#ffffff'.
      expect(service.normalize(block).marks).toEqual([
        mark('color', 5, 8, '#000000'),
        mark('color', 0, 5, '#ffffff'),
      ]);
    });

    it('T1.9 est idempotent', () => {
      const block = mkText('text', 'abcdefghij', [
        mark('italic', 2, 4),
        mark('bold', 5, 7),
        mark('bold', 0, 3),
        mark('color', 1, 2, '#000000'),
      ]);
      const once = service.normalize(block);
      expect(service.normalize(once)).toEqual(once);
    });

    it('T1.10 laisse inchangé un bloc déjà canonique (exemple « Le petit chat noir »)', () => {
      const marks = [mark('bold', 3, 8), mark('bold', 9, 13), mark('italic', 9, 13)];
      const block = mkText('text', 'Le petit chat noir', marks);
      expect(service.normalize(block).marks).toEqual(marks);
    });
  });

  // ==========================================================================
  // Groupe 2 — isMarkActive (estCouvert)
  // ==========================================================================
  describe('isMarkActive', () => {
    it('T2.1 vrai quand la sélection est totalement couverte', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 5)]);
      expect(service.isMarkActive(block, 1, 4, 'bold')).toBe(true);
    });

    it('T2.2 faux quand la couverture est partielle', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 3)]);
      expect(service.isMarkActive(block, 1, 5, 'bold')).toBe(false);
    });

    it('T2.3 faux en présence d\'un trou interne', () => {
      const block = mkText('text', 'abcdef', [mark('bold', 0, 2), mark('bold', 4, 6)]);
      expect(service.isMarkActive(block, 0, 6, 'bold')).toBe(false);
    });

    it('T2.4 faux si le type correspond mais pas la value', () => {
      const block = mkText('text', 'abcde', [mark('color', 0, 5, '#ffffff')]);
      expect(service.isMarkActive(block, 0, 5, 'color', '#000000')).toBe(false);
    });

    it('T2.5 faux sur une sélection repliée (from === to)', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 5)]);
      expect(service.isMarkActive(block, 2, 2, 'bold')).toBe(false);
    });

    it('T2.6 vrai quand deux runs jointifs couvrent la sélection (normalisation interne)', () => {
      const block = mkText('text', 'abcdef', [mark('bold', 0, 3), mark('bold', 3, 6)]);
      expect(service.isMarkActive(block, 0, 6, 'bold')).toBe(true);
    });
  });

  // ==========================================================================
  // Groupe 3 — toggleMark : ajout (union)
  // ==========================================================================
  describe('toggleMark (ajout)', () => {
    it('T3.1 ajoute une marque sur du texte nu', () => {
      const block = mkText('text', 'Le petit chat noir');
      expect(service.toggleMark(block, 3, 8, 'bold').marks).toEqual([mark('bold', 3, 8)]);
    });

    it('T3.2 fusionne avec une marque adjacente existante', () => {
      const block = mkText('text', 'abcdefgh', [mark('bold', 0, 3)]);
      expect(service.toggleMark(block, 3, 8, 'bold').marks).toEqual([mark('bold', 0, 8)]);
    });

    it('T3.3 ajoute un type indépendant qui en chevauche un autre', () => {
      const block = mkText('text', 'Le petit chat noir', [mark('bold', 9, 13)]);
      expect(service.toggleMark(block, 9, 13, 'italic').marks).toEqual([
        mark('bold', 9, 13),
        mark('italic', 9, 13),
      ]);
    });

    it('T3.4 complète la couverture (ajout) quand la zone n\'est que partiellement couverte', () => {
      const block = mkText('text', 'abcdefghij', [mark('bold', 0, 3)]);
      expect(service.toggleMark(block, 0, 6, 'bold').marks).toEqual([mark('bold', 0, 6)]);
    });
  });

  // ==========================================================================
  // Groupe 4 — toggleMark : retrait (soustraction) — cœur du gain
  // ==========================================================================
  describe('toggleMark (retrait)', () => {
    it('T4.1 retire totalement une marque couvrante', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 5)]);
      expect(service.toggleMark(block, 0, 5, 'bold').marks).toEqual([]);
    });

    it('T4.2 coupe un run en deux (retrait au milieu)', () => {
      const block = mkText('text', 'abcdefghij', [mark('bold', 0, 10)]);
      expect(service.toggleMark(block, 3, 6, 'bold').marks).toEqual([
        mark('bold', 0, 3),
        mark('bold', 6, 10),
      ]);
    });

    it('T4.3 retire sur un run débordant', () => {
      const block = mkText('text', 'abcdefghijkl', [mark('bold', 2, 12)]);
      expect(service.toggleMark(block, 5, 8, 'bold').marks).toEqual([
        mark('bold', 2, 5),
        mark('bold', 8, 12),
      ]);
    });

    it('T4.4 retire le bord gauche', () => {
      const block = mkText('text', 'abcdefghij', [mark('bold', 0, 10)]);
      expect(service.toggleMark(block, 0, 4, 'bold').marks).toEqual([mark('bold', 4, 10)]);
    });

    it('T4.5 retire le bord droit', () => {
      const block = mkText('text', 'abcdefghij', [mark('bold', 0, 10)]);
      expect(service.toggleMark(block, 6, 10, 'bold').marks).toEqual([mark('bold', 0, 6)]);
    });

    it('T4.6 ne retire que le type ciblé', () => {
      const block = mkText('text', 'abcdefghij', [mark('bold', 0, 10), mark('italic', 0, 10)]);
      expect(service.toggleMark(block, 0, 10, 'bold').marks).toEqual([mark('italic', 0, 10)]);
    });
  });

  // ==========================================================================
  // Groupe 5 — couleur / taille (setColor, setSize, clearSize)
  // ==========================================================================
  describe('setColor / setSize / clearSize', () => {
    it('T5.1 pose une couleur sur du texte nu', () => {
      const block = mkText('text', 'abcde');
      expect(service.setColor(block, 0, 5, '#FF0000').marks).toEqual([mark('color', 0, 5, '#FF0000')]);
    });

    it('T5.2 remplace la couleur sur l\'intersection (pas d\'empilement)', () => {
      const block = mkText('text', 'abcdefgh', [mark('color', 0, 5, '#000000')]);
      // Tri (type, value, start) : '#000000' < '#FFFFFF'.
      expect(service.setColor(block, 2, 5, '#FFFFFF').marks).toEqual([
        mark('color', 0, 2, '#000000'),
        mark('color', 2, 5, '#FFFFFF'),
      ]);
    });

    it('T5.3 pose puis remplace une taille par une autre valeur', () => {
      const large = service.setSize(mkText('text', 'abcd'), 0, 4, 'large');
      expect(large.marks).toEqual([mark('size', 0, 4, 'large')]);
      expect(service.setSize(large, 0, 4, 'small').marks).toEqual([mark('size', 0, 4, 'small')]);
    });

    it('T5.4 clearSize retire toute marque size sur la zone (toutes valeurs)', () => {
      const block = mkText('text', 'abcdefgh', [mark('size', 0, 8, 'large')]);
      expect(service.clearSize(block, 2, 5).marks).toEqual([
        mark('size', 0, 2, 'large'),
        mark('size', 5, 8, 'large'),
      ]);
    });

    it('T5.5 setColor est un toggle : re-poser la même couleur couvrante la retire', () => {
      const block = mkText('text', 'abcde', [mark('color', 0, 5, '#FF0000')]);
      expect(service.setColor(block, 0, 5, '#FF0000').marks).toEqual([]);
    });
  });

  // ==========================================================================
  // Groupe 6 — commandes de bloc (setBlockKind)
  // ==========================================================================
  describe('setBlockKind', () => {
    it('T6.1 bascule text → h1 sans toucher text/marks ni les autres blocs', () => {
      const model: DocModel = [mkText('text', 'Titre', [], 'b1'), mkText('text', 'para', [], 'b2')];
      const out = service.setBlockKind(model, 'b1', 'h1');
      expect(out[0]).toEqual(mkText('h1', 'Titre', [], 'b1'));
      expect(out[1]).toEqual(mkText('text', 'para', [], 'b2'));
    });

    it('T6.2 rebascule h1 → text et text → bullet', () => {
      const model: DocModel = [mkText('h1', 'Titre', [], 'b1')];
      expect(service.setBlockKind(model, 'b1', 'text')[0]).toEqual(mkText('text', 'Titre', [], 'b1'));
      expect(service.setBlockKind(model, 'b1', 'bullet')[0]).toEqual(mkText('bullet', 'Titre', [], 'b1'));
    });

    it('T6.3 laisse le modèle inchangé si l\'id est inconnu', () => {
      const model: DocModel = [mkText('text', 'Titre', [], 'b1')];
      expect(service.setBlockKind(model, 'zzz', 'h1')).toEqual(model);
    });

    it('T6.4 laisse un bloc void (image) inchangé', () => {
      const model: DocModel = [mkImage('img1')];
      expect(service.setBlockKind(model, 'img1', 'h1')).toEqual(model);
    });
  });

  // ==========================================================================
  // Groupe 7 — splitBlock (Entrée)
  // ==========================================================================
  describe('splitBlock', () => {
    /** Fabrique d'id déterministe pour les assertions. */
    function counter(): () => string {
      let n = 0;
      return () => 'id-' + ++n;
    }

    it('T7.1 coupe le texte, conserve l\'id source, attribue un id neuf au bloc droit', () => {
      const model: DocModel = [mkText('text', 'Bonjour', [], 'b1')];
      const out = service.splitBlock(model, 'b1', 3, counter());
      expect(out).toEqual([
        mkText('text', 'Bon', [], 'b1'),
        mkText('text', 'jour', [], 'id-1'),
      ]);
    });

    it('T7.2 répartit une marque couvrante (droite rebasée)', () => {
      const model: DocModel = [mkText('text', 'Bonjour', [mark('bold', 0, 7)], 'b1')];
      const out = service.splitBlock(model, 'b1', 3, counter());
      expect((out[0] as TextBlock).marks).toEqual([mark('bold', 0, 3)]);
      expect((out[1] as TextBlock).marks).toEqual([mark('bold', 0, 4)]);
    });

    it('T7.3 répartit une marque à cheval sur la coupe', () => {
      const model: DocModel = [mkText('text', 'Bonjour', [mark('bold', 1, 5)], 'b1')];
      const out = service.splitBlock(model, 'b1', 3, counter());
      expect((out[0] as TextBlock).marks).toEqual([mark('bold', 1, 3)]);
      expect((out[1] as TextBlock).marks).toEqual([mark('bold', 0, 2)]);
    });

    it('T7.4 gère les bornes offset=0 et offset=len', () => {
      const model: DocModel = [mkText('text', 'Bonjour', [], 'b1')];

      const atStart = service.splitBlock(model, 'b1', 0, counter());
      expect(atStart.map((b) => (b as TextBlock).text)).toEqual(['', 'Bonjour']);

      const atEnd = service.splitBlock(model, 'b1', 7, counter());
      expect(atEnd.map((b) => (b as TextBlock).text)).toEqual(['Bonjour', '']);
    });

    it('T7.5 le bloc droit hérite du kind (§7.2)', () => {
      const model: DocModel = [mkText('h1', 'Titre', [], 'b1')];
      const out = service.splitBlock(model, 'b1', 2, counter());
      expect(out.map((b) => (b as TextBlock).kind)).toEqual(['h1', 'h1']);
    });

    it('T7.6 laisse le modèle inchangé si l\'id est inconnu', () => {
      const model: DocModel = [mkText('text', 'Bonjour', [], 'b1')];
      expect(service.splitBlock(model, 'zzz', 3, counter())).toEqual(model);
    });
  });

  // ==========================================================================
  // Groupe 8 — mergeBlocks (Retour arrière)
  // ==========================================================================
  describe('mergeBlocks', () => {
    it('T8.1 concatène le texte en un seul bloc (id du 1er conservé)', () => {
      const model: DocModel = [mkText('text', 'Bon', [], 'b1'), mkText('text', 'jour', [], 'b2')];
      expect(service.mergeBlocks(model, 'b1', 'b2')).toEqual([mkText('text', 'Bonjour', [], 'b1')]);
    });

    it('T8.2 rebase les marques du 2e bloc (+= len du 1er)', () => {
      const model: DocModel = [
        mkText('text', 'Bon', [mark('bold', 0, 3)], 'b1'),
        mkText('text', 'jour', [mark('italic', 0, 4)], 'b2'),
      ];
      expect((service.mergeBlocks(model, 'b1', 'b2')[0] as TextBlock).marks).toEqual([
        mark('bold', 0, 3),
        mark('italic', 3, 7),
      ]);
    });

    it('T8.3 fusionne à la jointure deux runs de même type', () => {
      const model: DocModel = [
        mkText('text', 'Bon', [mark('bold', 0, 3)], 'b1'),
        mkText('text', 'jour', [mark('bold', 0, 4)], 'b2'),
      ];
      expect((service.mergeBlocks(model, 'b1', 'b2')[0] as TextBlock).marks).toEqual([
        mark('bold', 0, 7),
      ]);
    });

    it('T8.4 laisse le modèle inchangé si un id est inconnu', () => {
      const model: DocModel = [mkText('text', 'Bon', [], 'b1'), mkText('text', 'jour', [], 'b2')];
      expect(service.mergeBlocks(model, 'b1', 'zzz')).toEqual(model);
      expect(service.mergeBlocks(model, 'zzz', 'b2')).toEqual(model);
    });
  });

  // ==========================================================================
  // Groupe 9 — insertText / deleteRange (décalage des marques, Phase 4)
  // ==========================================================================
  describe('insertText / deleteRange', () => {
    it('T9.1 insertText au milieu d\'une marque l\'étend', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 5)]);
      const out = service.insertText(block, 2, 'XY');
      expect(out.text).toBe('abXYcde');
      expect(out.marks).toEqual([mark('bold', 0, 7)]);
    });

    it('T9.2 insertText avant une marque la décale', () => {
      const block = mkText('text', 'abcdef', [mark('bold', 3, 6)]);
      const out = service.insertText(block, 0, 'AB');
      expect(out.text).toBe('ABabcdef');
      expect(out.marks).toEqual([mark('bold', 5, 8)]);
    });

    it('T9.3 deleteRange à l\'intérieur d\'une marque la raccourcit', () => {
      const block = mkText('text', 'abcdefgh', [mark('bold', 0, 8)]);
      const out = service.deleteRange(block, 2, 4);
      expect(out.text).toBe('abefgh');
      expect(out.marks).toEqual([mark('bold', 0, 6)]);
    });

    it('T9.4 deleteRange couvrant une marque entière la supprime', () => {
      const block = mkText('text', 'abcdefgh', [mark('bold', 2, 5)]);
      const out = service.deleteRange(block, 1, 7);
      expect(out.text).toBe('ah');
      expect(out.marks).toEqual([]);
    });

    it('T9.5 deleteRange à cheval tronque la marque', () => {
      const block = mkText('text', 'abcdefgh', [mark('bold', 0, 8)]);
      const out = service.deleteRange(block, 6, 10);
      expect(out.text).toBe('abcdef');
      expect(out.marks).toEqual([mark('bold', 0, 6)]);
    });
  });

  // ==========================================================================
  // Groupe 10 — Pureté & gardes (transverse)
  // ==========================================================================
  describe('pureté & gardes', () => {
    it('T10.1 ne mute jamais l\'entrée (normalize, toggleMark, splitBlock, mergeBlocks)', () => {
      const block = mkText('text', 'abcdefghij', [mark('bold', 0, 5), mark('bold', 5, 8)]);
      const snapshot = structuredClone(block);
      service.normalize(block);
      service.toggleMark(block, 2, 4, 'bold');
      expect(block).toEqual(snapshot);

      const model: DocModel = [mkText('text', 'Bonjour', [mark('bold', 0, 7)], 'b1'), mkText('text', 'suite', [], 'b2')];
      const modelSnapshot = structuredClone(model);
      service.splitBlock(model, 'b1', 3, () => 'id-1');
      service.mergeBlocks(model, 'b1', 'b2');
      expect(model).toEqual(modelSnapshot);
    });

    it('T10.2 renvoie de nouvelles références (objet et tableau de marques)', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 5)]);
      const out = service.normalize(block);
      expect(out).not.toBe(block);
      expect(out.marks).not.toBe(block.marks);
    });

    it('T10.3 tolère des offsets hors bornes (bornage, pas d\'exception)', () => {
      const block = mkText('text', 'abcde', [mark('bold', 0, 3)]);
      expect(() => service.toggleMark(block, -5, 100, 'bold')).not.toThrow();
      expect(service.toggleMark(block, -5, 100, 'bold').marks).toEqual([mark('bold', 0, 5)]);
    });

    it('T10.4 laisse un bloc void inchangé pour les commandes de bloc (split)', () => {
      const model: DocModel = [mkImage('img1')];
      expect(service.splitBlock(model, 'img1', 0, () => 'id-1')).toEqual(model);
    });
  });

  // ==========================================================================
  // Groupe 11 — lien (marque valuée `link`) — §A du PLAN_TESTS_INSERTION_LIEN.md
  // ==========================================================================
  // DL1 — `link` est une marque valuée (URL portée par `Mark.value`), jumelle de color/size.
  // DL2 — `link` est la marque la plus EXTERNE de TYPE_ORDER (rang le plus bas) → triée en 1er.
  // DL3 — `setLink` miroir de `setColor` (setValueMark) : remplace tout `link` sur la plage puis
  //       pose le nouveau ; ré-appliquer la MÊME URL sur une plage couverte la retire (toggle).
  describe('setLink (marque lien valuée)', () => {
    // --- Groupe A1 — pose d'un lien ------------------------------------------
    it('TA1.1 pose une marque link de valeur url sur exactement [from, to) (US3)', () => {
      const block = mkText('text', 'Voir le site');
      expect(service.setLink(block, 0, 4, 'https://ex.com').marks).toEqual([
        mark('link', 0, 4, 'https://ex.com'),
      ]);
    });

    it('TA1.2 le lien cohabite avec une marque existante (bold) sans l\'écraser (US4 cumul)', () => {
      const block = mkText('text', 'abcd', [mark('bold', 0, 4)]);
      // Tri canonique (type, value, start) : `link` externe (rang le plus bas) → triée avant bold.
      expect(service.setLink(block, 0, 4, 'https://ex.com').marks).toEqual([
        mark('link', 0, 4, 'https://ex.com'),
        mark('bold', 0, 4),
      ]);
    });

    it('TA1.3 setLink est pur : ne mute pas l\'entrée (offsets UTF-16)', () => {
      const block = mkText('text', 'abcd', [mark('bold', 0, 4)]);
      const snapshot = structuredClone(block);
      service.setLink(block, 0, 4, 'https://ex.com');
      expect(block).toEqual(snapshot);
    });

    // --- Groupe A2 — remplacement & toggle (DL3) -----------------------------
    it('TA2.1 re-setLink avec une URL différente REMPLACE l\'URL (une seule marque link)', () => {
      const block = mkText('text', 'abcd', [mark('link', 0, 4, 'https://a.com')]);
      expect(service.setLink(block, 0, 4, 'https://b.com').marks).toEqual([
        mark('link', 0, 4, 'https://b.com'),
      ]);
    });

    it('TA2.2 re-setLink avec la MÊME URL sur une plage couverte RETIRE le lien (toggle off)', () => {
      const block = mkText('text', 'abcd', [mark('link', 0, 4, 'https://a.com')]);
      expect(service.setLink(block, 0, 4, 'https://a.com').marks).toEqual([]);
    });

    it('TA2.3 deux liens d\'URL différentes ne fusionnent pas ; deux de même URL qui se touchent oui', () => {
      const differentes = mkText('text', 'abcdefgh', [
        mark('link', 0, 4, 'https://a.com'),
        mark('link', 4, 8, 'https://b.com'),
      ]);
      // clé `type:value` distincte → aucune fusion ; tri par value : 'https://a.com' < 'https://b.com'.
      expect(service.normalize(differentes).marks).toEqual([
        mark('link', 0, 4, 'https://a.com'),
        mark('link', 4, 8, 'https://b.com'),
      ]);

      const memeUrl = mkText('text', 'abcdefgh', [
        mark('link', 0, 4, 'https://a.com'),
        mark('link', 4, 8, 'https://a.com'),
      ]);
      expect(service.normalize(memeUrl).marks).toEqual([mark('link', 0, 8, 'https://a.com')]);
    });

    // --- Groupe A3 — plage limite -------------------------------------------
    it('TA3.1 plage collapsée (from === to) → bloc normalisé inchangé (aucune marque link)', () => {
      const block = mkText('text', 'abcd');
      expect(service.setLink(block, 2, 2, 'https://a.com').marks).toEqual([]);
    });

    // --- Groupe A4 — retrait par effacement (US6, delta link) ----------------
    it('TA4.1 deleteRange sur tout le texte d\'un lien supprime la marque link (US6)', () => {
      const block = mkText('text', 'abcd', [mark('link', 0, 4, 'https://a.com')]);
      const out = service.deleteRange(block, 0, 4);
      expect(out.text).toBe('');
      expect(out.marks).toEqual([]);
    });

    it('TA4.2 deleteRange sur une partie du lien conserve la marque sur le reste (offsets rebasés) (US6)', () => {
      const block = mkText('text', 'abcdef', [mark('link', 0, 6, 'https://a.com')]);
      const out = service.deleteRange(block, 4, 6); // efface 'ef'
      expect(out.text).toBe('abcd');
      expect(out.marks).toEqual([mark('link', 0, 4, 'https://a.com')]);
    });
  });
});
