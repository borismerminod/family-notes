import { DocumentParseService } from './document-parse';
import { DocumentModelService } from './document-model';
import { DocumentRenderService } from './document-render';
import { DocModel, ImageBlock, Mark, MarkType, NoteBlock, TextBlock, TextBlockKind, VideoBlock } from '../models/document.model';

/**
 * Tests du `DocumentParseService` — parsing PUR HTML → modèle — TDD / boîte noire.
 * Voir .agent/PLAN_TESTS_DOCUMENT_PARSE.md et .agent/PLAN_MODELE_DOCUMENT_JSON.md (§4.6).
 *
 * Doublures : AUCUNE. On instancie réellement `new DocumentParseService(new DocumentModelService())`
 * et, pour le round-trip, `new DocumentRenderService(new DocumentModelService())`. `DOMParser` est
 * fourni par jsdom.
 *
 * Décisions figées (cf. plan §4 + §7) :
 *   DP-BLOCKS — p/div→text, h1/h2, ul>li→bullet, ol>li→numbered, img→image, iframe→video{url},
 *     video→video{src}. Un élément de bloc émet toujours un bloc (même vide).
 *   DP-MARKS — strong/b→bold, em/i→italic, u→underline, span[color]→color (hex minuscule),
 *     span[font-size]→size (small/large). Un span peut porter couleur ET taille.
 *   DP-NORMALIZE — chaque bloc texte est normalisé (marques triées/fusionnées).
 *   DP-SANITIZE — inline inconnu déballé ; script/style supprimés ; attributs inconnus ignorés ;
 *     entités déséchappées.
 *   DP-LOOSE — inline racine agrégé en un bloc text ; tampon uniquement blanc ignoré.
 *   DP-IDS — id re-généré par bloc via makeId ; jamais lu du HTML → round-trip comparé ids exclus.
 */

// --- Helpers de construction & comparaison ------------------------------------

function mark(type: MarkType, start: number, end: number, value?: string): Mark {
  return value === undefined ? { type, start, end } : { type, start, end, value };
}

function mkText(kind: TextBlockKind, text: string, marks: Mark[] = [], id = 'b1'): TextBlock {
  return { id, kind, text, marks };
}

function mkImage(src: string, id = 'img1'): ImageBlock {
  return { id, kind: 'image', src };
}

function mkVideo(v: { url?: string; src?: string }, id = 'vid1'): VideoBlock {
  return { id, kind: 'video', ...v };
}

/** Fabrique d'id déterministe pour les assertions. */
function counter(): () => string {
  let n = 0;
  return () => 'id-' + ++n;
}

/** Retire les `id` pour comparer le round-trip (render n'émet pas d'id). */
function stripIds(model: DocModel): Omit<NoteBlock, 'id'>[] {
  return model.map(({ id, ...rest }) => rest);
}

describe('DocumentParseService (parsing HTML → modèle, pur)', () => {
  let service: DocumentParseService;

  beforeEach(() => {
    service = new DocumentParseService(new DocumentModelService());
  });

  // ==========================================================================
  // Groupe 1 — marques inline
  // ==========================================================================
  describe('marques inline', () => {
    it('T1.1 parse du texte nu', () => {
      expect(service.parse('<p>abc</p>', counter())).toEqual([mkText('text', 'abc', [], 'id-1')]);
    });

    it('T1.2 parse un run gras', () => {
      const [block] = service.parse('<p>Le <strong>petit</strong> chat</p>', counter());
      expect(block).toEqual(mkText('text', 'Le petit chat', [mark('bold', 3, 8)], 'id-1'));
    });

    it('T1.3a parse l\'italique', () => {
      const [block] = service.parse('<p><em>abc</em></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('italic', 0, 3)]);
    });

    it('T1.3b parse le souligné', () => {
      const [block] = service.parse('<p><u>abc</u></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('underline', 0, 3)]);
    });

    it('T1.4 reconnaît les synonymes b / i', () => {
      const [block] = service.parse('<p><b>ab</b><i>cd</i></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('bold', 0, 2), mark('italic', 2, 4)]);
    });

    it('T1.5 parse des marques imbriquées', () => {
      const [block] = service.parse('<p><strong><em>abc</em></strong></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('bold', 0, 3), mark('italic', 0, 3)]);
    });

    it('T1.6 parse la couleur en hex minuscule', () => {
      const [block] = service.parse('<p><span style="color:#FF0000">abc</span></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('color', 0, 3, '#ff0000')]);
    });

    it('T1.7a parse la taille small', () => {
      const [block] = service.parse('<p><span style="font-size:small">abc</span></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('size', 0, 3, 'small')]);
    });

    it('T1.7b parse la taille large', () => {
      const [block] = service.parse('<p><span style="font-size:large">abc</span></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('size', 0, 3, 'large')]);
    });

    it('T1.8 parse un span portant couleur ET taille', () => {
      const [block] = service.parse('<p><span style="color:#00ff00;font-size:large">abc</span></p>', counter());
      expect((block as TextBlock).marks).toEqual([mark('color', 0, 3, '#00ff00'), mark('size', 0, 3, 'large')]);
    });
  });

  // ==========================================================================
  // Groupe 2 — kinds de bloc & ids
  // ==========================================================================
  describe('kinds de bloc', () => {
    it('T2.1 parse un h1', () => {
      expect(service.parse('<h1>Titre</h1>', counter())).toEqual([mkText('h1', 'Titre', [], 'id-1')]);
    });

    it('T2.2 parse un h2', () => {
      expect(service.parse('<h2>Sous-titre</h2>', counter())).toEqual([mkText('h2', 'Sous-titre', [], 'id-1')]);
    });

    it('T2.3 parse plusieurs blocs dans l\'ordre', () => {
      expect(service.parse('<h1>T</h1><p>p</p>', counter())).toEqual([
        mkText('h1', 'T', [], 'id-1'),
        mkText('text', 'p', [], 'id-2'),
      ]);
    });

    it('T2.4 attribue les ids dans l\'ordre du document via makeId', () => {
      const model = service.parse('<p>a</p><p>b</p><p>c</p>', counter());
      expect(model.map((b) => b.id)).toEqual(['id-1', 'id-2', 'id-3']);
    });

    it('T2.5 préserve data-block-id quand présent (round-trip éditeur)', () => {
      const model = service.parse('<p data-block-id="keep">a</p><h1 data-block-id="k2">b</h1>', counter());
      expect(model.map((b) => b.id)).toEqual(['keep', 'k2']); // makeId non consommé
    });
  });

  // ==========================================================================
  // Groupe 3 — listes
  // ==========================================================================
  describe('listes', () => {
    it('T3.1 parse une <ul> en blocs bullet', () => {
      expect(service.parse('<ul><li>a</li><li>b</li></ul>', counter())).toEqual([
        mkText('bullet', 'a', [], 'id-1'),
        mkText('bullet', 'b', [], 'id-2'),
      ]);
    });

    it('T3.2 parse une <ol> en blocs numbered', () => {
      expect(service.parse('<ol><li>a</li></ol>', counter())).toEqual([mkText('numbered', 'a', [], 'id-1')]);
    });

    it('T3.3 parse le formatage inline d\'un <li>', () => {
      const [block] = service.parse('<ul><li><strong>ab</strong></li></ul>', counter());
      expect(block).toEqual(mkText('bullet', 'ab', [mark('bold', 0, 2)], 'id-1'));
    });

    it('T3.4 parse deux listes de types différents', () => {
      expect(service.parse('<ul><li>a</li></ul><ol><li>b</li></ol>', counter())).toEqual([
        mkText('bullet', 'a', [], 'id-1'),
        mkText('numbered', 'b', [], 'id-2'),
      ]);
    });
  });

  // ==========================================================================
  // Groupe 4 — média
  // ==========================================================================
  describe('média', () => {
    it('T4.1 parse une image', () => {
      expect(service.parse('<img src="x.jpg">', counter())).toEqual([mkImage('x.jpg', 'id-1')]);
    });

    it('T4.2 parse un iframe en vidéo url', () => {
      expect(service.parse('<iframe src="https://v/y"></iframe>', counter())).toEqual([
        mkVideo({ url: 'https://v/y' }, 'id-1'),
      ]);
    });

    it('T4.3 parse un <video> en vidéo src', () => {
      expect(service.parse('<video src="file://x.mp4"></video>', counter())).toEqual([
        mkVideo({ src: 'file://x.mp4' }, 'id-1'),
      ]);
    });

    it('T4.4 préserve l\'ordre d\'un média intercalé', () => {
      const model = service.parse('<p>a</p><img src="x.jpg"><p>b</p>', counter());
      expect(model.map((b) => b.kind)).toEqual(['text', 'image', 'text']);
    });
  });

  // ==========================================================================
  // Groupe 5 — assainissement / sécurité
  // ==========================================================================
  describe('assainissement', () => {
    it('T5.1 déballe une balise inline inconnue', () => {
      expect(service.parse('<p>a<font color="red">b</font>c</p>', counter())).toEqual([
        mkText('text', 'abc', [], 'id-1'),
      ]);
    });

    it('T5.2 supprime le contenu des balises script', () => {
      const [block] = service.parse('<p>a<script>alert(1)</script>b</p>', counter());
      expect(block).toEqual(mkText('text', 'ab', [], 'id-1'));
    });

    it('T5.3 déséchappe les entités', () => {
      const [block] = service.parse('<p>a&lt;b&amp;c</p>', counter());
      expect((block as TextBlock).text).toBe('a<b&c');
    });

    it('T5.4 ignore le blanc inter-blocs', () => {
      expect(service.parse('<h1>T</h1>\n  <p>p</p>', counter())).toEqual([
        mkText('h1', 'T', [], 'id-1'),
        mkText('text', 'p', [], 'id-2'),
      ]);
    });

    it('T5.5 ignore un attribut inconnu', () => {
      expect(service.parse('<p onclick="x()">a</p>', counter())).toEqual([mkText('text', 'a', [], 'id-1')]);
    });

    it('T5.6 traite div comme un paragraphe', () => {
      expect(service.parse('<div>a</div><div>b</div>', counter())).toEqual([
        mkText('text', 'a', [], 'id-1'),
        mkText('text', 'b', [], 'id-2'),
      ]);
    });
  });

  // ==========================================================================
  // Groupe 6 — contenu racine libre & cas limites
  // ==========================================================================
  describe('contenu racine & cas limites', () => {
    it('T6.1 agrège l\'inline racine en un bloc text', () => {
      const [block] = service.parse('Bonjour <strong>x</strong>', counter());
      expect(block).toEqual(mkText('text', 'Bonjour x', [mark('bold', 8, 9)], 'id-1'));
    });

    it('T6.2 renvoie [] pour une chaîne vide', () => {
      expect(service.parse('', counter())).toEqual([]);
    });

    it('T6.3 renvoie [] pour une chaîne uniquement blanche', () => {
      expect(service.parse('   ', counter())).toEqual([]);
    });

    it('T6.4 normalise les marques (runs contigus fusionnés)', () => {
      const [block] = service.parse('<p><strong>a</strong><strong>b</strong></p>', counter());
      expect(block).toEqual(mkText('text', 'ab', [mark('bold', 0, 2)], 'id-1'));
    });

    it('T6.5 conserve un bloc texte vide', () => {
      expect(service.parse('<p></p>', counter())).toEqual([mkText('text', '', [], 'id-1')]);
    });
  });

  // ==========================================================================
  // Groupe 7 — round-trip parse(render(m)) (propriété clé)
  // ==========================================================================
  describe('round-trip parse(render(m))', () => {
    const render = new DocumentRenderService(new DocumentModelService());

    it('T7.1 round-trip de l\'exemple maître', () => {
      const m: DocModel = [
        mkText('text', 'Le petit chat noir', [mark('bold', 3, 8), mark('bold', 9, 13), mark('italic', 9, 13)], 'b1'),
      ];
      expect(stripIds(service.parse(render.render(m)))).toEqual(stripIds(m));
    });

    it('T7.2 round-trip d\'un document complet (titre, paragraphe, liste)', () => {
      const m: DocModel = [
        mkText('h1', 'Titre', [], 'b1'),
        mkText('text', 'Un paragraphe.', [], 'b2'),
        mkText('bullet', 'Pomme', [], 'b3'),
        mkText('bullet', 'Poire', [], 'b4'),
      ];
      expect(stripIds(service.parse(render.render(m)))).toEqual(stripIds(m));
    });

    it('T7.3 round-trip couleur + taille + média', () => {
      const m: DocModel = [
        mkText('text', 'abc', [mark('color', 0, 3, '#00ff00'), mark('size', 0, 3, 'large')], 'b1'),
        mkImage('x.jpg', 'b2'),
        mkVideo({ url: 'https://v/y' }, 'b3'),
      ];
      expect(stripIds(service.parse(render.render(m)))).toEqual(stripIds(m));
    });

    it('T7.4 renvoie des marques canoniques', () => {
      const m: DocModel = [
        mkText('text', 'Le petit chat noir', [mark('bold', 3, 8), mark('bold', 9, 13), mark('italic', 9, 13)], 'b1'),
      ];
      const [block] = service.parse(render.render(m));
      expect((block as TextBlock).marks).toEqual([mark('bold', 3, 8), mark('bold', 9, 13), mark('italic', 9, 13)]);
    });
  });
});
