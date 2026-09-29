import { DocumentRenderService } from './document-render';
import { DocumentModelService } from './document-model';
import { DocModel, ImageBlock, Mark, MarkType, TextBlock, TextBlockKind, VideoBlock } from '../models/document.model';

/**
 * Tests du `DocumentRenderService` — rendu PUR modèle → HTML canonique — TDD / boîte noire.
 * Voir .agent/PLAN_TESTS_DOCUMENT_RENDER.md et .agent/PLAN_MODELE_DOCUMENT_JSON.md (§4.3).
 *
 * Doublures : AUCUNE. Le service dépend du `DocumentModelService` (pur, déjà testé) pour normaliser
 * les blocs avant rendu ; on l'instancie réellement : `new DocumentRenderService(new DocumentModelService())`.
 *
 * Décisions figées (cf. plan §4 + tranchées avec le porteur) :
 *   DR-NORMALIZE — chaque bloc texte est normalisé avant rendu (runs contigus → une seule balise).
 *   DR-TAGS — bold→strong, italic→em, underline→u, color→span[style=color], size→span[style=font-size].
 *   DR-ORDER — ordre de nesting D7 : strong ▸ em ▸ u ▸ span[color] ▸ span[font-size].
 *   DR-BLOCK — text→p, h1→h1, h2→h2, bullet/numbered→li ; blocs concaténés sans séparateur.
 *   DR-LIST — blocs de liste consécutifs de même type regroupés en un seul <ul>/<ol> (D9).
 *   DR-MEDIA — image→<img src>, video url→<iframe src> (url prioritaire), video src→<video src>.
 *   DR-ESCAPE — texte échappé & < > ; attributs échappés & < > ".
 *   §7.1 — couleur émise brute depuis le modèle (pas de re-normalisation de casse).
 */

// --- Helpers de construction (aucun montage DOM) ------------------------------

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

describe('DocumentRenderService (rendu modèle → HTML, pur)', () => {
  let service: DocumentRenderService;

  beforeEach(() => {
    service = new DocumentRenderService(new DocumentModelService());
  });

  // ==========================================================================
  // Groupe 1 — rendu inline : marques simples & imbriquées
  // ==========================================================================
  describe('rendu inline', () => {
    it('T1.1 rend du texte nu dans un <p>', () => {
      expect(service.render([mkText('text', 'abc')])).toBe('<p>abc</p>');
    });

    it('T1.2 enveloppe un run gras', () => {
      const block = mkText('text', 'Le petit chat', [mark('bold', 3, 8)]);
      expect(service.render([block])).toBe('<p>Le <strong>petit</strong> chat</p>');
    });

    it('T1.3a enveloppe l\'italique', () => {
      expect(service.render([mkText('text', 'abc', [mark('italic', 0, 3)])])).toBe('<p><em>abc</em></p>');
    });

    it('T1.3b enveloppe le souligné', () => {
      expect(service.render([mkText('text', 'abc', [mark('underline', 0, 3)])])).toBe('<p><u>abc</u></p>');
    });

    it('T1.4 imbrique gras+italique dans l\'ordre D7', () => {
      const block = mkText('text', 'abc', [mark('bold', 0, 3), mark('italic', 0, 3)]);
      expect(service.render([block])).toBe('<p><strong><em>abc</em></strong></p>');
    });

    it('T1.5 rend l\'exemple maître « Le petit chat noir »', () => {
      const block = mkText('text', 'Le petit chat noir', [
        mark('bold', 3, 8),
        mark('bold', 9, 13),
        mark('italic', 9, 13),
      ]);
      expect(service.render([block])).toBe(
        '<p>Le <strong>petit</strong> <strong><em>chat</em></strong> noir</p>',
      );
    });

    it('T1.6 rend la couleur en span inline-style', () => {
      const block = mkText('text', 'abc', [mark('color', 0, 3, '#FF0000')]);
      expect(service.render([block])).toBe('<p><span style="color:#FF0000">abc</span></p>');
    });

    it('T1.7a rend la taille small', () => {
      const block = mkText('text', 'abc', [mark('size', 0, 3, 'small')]);
      expect(service.render([block])).toBe('<p><span style="font-size:small">abc</span></p>');
    });

    it('T1.7b rend la taille large', () => {
      const block = mkText('text', 'abc', [mark('size', 0, 3, 'large')]);
      expect(service.render([block])).toBe('<p><span style="font-size:large">abc</span></p>');
    });

    it('T1.8 imbrique couleur puis taille (D7)', () => {
      const block = mkText('text', 'abc', [mark('color', 0, 3, '#00FF00'), mark('size', 0, 3, 'large')]);
      expect(service.render([block])).toBe(
        '<p><span style="color:#00FF00"><span style="font-size:large">abc</span></span></p>',
      );
    });

    it('T1.9 imbrique les 5 marques dans l\'ordre complet D7', () => {
      const block = mkText('text', 'abc', [
        mark('bold', 0, 3),
        mark('italic', 0, 3),
        mark('underline', 0, 3),
        mark('color', 0, 3, '#123456'),
        mark('size', 0, 3, 'small'),
      ]);
      expect(service.render([block])).toBe(
        '<p><strong><em><u><span style="color:#123456"><span style="font-size:small">abc</span></span></u></em></strong></p>',
      );
    });
  });

  // ==========================================================================
  // Groupe 2 — frontières / segments (§4.3)
  // ==========================================================================
  describe('frontières / segments', () => {
    it('T2.1 rend deux runs séparés par un trou en deux balises distinctes', () => {
      const block = mkText('text', 'abcdef', [mark('bold', 0, 2), mark('bold', 4, 6)]);
      expect(service.render([block])).toBe('<p><strong>ab</strong>cd<strong>ef</strong></p>');
    });

    it('T2.2 fusionne les runs contigus en une seule balise (normalisation)', () => {
      const block = mkText('text', 'abcd', [mark('bold', 0, 2), mark('bold', 2, 4)]);
      expect(service.render([block])).toBe('<p><strong>abcd</strong></p>');
    });

    it('T2.3 découpe correctement un chevauchement partiel gras/italique', () => {
      const block = mkText('text', 'abcd', [mark('bold', 0, 3), mark('italic', 1, 4)]);
      expect(service.render([block])).toBe(
        '<p><strong>a</strong><strong><em>bc</em></strong><em>d</em></p>',
      );
    });
  });

  // ==========================================================================
  // Groupe 3 — échappement HTML
  // ==========================================================================
  describe('échappement', () => {
    it('T3.1 échappe & < > dans le texte nu', () => {
      expect(service.render([mkText('text', 'a<b>&c')])).toBe('<p>a&lt;b&gt;&amp;c</p>');
    });

    it('T3.2 échappe à l\'intérieur d\'une marque', () => {
      const block = mkText('text', 'a<b', [mark('bold', 0, 3)]);
      expect(service.render([block])).toBe('<p><strong>a&lt;b</strong></p>');
    });
  });

  // ==========================================================================
  // Groupe 4 — kinds de bloc (p / h1 / h2) et concaténation
  // ==========================================================================
  describe('kinds de bloc', () => {
    it('T4.1 rend un h1', () => {
      expect(service.render([mkText('h1', 'Titre')])).toBe('<h1>Titre</h1>');
    });

    it('T4.2 rend un h2', () => {
      expect(service.render([mkText('h2', 'Sous-titre')])).toBe('<h2>Sous-titre</h2>');
    });

    it('T4.3 rend un paragraphe', () => {
      expect(service.render([mkText('text', 'para')])).toBe('<p>para</p>');
    });

    it('T4.4 concatène plusieurs blocs sans séparateur', () => {
      const model: DocModel = [mkText('h1', 'T', [], 'b1'), mkText('text', 'p', [], 'b2')];
      expect(service.render(model)).toBe('<h1>T</h1><p>p</p>');
    });
  });

  // ==========================================================================
  // Groupe 5 — listes (regroupement D9)
  // ==========================================================================
  describe('listes', () => {
    it('T5.1 regroupe des puces consécutives en un seul <ul>', () => {
      const model: DocModel = [mkText('bullet', 'a', [], 'b1'), mkText('bullet', 'b', [], 'b2')];
      expect(service.render(model)).toBe('<ul><li>a</li><li>b</li></ul>');
    });

    it('T5.2 regroupe des numéros consécutifs en un seul <ol>', () => {
      const model: DocModel = [mkText('numbered', 'a', [], 'b1'), mkText('numbered', 'b', [], 'b2')];
      expect(service.render(model)).toBe('<ol><li>a</li><li>b</li></ol>');
    });

    it('T5.3 sépare deux listes de types différents', () => {
      const model: DocModel = [mkText('bullet', 'a', [], 'b1'), mkText('numbered', 'b', [], 'b2')];
      expect(service.render(model)).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
    });

    it('T5.4 un bloc texte intercalé sépare deux <ul>', () => {
      const model: DocModel = [
        mkText('bullet', 'a', [], 'b1'),
        mkText('text', 'x', [], 'b2'),
        mkText('bullet', 'b', [], 'b3'),
      ];
      expect(service.render(model)).toBe('<ul><li>a</li></ul><p>x</p><ul><li>b</li></ul>');
    });

    it('T5.5 un <li> porte le formatage inline', () => {
      const model: DocModel = [mkText('bullet', 'ab', [mark('bold', 0, 2)], 'b1')];
      expect(service.render(model)).toBe('<ul><li><strong>ab</strong></li></ul>');
    });
  });

  // ==========================================================================
  // Groupe 6 — média (D10)
  // ==========================================================================
  describe('média', () => {
    it('T6.1 rend une image', () => {
      expect(service.render([mkImage('path/to/tokyo.jpg')])).toBe('<img src="path/to/tokyo.jpg">');
    });

    it('T6.2 rend une vidéo par url en iframe', () => {
      const model: DocModel = [mkVideo({ url: 'https://youtube.com/watch?v=example1' })];
      expect(service.render(model)).toBe('<iframe src="https://youtube.com/watch?v=example1"></iframe>');
    });

    it('T6.3 rend une vidéo locale (src) en <video>', () => {
      expect(service.render([mkVideo({ src: 'file://x.mp4' })])).toBe('<video src="file://x.mp4"></video>');
    });

    it('T6.4 privilégie url sur src pour une vidéo', () => {
      const model: DocModel = [mkVideo({ url: 'https://v/y', src: 'file://x.mp4' })];
      expect(service.render(model)).toBe('<iframe src="https://v/y"></iframe>');
    });

    it('T6.5 un média intercalé ferme puis rouvre la liste', () => {
      const model: DocModel = [
        mkText('bullet', 'a', [], 'b1'),
        mkImage('x.jpg'),
        mkText('bullet', 'b', [], 'b3'),
      ];
      expect(service.render(model)).toBe('<ul><li>a</li></ul><img src="x.jpg"><ul><li>b</li></ul>');
    });

    it('T6.6 échappe src / url', () => {
      expect(service.render([mkImage('a&b.jpg')])).toBe('<img src="a&amp;b.jpg">');
    });
  });

  // ==========================================================================
  // Groupe 7 — cas limites, document complet & pureté
  // ==========================================================================
  describe('cas limites & document complet', () => {
    it('T7.1 rend une chaîne vide pour un modèle vide', () => {
      expect(service.render([])).toBe('');
    });

    it('T7.2 rend un bloc texte vide en <p></p>', () => {
      expect(service.render([mkText('text', '')])).toBe('<p></p>');
    });

    it('T7.3 rend l\'exemple complet du §4.1', () => {
      const model: DocModel = [
        mkText('h1', 'Titre', [], 'b1'),
        mkText('text', 'Un paragraphe.', [], 'b2'),
        mkText('bullet', 'Pomme', [], 'b3'),
        mkText('bullet', 'Poire', [], 'b4'),
      ];
      expect(service.render(model)).toBe(
        '<h1>Titre</h1><p>Un paragraphe.</p><ul><li>Pomme</li><li>Poire</li></ul>',
      );
    });

    it('T7.4 ne mute pas le modèle d\'entrée', () => {
      const model: DocModel = [mkText('text', 'abcd', [mark('bold', 0, 2), mark('bold', 2, 4)], 'b1')];
      const snapshot = structuredClone(model);
      service.render(model);
      expect(model).toEqual(snapshot);
    });
  });

  // ==========================================================================
  // Groupe 8 — option { withBlockIds } : repères data-block-id (pour l'éditeur)
  // ==========================================================================
  describe('option withBlockIds', () => {
    it('T8.1 pose data-block-id sur un paragraphe', () => {
      expect(service.render([mkText('text', 'abc', [], 'b1')], { withBlockIds: true })).toBe(
        '<p data-block-id="b1">abc</p>',
      );
    });

    it('T8.2 pose data-block-id sur un titre', () => {
      expect(service.render([mkText('h1', 'T', [], 'b1')], { withBlockIds: true })).toBe(
        '<h1 data-block-id="b1">T</h1>',
      );
    });

    it('T8.3 pose data-block-id sur chaque <li>, pas sur le <ul>', () => {
      const model: DocModel = [mkText('bullet', 'a', [], 'b1'), mkText('bullet', 'b', [], 'b2')];
      expect(service.render(model, { withBlockIds: true })).toBe(
        '<ul><li data-block-id="b1">a</li><li data-block-id="b2">b</li></ul>',
      );
    });

    it('T8.4 pose data-block-id sur un média', () => {
      expect(service.render([mkImage('x.jpg', 'b1')], { withBlockIds: true })).toBe(
        '<img data-block-id="b1" src="x.jpg">',
      );
    });

    it('T8.5 conserve le formatage inline sous le bloc identifié', () => {
      const block = mkText('text', 'Le petit', [mark('bold', 3, 8)], 'b1');
      expect(service.render([block], { withBlockIds: true })).toBe(
        '<p data-block-id="b1">Le <strong>petit</strong></p>',
      );
    });

    it('T8.6 n\'ajoute aucun id par défaut (rendu canonique inchangé)', () => {
      expect(service.render([mkText('text', 'abc', [], 'b1')])).toBe('<p>abc</p>');
    });
  });

  // ==========================================================================
  // Groupe 9 — lien : rendu `<a href …>` — §B1 du PLAN_TESTS_INSERTION_LIEN.md
  // ==========================================================================
  // DL4 — `link` → `<a href="URL" target="_blank" rel="noopener noreferrer">…</a>`, URL échappée.
  // DL2 — `link` est la marque la plus EXTERNE (ordre `<a><strong>…</strong></a>`).
  describe('rendu lien', () => {
    // --- Groupe B1.1 — balise <a> -------------------------------------------
    it('TB1.1 rend un run link en <a> (target/rel) (US4)', () => {
      const block = mkText('text', 'clic', [mark('link', 0, 4, 'https://ex.com')]);
      expect(service.render([block])).toBe(
        '<p><a href="https://ex.com" target="_blank" rel="noopener noreferrer">clic</a></p>',
      );
    });

    it('TB1.2 échappe l\'URL dans l\'attribut href', () => {
      const block = mkText('text', 'x', [mark('link', 0, 1, 'https://a.com/?x=1&y=2')]);
      expect(service.render([block])).toContain('href="https://a.com/?x=1&amp;y=2"');
    });

    it('TB1.3 échappe le texte du libellé (& < >) à l\'intérieur du <a>', () => {
      const block = mkText('text', 'a<b', [mark('link', 0, 3, 'https://ex.com')]);
      expect(service.render([block])).toBe(
        '<p><a href="https://ex.com" target="_blank" rel="noopener noreferrer">a&lt;b</a></p>',
      );
    });

    // --- Groupe B1.2 — cumul & ordre (DL2) ----------------------------------
    it('TB1.4 link + bold → <a><strong>…</strong></a> (link externe)', () => {
      const block = mkText('text', 'x', [mark('link', 0, 1, 'https://ex.com'), mark('bold', 0, 1)]);
      expect(service.render([block])).toBe(
        '<p><a href="https://ex.com" target="_blank" rel="noopener noreferrer"><strong>x</strong></a></p>',
      );
    });

    it('TB1.5 link + les 4 autres marques → ordre complet (link externe, puis D7)', () => {
      const block = mkText('text', 'x', [
        mark('link', 0, 1, 'https://ex.com'),
        mark('bold', 0, 1),
        mark('italic', 0, 1),
        mark('underline', 0, 1),
        mark('color', 0, 1, '#123456'),
        mark('size', 0, 1, 'small'),
      ]);
      expect(service.render([block])).toBe(
        '<p><a href="https://ex.com" target="_blank" rel="noopener noreferrer">' +
          '<strong><em><u><span style="color:#123456"><span style="font-size:small">x</span></span></u></em></strong>' +
          '</a></p>',
      );
    });

    it('TB1.6 deux liens d\'URL différentes contigus → deux <a> distincts (pas de fusion)', () => {
      const block = mkText('text', 'abcd', [
        mark('link', 0, 2, 'https://a.com'),
        mark('link', 2, 4, 'https://b.com'),
      ]);
      expect(service.render([block])).toBe(
        '<p><a href="https://a.com" target="_blank" rel="noopener noreferrer">ab</a>' +
          '<a href="https://b.com" target="_blank" rel="noopener noreferrer">cd</a></p>',
      );
    });
  });
});
