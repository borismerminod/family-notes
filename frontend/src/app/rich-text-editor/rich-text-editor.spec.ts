import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { RichTextEditor } from './rich-text-editor';
import { NOTE_COLOR_PALETTE } from '../core/models';

/**
 * Tests du composant « RichTextEditor » — TDD / boîte noire.
 *
 * ⚠️ REFONTE EN COURS (2026-09-13) : le `FormattingService` a été retiré ; la mise en forme
 * repart au niveau du composant avec une gestion fine de la sélection (à concevoir/implémenter).
 * Ce spec ne couvre pour l'instant que les comportements **indépendants du design de formatage** :
 * rendu de la toolbar + zone d'édition, injection du contenu (D5), émission `contentChange`,
 * popups média (ouverture/fermeture/reset), préservation de la sélection (mousedown — D4).
 *
 * Les cas de formatage (toggle marques/listes, couleur/taille, état actif, insertion média)
 * seront ajoutés groupe par groupe quand la logique de sélection sera définie.
 */

describe('RichTextEditor (base sans service — refonte en cours)', () => {
  let fixture: ComponentFixture<RichTextEditor>;
  let el: HTMLElement;
  let emitted: string[];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(content = ''): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RichTextEditor],
    }).compileComponents();

    fixture = TestBed.createComponent(RichTextEditor);
    el = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('content', content);

    emitted = [];
    fixture.componentInstance.contentChange.subscribe((v: string) => emitted.push(v));
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // --- Helpers DOM -----------------------------------------------------------
  const editor = () => el.querySelector<HTMLElement>('.editor-content')!;
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel);
  const click = (sel: string) => q<HTMLButtonElement>(sel)!.click();

  function typeInEditor(html: string): void {
    const ce = editor();
    ce.innerHTML = html;
    ce.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function setValue(sel: string, value: string): void {
    const input = q<HTMLInputElement>(sel)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Groupe 1 — Rendu de la barre d'outils et de la zone d'édition
  // ---------------------------------------------------------------------------
  describe('Rendu de la toolbar et de la zone d’édition', () => {
    it('T1.1 rend les trois boutons de marque', async () => {
      await setup();
      await render();
      expect(q('.btn-bold')).toBeTruthy();
      expect(q('.btn-italic')).toBeTruthy();
      expect(q('.btn-underline')).toBeTruthy();
    });

    it('T1.2 rend les cinq boutons de taille', async () => {
      await setup();
      await render();
      for (const s of ['small', 'normal', 'large', 'h2', 'h1']) {
        expect(q(`.btn-size-${s}`)).toBeTruthy();
      }
    });

    it('T1.3 rend les deux boutons de liste', async () => {
      await setup();
      await render();
      expect(q('.btn-list-bullet')).toBeTruthy();
      expect(q('.btn-list-numbered')).toBeTruthy();
    });

    it('T1.4 rend une pastille par couleur de la palette (avec data-color)', async () => {
      await setup();
      await render();
      const swatches = el.querySelectorAll('.color-swatch');
      expect(swatches.length).toBe(NOTE_COLOR_PALETTE.length);
      for (const color of NOTE_COLOR_PALETTE) {
        expect(el.querySelector(`.color-swatch[data-color="${color}"]`)).toBeTruthy();
      }
    });

    it('T1.5 rend les deux boutons média', async () => {
      await setup();
      await render();
      expect(q('.btn-image')).toBeTruthy();
      expect(q('.btn-video')).toBeTruthy();
    });

    it('T1.6 rend la zone .editor-content en contenteditable', async () => {
      await setup();
      await render();
      const ce = editor();
      expect(ce).toBeTruthy();
      expect(ce.getAttribute('contenteditable')).toBe('true');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 2 — Injection du contenu initial (D5)
  // ---------------------------------------------------------------------------
  describe('Injection du contenu initial', () => {
    it('T2.1 injecte le HTML entrant dans .editor-content au chargement', async () => {
      await setup('<h1>Titre</h1><p>Corps</p>');
      await render();
      expect(editor().innerHTML).toContain('Titre');
      expect(editor().innerHTML).toContain('Corps');
    });

    it('T2.2 laisse la zone vide pour un contenu entrant vide', async () => {
      await setup('');
      await render();
      expect(editor().innerHTML.trim()).toBe('');
    });

    it('T2.3 ne réécrit pas le DOM quand [content] change pendant que l’éditeur a le focus (garde D5)', async () => {
      await setup('<p>Initial</p>');
      await render();
      const ce = editor();

      ce.focus();
      ce.dispatchEvent(new Event('focus', { bubbles: true }));

      fixture.componentRef.setInput('content', '<p>Écrasé</p>');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(ce.innerHTML).toContain('Initial');
      expect(ce.innerHTML).not.toContain('Écrasé');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Préservation de la sélection (D4)
  // ---------------------------------------------------------------------------
  describe('Préservation de la sélection', () => {
    it('T3.1 le mousedown d’un bouton annule l’action par défaut (ne vole pas le focus)', async () => {
      await setup();
      await render();
      const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      q<HTMLButtonElement>('.btn-bold')!.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Émission du contenu (D7)
  // ---------------------------------------------------------------------------
  describe('Émission du contenu (contentChange)', () => {
    it('T4.1 une frappe émet le contenu courant', async () => {
      await setup();
      await render();
      typeInEditor('<p>Bonjour</p>');
      expect(emitted.at(-1)).toContain('Bonjour');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 5 — Popups média (ouverture / fermeture / reset)
  // ---------------------------------------------------------------------------
  describe('Popups média', () => {
    it('T5.1 clic sur le bouton image ouvre la popup', async () => {
      await setup();
      await render();
      expect(q('.image-popup')).toBeNull();
      click('.btn-image');
      fixture.detectChanges();
      expect(q('.image-popup')).toBeTruthy();
    });

    it('T5.2 le bouton de fermeture ferme la popup image et réinitialise le champ', async () => {
      await setup();
      await render();
      click('.btn-image');
      fixture.detectChanges();
      setValue('.image-url-input', 'https://exemple.test/chat.png');
      click('.btn-close-popup');
      fixture.detectChanges();
      expect(q('.image-popup')).toBeNull();

      click('.btn-image');
      fixture.detectChanges();
      expect(q<HTMLInputElement>('.image-url-input')!.value).toBe('');
    });

    it('T5.3 clic sur le bouton vidéo ouvre la popup', async () => {
      await setup();
      await render();
      expect(q('.video-popup')).toBeNull();
      click('.btn-video');
      fixture.detectChanges();
      expect(q('.video-popup')).toBeTruthy();
    });

    it('T5.4 le bouton de fermeture ferme la popup vidéo et réinitialise le champ', async () => {
      await setup();
      await render();
      click('.btn-video');
      fixture.detectChanges();
      setValue('.video-url-input', 'https://youtu.be/xyz');
      click('.btn-close-popup');
      fixture.detectChanges();
      expect(q('.video-popup')).toBeNull();

      click('.btn-video');
      fixture.detectChanges();
      expect(q<HTMLInputElement>('.video-url-input')!.value).toBe('');
    });
  });
});
