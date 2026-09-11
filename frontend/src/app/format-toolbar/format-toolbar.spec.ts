import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormatToolbar } from './format-toolbar';
import { NOTE_COLOR_PALETTE } from '../core/models';

/**
 * Tests de la barre d'outils de formatage (TDD / boîte noire).
 *
 * Voir .agent/PLAN_TESTS_FORMAT_TOOLBAR.md (cadre : pivot « document riche unique »,
 * .agent/PLAN_PIVOT_DOCUMENT_RICHE.md). Ce composant RAPATRIE et rend vérifiables les
 * Groupes 6 (mise en forme, ex-`execCommand`), 7 (image) et 8 (vidéo) de note-editor.spec.ts.
 *
 * Décisions appliquées :
 *   D1  — cœur = méthodes pures `applyFormat` / `insertImage` / `insertVideo` (aucun effet de
 *         bord, aucune dépendance à la sélection du navigateur → testables sous jsdom).
 *   D2  — marques sémantiques : bold → <strong>, italic → <em>, underline → <u>.
 *   D3  — couleur = style inline `<span style="color:{hex}">` (toute couleur).
 *   D4  — taille = style inline `<span style="font-size:{v}">` ; `normal` → texte inchangé.
 *   D5  — listes : puces → <ul><li>, numérotée → <ol><li> ; multi-lignes → un <li> par ligne.
 *   D6  — portion vide → sortie vide.
 *   D7  — le texte d'entrée est préservé littéralement entre les balises.
 *   D8  — cliquer un bouton / confirmer une popup émet la sortie via @Output() formatApplied.
 *   D9  — garde : pour les transformations, sans sélection un clic n'émet rien.
 *   D10 — image : popup (lien via .image-url-input/.btn-image-link ; fichier via primitive
 *         insertImage(dataURL), le câblage FileReader étant de l'intégration).
 *   D11 — vidéo : popup lien SEUL (.btn-video-file absent) → embed <iframe>.
 *   D12 — popups rendues conditionnellement (@if) : absentes du DOM tant que fermées.
 */

describe('FormatToolbar (barre d’outils de formatage)', () => {
  let fixture: ComponentFixture<FormatToolbar>;
  let component: FormatToolbar;
  let el: HTMLElement;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FormatToolbar],
    }).compileComponents();

    fixture = TestBed.createComponent(FormatToolbar);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  // --- Helpers ---------------------------------------------------------------

  /** Alimente la sélection courante — HTML (contrat @Input selectedText). */
  function setSelection(html: string): void {
    fixture.componentRef.setInput('selectedText', html);
    fixture.detectChanges();
  }

  /** Abonne un collecteur aux émissions de la sortie (formatApplied). */
  function captureEmissions(): string[] {
    const emitted: string[] = [];
    component.formatApplied.subscribe((value: string) => emitted.push(value));
    return emitted;
  }

  const click = (selector: string) =>
    el.querySelector<HTMLButtonElement>(selector)!.click();

  /** Renseigne un champ texte (input) puis notifie Angular. */
  function typeInto(selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Groupe 1 — Marques sémantiques (fonction pure)
  // ---------------------------------------------------------------------------
  describe('Marques (fonction pure)', () => {
    it('T1.1 gras enrobe le texte dans <strong>', async () => {
      await setup();
      expect(component.applyFormat('Salut', { type: 'bold' })).toBe('<strong>Salut</strong>');
    });

    it('T1.2 italique enrobe le texte dans <em>', async () => {
      await setup();
      expect(component.applyFormat('Salut', { type: 'italic' })).toBe('<em>Salut</em>');
    });

    it('T1.3 souligné enrobe le texte dans <u>', async () => {
      await setup();
      expect(component.applyFormat('Salut', { type: 'underline' })).toBe('<u>Salut</u>');
    });

    it('T1.4 cumule avec une mise en forme existante par imbrication (D13)', async () => {
      await setup();
      // La sélection porte déjà du gras → on l'enveloppe sans le perdre (cumul).
      expect(component.applyFormat('<strong>Salut</strong>', { type: 'underline' })).toBe(
        '<u><strong>Salut</strong></u>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 2 — Couleur (fonction pure)
  // ---------------------------------------------------------------------------
  describe('Couleur (fonction pure)', () => {
    it('T2.1 une couleur de la palette produit un span coloré en style inline', async () => {
      await setup();
      expect(component.applyFormat('Salut', { type: 'color', color: '#FF3B30' })).toBe(
        '<span style="color:#FF3B30">Salut</span>',
      );
    });

    it('T2.2 une couleur hors palette est appliquée aussi (aucune restriction)', async () => {
      await setup();
      expect(component.applyFormat('Salut', { type: 'color', color: '#123456' })).toBe(
        '<span style="color:#123456">Salut</span>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Taille (fonction pure)
  // ---------------------------------------------------------------------------
  describe('Taille (fonction pure)', () => {
    it('T3.1 h1 → font-size xx-large', async () => {
      await setup();
      expect(component.applyFormat('Titre', { type: 'size', size: 'h1' })).toBe(
        '<span style="font-size:xx-large">Titre</span>',
      );
    });

    it('T3.2 h2 → font-size x-large', async () => {
      await setup();
      expect(component.applyFormat('Titre', { type: 'size', size: 'h2' })).toBe(
        '<span style="font-size:x-large">Titre</span>',
      );
    });

    it('T3.3 small → font-size small', async () => {
      await setup();
      expect(component.applyFormat('Note', { type: 'size', size: 'small' })).toBe(
        '<span style="font-size:small">Note</span>',
      );
    });

    it('T3.4 large → font-size large', async () => {
      await setup();
      expect(component.applyFormat('Note', { type: 'size', size: 'large' })).toBe(
        '<span style="font-size:large">Note</span>',
      );
    });

    it('T3.5 normal → texte inchangé (pas d’enrobage)', async () => {
      await setup();
      expect(component.applyFormat('Note', { type: 'size', size: 'normal' })).toBe('Note');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Listes (fonction pure)
  // ---------------------------------------------------------------------------
  describe('Listes (fonction pure)', () => {
    it('T4.1 liste à puces (une ligne) → <ul><li>…</li></ul>', async () => {
      await setup();
      expect(component.applyFormat('Courses', { type: 'list', style: 'bullet' })).toBe(
        '<ul><li>Courses</li></ul>',
      );
    });

    it('T4.2 liste numérotée (une ligne) → <ol><li>…</li></ol>', async () => {
      await setup();
      expect(component.applyFormat('Étapes', { type: 'list', style: 'numbered' })).toBe(
        '<ol><li>Étapes</li></ol>',
      );
    });

    it('T4.3 texte multi-lignes → un <li> par ligne', async () => {
      await setup();
      expect(component.applyFormat('pain\nlait', { type: 'list', style: 'bullet' })).toBe(
        '<ul><li>pain</li><li>lait</li></ul>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 5 — Cas limites (fonction pure)
  // ---------------------------------------------------------------------------
  describe('Cas limites (fonction pure)', () => {
    it('T5.1 une portion vide renvoie une sortie vide, quelle que soit l’action', async () => {
      await setup();
      expect(component.applyFormat('', { type: 'bold' })).toBe('');
      expect(component.applyFormat('', { type: 'color', color: '#FF3B30' })).toBe('');
      expect(component.applyFormat('', { type: 'size', size: 'h1' })).toBe('');
      expect(component.applyFormat('', { type: 'list', style: 'bullet' })).toBe('');
    });

    it('T5.2 un texte multi-mots est préservé littéralement entre les balises', async () => {
      await setup();
      expect(component.applyFormat('deux mots, avec ponctuation !', { type: 'bold' })).toBe(
        '<strong>deux mots, avec ponctuation !</strong>',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 6 — Barre d'outils → sortie émise (@Output, boîte noire DOM)
  // ---------------------------------------------------------------------------
  describe('Câblage DOM → sortie émise', () => {
    it('T6.1 clic sur gras émet la portion enrobée dans <strong>', async () => {
      await setup();
      setSelection('Bonjour');
      const emitted = captureEmissions();
      click('.btn-bold');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<strong>');
      expect(emitted[0]).toContain('Bonjour');
    });

    it('T6.2 clic sur italique émet la portion enrobée dans <em>', async () => {
      await setup();
      setSelection('Bonjour');
      const emitted = captureEmissions();
      click('.btn-italic');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<em>');
    });

    it('T6.3 clic sur souligné émet la portion enrobée dans <u>', async () => {
      await setup();
      setSelection('Bonjour');
      const emitted = captureEmissions();
      click('.btn-underline');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<u>');
    });

    it('T6.4 clic sur une pastille de couleur émet un span de cette couleur', async () => {
      await setup();
      setSelection('Bonjour');
      const emitted = captureEmissions();
      el.querySelector<HTMLButtonElement>('.color-swatch[data-color="#FF3B30"]')!.click();
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<span');
      expect(emitted[0]).toContain('color:#FF3B30');
      expect(emitted[0]).toContain('Bonjour');
    });

    it('T6.5 la palette affiche une pastille par couleur du domaine', async () => {
      await setup();
      expect(el.querySelectorAll('.color-swatch').length).toBe(NOTE_COLOR_PALETTE.length);
    });

    it('T6.6 les boutons de taille émettent la portion dimensionnée', async () => {
      await setup();
      setSelection('Bonjour');

      const h1 = captureEmissions();
      click('.btn-size-h1');
      expect(h1[0]).toContain('font-size:xx-large');

      const small = captureEmissions();
      click('.btn-size-small');
      // small[] a aussi reçu l'émission h1 (même sujet) → on cible la dernière.
      expect(small[small.length - 1]).toContain('font-size:small');
    });

    it('T6.7 clic sur liste à puces émet une <ul>', async () => {
      await setup();
      setSelection('Bonjour');
      const emitted = captureEmissions();
      click('.btn-list-bullet');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<ul>');
      expect(emitted[0]).toContain('<li>Bonjour</li>');
    });

    it('T6.8 sans sélection, un clic n’émet rien (garde)', async () => {
      await setup();
      setSelection('');
      const emitted = captureEmissions();
      click('.btn-bold');
      expect(emitted).toHaveLength(0);
    });

    it('T6.9 appliquer une marque à une sélection déjà formatée cumule (D13)', async () => {
      await setup();
      setSelection('<strong>Bonjour</strong>');
      const emitted = captureEmissions();
      click('.btn-underline');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe('<u><strong>Bonjour</strong></u>');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 — Insertion d'image (popup lien / fichier)
  // ---------------------------------------------------------------------------
  describe('Insertion d’image', () => {
    it('T7.1 la popup image est absente au départ, puis s’ouvre au clic', async () => {
      await setup();
      expect(el.querySelector('.image-popup')).toBeNull();
      click('.btn-image');
      fixture.detectChanges();
      expect(el.querySelector('.image-popup')).toBeTruthy();
    });

    it('T7.2 par lien : émet une <img> pointant l’URL saisie', async () => {
      await setup();
      const emitted = captureEmissions();
      click('.btn-image');
      fixture.detectChanges();
      typeInto('.image-url-input', 'https://ex.com/a.jpg');
      click('.btn-image-link');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<img');
      expect(emitted[0]).toContain('https://ex.com/a.jpg');
    });

    it('T7.3 insertion directe (data URL) via la primitive : émet une <img> data:', async () => {
      await setup();
      const emitted = captureEmissions();
      // Le câblage fichier/FileReader est de l'intégration ; on teste la primitive (D10).
      component.insertImage('data:image/png;base64,AAAA');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<img');
      expect(emitted[0]).toContain('data:image/png;base64,AAAA');
    });

    it('T7.4 la popup propose un champ fichier (input[type=file])', async () => {
      await setup();
      click('.btn-image');
      fixture.detectChanges();
      const fileInput = el.querySelector<HTMLInputElement>('.btn-image-file');
      expect(fileInput).toBeTruthy();
      expect(fileInput!.getAttribute('type')).toBe('file');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 — Insertion de vidéo (popup lien seul)
  // ---------------------------------------------------------------------------
  describe('Insertion de vidéo', () => {
    it('T8.1 la popup vidéo est absente au départ, puis s’ouvre au clic', async () => {
      await setup();
      expect(el.querySelector('.video-popup')).toBeNull();
      click('.btn-video');
      fixture.detectChanges();
      expect(el.querySelector('.video-popup')).toBeTruthy();
    });

    it('T8.2 par lien : émet un embed (iframe) pointant la vidéo', async () => {
      await setup();
      const emitted = captureEmissions();
      click('.btn-video');
      fixture.detectChanges();
      typeInto('.video-url-input', 'https://www.youtube.com/watch?v=abc123');
      click('.btn-video-link');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<iframe');
      expect(emitted[0]).toContain('abc123');
    });

    it('T8.3 aucun champ fichier vidéo n’est proposé (lien seul)', async () => {
      await setup();
      click('.btn-video');
      fixture.detectChanges();
      expect(el.querySelector('.btn-video-file')).toBeNull();
    });

    it('T8.4 primitive insertVideo(lien) : émet un embed <iframe>', async () => {
      await setup();
      const emitted = captureEmissions();
      component.insertVideo('https://www.youtube.com/watch?v=abc123');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('<iframe');
      expect(emitted[0]).toContain('abc123');
    });
  });
});
