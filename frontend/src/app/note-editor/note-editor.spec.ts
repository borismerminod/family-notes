import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { NoteEditor } from './note-editor';
import { NotesService } from '../core/services/notes-service';
import { NoteBlock } from '../core/models/document.model';

/**
 * Tests de l'éditeur « document riche » (TDD / boîte noire) — version **blocks**.
 * Le contenu est désormais un `NoteBlock[]` (cf. .agent/PLAN_MODELE_DOCUMENT_JSON.md). L'éditeur
 * passe `[blocks]` au `RichTextEditor` (composant réel, intégré ici) et récupère `(blocksChange)`.
 */

interface NoteLike {
  id: string;
  title: string;
  category: string;
  blocks: NoteBlock[];
  updatedAt: string;
}

const EXISTING: NoteLike = {
  id: '2',
  title: 'Idées vacances',
  category: 'Voyage',
  blocks: [
    { id: 'b1', kind: 'h1', text: 'Destination : Japon', marks: [] },
    { id: 'b2', kind: 'text', text: 'Visiter Kyoto et Osaka.', marks: [] },
  ],
  updatedAt: '2026-02-01',
};

describe('NoteEditor (éditeur document riche, blocks)', () => {
  let fixture: ComponentFixture<NoteEditor>;
  let el: HTMLElement;
  let notesService: {
    getNoteById: ReturnType<typeof vi.fn>;
    createNote: ReturnType<typeof vi.fn>;
    updateNote: ReturnType<typeof vi.fn>;
  };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(opts: { id?: string; getNoteById?: ReturnType<typeof vi.fn> } = {}): Promise<void> {
    notesService = {
      getNoteById: opts.getNoteById ?? vi.fn().mockResolvedValue(EXISTING),
      createNote: vi.fn().mockResolvedValue(EXISTING),
      updateNote: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [NoteEditor],
      providers: [
        provideRouter([]),
        { provide: NotesService, useValue: notesService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(opts.id ? { id: opts.id } : {}) } },
        },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(NoteEditor);
    el = fixture.nativeElement as HTMLElement;
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const titleInput = () => el.querySelector<HTMLInputElement>('.editor-title');
  const categoryInput = () => el.querySelector<HTMLInputElement>('.editor-category');
  const editorContent = () => el.querySelector<HTMLElement>('.editor-content');

  function setInputValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Simule une édition dans le contenteditable → l'éditeur re-dérive les blocs (onInput). */
  function setContent(html: string): void {
    const ce = editorContent()!;
    ce.innerHTML = html;
    ce.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  const clickSave = () => el.querySelector<HTMLButtonElement>('.btn-save')!.click();
  const clickCancel = () => el.querySelector<HTMLButtonElement>('.btn-cancel')!.click();

  /** Derniers blocs envoyés à create/updateNote. */
  function savedBlocks(): NoteBlock[] {
    const call = notesService.updateNote.mock.calls[0] ?? notesService.createNote.mock.calls[0];
    return (call?.[0] as { blocks: NoteBlock[] }).blocks;
  }

  // --- Groupe 1 — Chargement en mode édition --------------------------------
  describe('Chargement en mode édition', () => {
    it('T1.1 demande la bonne note à la source', async () => {
      await setup({ id: '2' });
      await render();
      expect(notesService.getNoteById).toHaveBeenCalledWith('2');
    });

    it('T1.2 affiche le titre et la catégorie', async () => {
      await setup({ id: '2' });
      await render();
      expect(titleInput()?.value).toBe('Idées vacances');
      expect(categoryInput()?.value).toBe('Voyage');
    });

    it('T1.3 rend les blocs chargés dans la zone d’édition', async () => {
      await setup({ id: '2' });
      await render();
      expect(editorContent()).toBeTruthy();
      expect(editorContent()!.innerHTML).toContain('Destination : Japon');
      expect(editorContent()!.innerHTML).toContain('Visiter Kyoto et Osaka.');
    });
  });

  // --- Groupe 2 — Chargement en mode création -------------------------------
  describe('Chargement en mode création', () => {
    it('T2.1 ne demande aucune note à la source', async () => {
      await setup({});
      await render();
      expect(notesService.getNoteById).not.toHaveBeenCalled();
    });

    it('T2.2 démarre vierge (titre, catégorie et contenu vides)', async () => {
      await setup({});
      await render();
      expect(titleInput()?.value).toBe('');
      expect(categoryInput()?.value).toBe('');
      expect(editorContent()!.innerHTML.trim()).toBe('');
    });
  });

  // --- Groupe 3 — États de chargement / erreurs -----------------------------
  describe('États de chargement / erreurs', () => {
    it('T3.1 affiche un indicateur tant que la note n’est pas arrivée', async () => {
      let resolve!: (n: NoteLike) => void;
      const pending = vi.fn().mockReturnValue(new Promise<NoteLike>((r) => (resolve = r)));
      await setup({ id: '2', getNoteById: pending });
      fixture.detectChanges();
      expect(el.querySelector('.spinner')).toBeTruthy();
      resolve(EXISTING);
    });

    it('T3.2 masque l’indicateur une fois la note arrivée', async () => {
      await setup({ id: '2' });
      await render();
      expect(el.querySelector('.spinner')).toBeNull();
      expect(editorContent()).toBeTruthy();
    });

    it('T3.3 affiche « note introuvable » si l’id ne correspond à rien', async () => {
      await setup({ id: '999', getNoteById: vi.fn().mockResolvedValue(undefined) });
      await render();
      expect(el.querySelector('.not-found')).toBeTruthy();
      expect(titleInput()).toBeNull();
    });

    it('T3.4 termine le chargement sans planter si la source échoue', async () => {
      await setup({ id: '2', getNoteById: vi.fn().mockRejectedValue(new Error('boom')) });
      await render();
      expect(el.querySelector('.spinner')).toBeNull();
    });
  });

  // --- Groupe 4 — Métadonnées ------------------------------------------------
  describe('Métadonnées', () => {
    it('T4.1 le titre modifié est reflété à l’enregistrement', async () => {
      await setup({ id: '2' });
      await render();
      setInputValue(titleInput()!, 'Nouveau titre');
      clickSave();
      await fixture.whenStable();
      expect(notesService.updateNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nouveau titre' }));
    });

    it('T4.2 la catégorie modifiée est reflétée à l’enregistrement', async () => {
      await setup({ id: '2' });
      await render();
      setInputValue(categoryInput()!, 'Loisirs');
      clickSave();
      await fixture.whenStable();
      expect(notesService.updateNote).toHaveBeenCalledWith(expect.objectContaining({ category: 'Loisirs' }));
    });
  });

  // --- Groupe 5 — Rendu & édition du contenu --------------------------------
  describe('Rendu & édition du contenu', () => {
    it('T5.1 le contenu chargé est éditable dans .editor-content', async () => {
      await setup({ id: '2' });
      await render();
      const ce = editorContent()!;
      expect(ce.getAttribute('contenteditable')).toBe('true');
      expect(ce.innerHTML).toContain('Destination : Japon');
    });

    it('T5.2 éditer le contenu est reflété à l’enregistrement (blocs)', async () => {
      await setup({ id: '2' });
      await render();
      setContent('<p>Nouveau contenu</p>');
      clickSave();
      await fixture.whenStable();
      expect(savedBlocks().some((b) => (b as any).text === 'Nouveau contenu')).toBe(true);
    });
  });

  // --- Groupe 6 — Enregistrement --------------------------------------------
  describe('Enregistrement', () => {
    it('T6.1 édition → met à jour la bonne note (pas de création)', async () => {
      await setup({ id: '2' });
      await render();
      clickSave();
      await fixture.whenStable();
      expect(notesService.updateNote).toHaveBeenCalledWith(
        expect.objectContaining({ id: '2', blocks: expect.any(Array) }),
      );
      expect(notesService.createNote).not.toHaveBeenCalled();
    });

    it('T6.2 création → crée une note (pas de mise à jour)', async () => {
      await setup({});
      await render();
      setInputValue(titleInput()!, 'Ma note');
      setContent('<p>Contenu</p>');
      clickSave();
      await fixture.whenStable();
      expect(notesService.createNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ma note' }));
      expect(savedBlocks().some((b) => (b as any).text === 'Contenu')).toBe(true);
      expect(notesService.updateNote).not.toHaveBeenCalled();
    });

    it('T6.3 navigue vers la liste après succès', async () => {
      await setup({ id: '2' });
      await render();
      clickSave();
      await fixture.whenStable();
      expect(navigateSpy).toHaveBeenCalledWith(['/notes']);
    });

    it('T6.4 reste sur l’éditeur et ne plante pas si l’enregistrement échoue', async () => {
      await setup({ id: '2' });
      await render();
      notesService.updateNote.mockRejectedValue(new Error('échec'));
      clickSave();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(titleInput()).toBeTruthy();
    });
  });

  // --- Groupe 7 — Annulation -------------------------------------------------
  describe('Annulation', () => {
    it('T7.1 revient à la liste sans créer ni mettre à jour', async () => {
      await setup({ id: '2' });
      await render();
      clickCancel();
      await fixture.whenStable();
      expect(navigateSpy).toHaveBeenCalledWith(['/notes']);
      expect(notesService.createNote).not.toHaveBeenCalled();
      expect(notesService.updateNote).not.toHaveBeenCalled();
    });
  });
});
