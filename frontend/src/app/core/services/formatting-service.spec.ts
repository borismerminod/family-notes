import { FormattingService } from './formatting-service';

/**
 * Tests du `FormattingService` — service PUR de mise en forme — TDD / boîte noire.
 *
 * Voir .agent/PLAN_TESTS_FORMATTING_SERVICE.md. Conception : `applyFormat(html, action)` reçoit
 * le HTML d'une sélection et renvoie le HTML transformé ; c'est le composant `RichTextEditor`
 * qui possède la sélection du contenteditable et réinsère le résultat.
 *
 * Le service ne touche jamais au `document` global ni à la sélection (pas d'`execCommand`) → ses
 * fonctions sont pures `string → string`, donc testables sous jsdom sans aucun mock global.
 *
 * Décisions (cf. plan §3) :
 *   D2 — marques en TOGGLE (recliquer retire) ;  D3 — <strong>/<em>/<u> ;
 *   D4 — couleur/taille en <span style> avec REMPLACEMENT ;  D5 — small/large en font-size,
 *   normal inchangé, h1/h2 en balises ;  D6 — listes <ul>/<ol><li> ;  D7 — cumul par imbrication ;
 *   D8 — sélection vide → sortie vide.
 */

describe('FormattingService (service pur de mise en forme)', () => {
  let service: FormattingService;

  beforeEach(() => {
    service = new FormattingService();
  });

  // ---------------------------------------------------------------------------
  // Groupe 1 — Marques : envelopper une sélection nue
  // ---------------------------------------------------------------------------
  describe('Marques — envelopper', () => {
    it('T1.1 bold enveloppe dans <strong>', () => {
      expect(service.applyFormat('Bonjour', { type: 'bold' })).toBe('<strong>Bonjour</strong>');
    });

    it('T1.2 italic enveloppe dans <em>', () => {
      expect(service.applyFormat('Bonjour', { type: 'italic' })).toBe('<em>Bonjour</em>');
    });

    it('T1.3 underline enveloppe dans <u>', () => {
      expect(service.applyFormat('Bonjour', { type: 'underline' })).toBe('<u>Bonjour</u>');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 2 — Marques : toggle (désenrober) — D2
  // ---------------------------------------------------------------------------
  describe('Marques — toggle (désenrober)', () => {
    it('T2.1 bold sur une sélection déjà grasse la retire', () => {
      expect(service.applyFormat('<strong>Bonjour</strong>', { type: 'bold' })).toBe('Bonjour');
    });

    it('T2.2 italic sur une sélection déjà italique la retire', () => {
      expect(service.applyFormat('<em>Salut</em>', { type: 'italic' })).toBe('Salut');
    });

    it('T2.3 underline sur une sélection déjà soulignée la retire', () => {
      expect(service.applyFormat('<u>Note</u>', { type: 'underline' })).toBe('Note');
    });

    it('T2.4 bold sur une sélection italique (pas déjà grasse) enveloppe en préservant l’italique', () => {
      expect(service.applyFormat('<em>Salut</em>', { type: 'bold' })).toBe(
        '<strong><em>Salut</em></strong>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Marques : cumul par imbrication — D7
  // ---------------------------------------------------------------------------
  describe('Marques — cumul par imbrication', () => {
    it('T3.1 bold sur du souligné → gras ET souligné', () => {
      expect(service.applyFormat('<u>x</u>', { type: 'bold' })).toBe('<strong><u>x</u></strong>');
    });

    it('T3.2 italic sur du gras → italique ET gras', () => {
      expect(service.applyFormat('<strong>x</strong>', { type: 'italic' })).toBe(
        '<em><strong>x</strong></em>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Couleur — D4
  // ---------------------------------------------------------------------------
  describe('Couleur', () => {
    it('T4.1 applique une couleur via <span style>', () => {
      expect(service.applyFormat('x', { type: 'color', color: '#FF3B30' })).toBe(
        '<span style="color:#FF3B30">x</span>',
      );
    });

    it('T4.2 ré-appliquer une couleur remplace l’existante (pas d’empilement)', () => {
      expect(
        service.applyFormat('<span style="color:#FF3B30">x</span>', {
          type: 'color',
          color: '#007AFF',
        }),
      ).toBe('<span style="color:#007AFF">x</span>');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 5 — Taille — D5
  // ---------------------------------------------------------------------------
  describe('Taille', () => {
    it('T5.1 small applique une font-size réduite', () => {
      expect(service.applyFormat('x', { type: 'size', size: 'small' })).toBe(
        '<span style="font-size:small">x</span>',
      );
    });

    it('T5.2 large applique une font-size agrandie', () => {
      expect(service.applyFormat('x', { type: 'size', size: 'large' })).toBe(
        '<span style="font-size:large">x</span>',
      );
    });

    it('T5.3 normal laisse le texte inchangé (aucun span)', () => {
      expect(service.applyFormat('x', { type: 'size', size: 'normal' })).toBe('x');
    });

    it('T5.4 h1 / h2 enveloppent dans les balises de titre', () => {
      expect(service.applyFormat('Titre', { type: 'size', size: 'h1' })).toBe('<h1>Titre</h1>');
      expect(service.applyFormat('Titre', { type: 'size', size: 'h2' })).toBe('<h2>Titre</h2>');
    });

    it('T5.5 ré-appliquer une taille remplace la précédente', () => {
      expect(
        service.applyFormat('<span style="font-size:small">x</span>', {
          type: 'size',
          size: 'large',
        }),
      ).toBe('<span style="font-size:large">x</span>');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 6 — Listes — D6
  // ---------------------------------------------------------------------------
  describe('Listes', () => {
    it('T6.1 bullet : un <li> par ligne, dans un <ul>', () => {
      expect(service.applyFormat('Ligne 1\nLigne 2', { type: 'list', style: 'bullet' })).toBe(
        '<ul><li>Ligne 1</li><li>Ligne 2</li></ul>',
      );
    });

    it('T6.2 numbered : un <li> par ligne, dans un <ol>', () => {
      expect(service.applyFormat('Ligne 1\nLigne 2', { type: 'list', style: 'numbered' })).toBe(
        '<ol><li>Ligne 1</li><li>Ligne 2</li></ol>',
      );
    });

    it('T6.3 une seule ligne → un seul <li>', () => {
      expect(service.applyFormat('Élément', { type: 'list', style: 'bullet' })).toBe(
        '<ul><li>Élément</li></ul>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 — Cas limites & pureté — D8
  // ---------------------------------------------------------------------------
  describe('Cas limites & pureté', () => {
    it('T7.1 une sélection vide renvoie une chaîne vide, quelle que soit l’action', () => {
      expect(service.applyFormat('', { type: 'bold' })).toBe('');
      expect(service.applyFormat('', { type: 'color', color: '#000000' })).toBe('');
      expect(service.applyFormat('', { type: 'size', size: 'large' })).toBe('');
      expect(service.applyFormat('', { type: 'list', style: 'bullet' })).toBe('');
    });

    it('T7.2 est pure : même entrée → même sortie, sans altérer l’entrée', () => {
      const input = '<em>x</em>';
      const first = service.applyFormat(input, { type: 'bold' });
      const second = service.applyFormat(input, { type: 'bold' });
      expect(first).toBe(second);
      expect(input).toBe('<em>x</em>');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 — Requête d'état actif (isActive) — §4bis
  // ---------------------------------------------------------------------------
  describe('isActive (état de la sélection)', () => {
    it('T8.1 vrai quand la sélection porte déjà la marque, faux sinon', () => {
      expect(service.isActive('<strong>x</strong>', { type: 'bold' })).toBe(true);
      expect(service.isActive('x', { type: 'bold' })).toBe(false);
    });

    it('T8.2 fonctionne pour italique et souligné', () => {
      expect(service.isActive('<em>x</em>', { type: 'italic' })).toBe(true);
      expect(service.isActive('<u>x</u>', { type: 'underline' })).toBe(true);
      expect(service.isActive('<em>x</em>', { type: 'underline' })).toBe(false);
    });
  });
});
