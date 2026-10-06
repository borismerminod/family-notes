import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { NoteEditor } from './note-editor';
import { NotesService } from '../core/services/notes-service';
import { CategoriesService } from '../core/services/categories.service';
import { NoteBlock } from '../core/models/document.model';
import { Category, NOTE_COLOR_PALETTE } from '../core/models';

/**
 * Tests de l'éditeur « document riche » (TDD / boîte noire) — version **blocks**.
 * Le contenu est désormais un `NoteBlock[]` (cf. .agent/PLAN_MODELE_DOCUMENT_JSON.md). L'éditeur
 * passe `[blocks]` au `RichTextEditor` (composant réel, intégré ici) et récupère `(blocksChange)`.
 */

interface NoteLike {
  id: string;
  title: string;
  category: Category;
  blocks: NoteBlock[];
  updatedAt: string;
}

const EXISTING: NoteLike = {
  id: '2',
  title: 'Idées vacances',
  category: { id: 'cat-voy', name: 'Voyage', color: '' },
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
  let categoriesService: {
    getAllCategories: ReturnType<typeof vi.fn>;
    getOrCreate: ReturnType<typeof vi.fn>;
  };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(
    opts: { id?: string; getNoteById?: ReturnType<typeof vi.fn>; categories?: Category[] } = {},
  ): Promise<void> {
    notesService = {
      getNoteById: opts.getNoteById ?? vi.fn().mockResolvedValue(EXISTING),
      createNote: vi.fn().mockResolvedValue(EXISTING),
      updateNote: vi.fn().mockResolvedValue(undefined),
    };
    categoriesService = {
      getAllCategories: vi.fn().mockResolvedValue(opts.categories ?? []),
      getOrCreate: vi.fn().mockImplementation(async (name: string, color?: string) => ({
        id: 'cat-x',
        name,
        color,
      })),
    };

    await TestBed.configureTestingModule({
      imports: [NoteEditor],
      providers: [
        provideRouter([]),
        { provide: NotesService, useValue: notesService },
        { provide: CategoriesService, useValue: categoriesService },
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
  /** Champ de saisie porté par le composant `CategorySelector` (intégré réellement). */
  const categoryInput = () => el.querySelector<HTMLInputElement>('.category-input');
  /** Éléments de la liste déroulante des catégories (visible seulement au focus). */
  const categoryOptions = () => Array.from(el.querySelectorAll<HTMLLIElement>('.category-list li'));
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

  /**
   * Ouvre la palette du sélecteur et clique la pastille d'indice donné — l'ordre est celui de
   * `NOTE_COLOR_PALETTE`, que le composant affiche tel quel.
   */
  function pickColor(index: number): void {
    el.querySelector<HTMLButtonElement>('.color-picker-btn')!.click();
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('.palette-item')[index].click();
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
      expect(notesService.updateNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nouveau titre' }), 'Voyage');
    });

    it('T4.2 la catégorie modifiée est reflétée à l’enregistrement', async () => {
      await setup({ id: '2' });
      await render();
      setInputValue(categoryInput()!, 'Loisirs');
      clickSave();
      await fixture.whenStable();
      expect(notesService.updateNote).toHaveBeenCalledWith(expect.objectContaining({ category: null}), 'Loisirs' );
    });
  });

  // --- Groupe 4bis — Sélecteur de catégorie ---------------------------------
  describe('Sélecteur de catégorie', () => {
    const CATEGORIES: Category[] = [
      { id: 'cat-voy', name: 'Voyage', color: '#007AFF' },
      { id: 'cat-loi', name: 'Loisirs', color: '#FF9500' },
    ];

    it('T4b.1 propose les catégories existantes à l’ouverture de la liste', async () => {
      await setup({ categories: CATEGORIES });
      await render();

      expect(categoriesService.getAllCategories).toHaveBeenCalled();
      expect(categoryOptions()).toHaveLength(0);

      categoryInput()!.dispatchEvent(new Event('focus'));
      fixture.detectChanges();

      expect(categoryOptions().map((li) => li.textContent?.trim())).toEqual(['Voyage', 'Loisirs']);
    });

    it('T4b.2 choisir une catégorie dans la liste la reporte à l’enregistrement', async () => {
      await setup({ categories: CATEGORIES });
      await render();

      categoryInput()!.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      categoryOptions()[1].click();
      fixture.detectChanges();

      expect(categoryInput()?.value).toBe('Loisirs');

      clickSave();
      await fixture.whenStable();
      expect(notesService.createNote).toHaveBeenCalledWith(expect.anything(), 'Loisirs');
    });

    it('T4b.4 enregistre la couleur choisie avec la catégorie saisie', async () => {
      await setup({ categories: CATEGORIES });
      await render();

      setInputValue(categoryInput()!, 'Jardin');
      pickColor(2);

      clickSave();
      await fixture.whenStable();

      expect(categoriesService.getOrCreate).toHaveBeenCalledWith('Jardin', NOTE_COLOR_PALETTE[2]);
    });

    it('T4b.5 enregistre la nouvelle couleur d’une catégorie existante', async () => {
      await setup({ id: '2', categories: CATEGORIES });
      await render();

      setInputValue(categoryInput()!, 'Loisirs');
      pickColor(1);

      clickSave();
      await fixture.whenStable();

      expect(categoriesService.getOrCreate).toHaveBeenCalledWith('Loisirs', NOTE_COLOR_PALETTE[1]);
    });

    it('T4b.6 transmet la couleur de la catégorie choisie dans la liste', async () => {
      await setup({ categories: CATEGORIES });
      await render();

      categoryInput()!.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      categoryOptions()[1].click();
      fixture.detectChanges();

      clickSave();
      await fixture.whenStable();

      expect(categoriesService.getOrCreate).toHaveBeenCalledWith('Loisirs', '#FF9500');
    });

    it('T4b.7 n’impose aucune couleur quand l’utilisateur n’en choisit pas', async () => {
      await setup({ categories: CATEGORIES });
      await render();

      setInputValue(categoryInput()!, 'Jardin');

      clickSave();
      await fixture.whenStable();

      expect(categoriesService.getOrCreate).toHaveBeenCalledWith('Jardin', undefined);
      expect(notesService.createNote).toHaveBeenCalledWith(expect.anything(), 'Jardin');
    });

    it('T4b.8 ne touche à aucune catégorie quand le champ est vide', async () => {
      await setup({ categories: CATEGORIES });
      await render();

      pickColor(0);

      clickSave();
      await fixture.whenStable();

      expect(categoriesService.getOrCreate).not.toHaveBeenCalled();
    });

    it('T4b.9 vider le champ repart sans couleur', async () => {
      await setup({ id: '2', categories: CATEGORIES });
      await render();

      pickColor(1);
      setInputValue(categoryInput()!, '');
      setInputValue(categoryInput()!, 'Jardin');

      clickSave();
      await fixture.whenStable();

      expect(categoriesService.getOrCreate).toHaveBeenCalledWith('Jardin', undefined);
    });

    it('T4b.10 enregistre la note même si la couleur ne peut pas être écrite', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await setup({ categories: CATEGORIES });
      await render();
      categoriesService.getOrCreate.mockRejectedValue(new Error('DB indisponible'));

      setInputValue(categoryInput()!, 'Jardin');
      pickColor(2);

      clickSave();
      await fixture.whenStable();

      expect(notesService.createNote).toHaveBeenCalledWith(expect.anything(), 'Jardin');
      expect(navigateSpy).toHaveBeenCalledWith(['/notes']);
    });

    it('T4b.3 l’éditeur reste utilisable quand les catégories ne se chargent pas', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await setup({ id: '2' });
      categoriesService.getAllCategories.mockRejectedValue(new Error('DB indisponible'));
      await render();

      expect(categoryInput()?.value).toBe('Voyage');
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
        expect.objectContaining({ id: '2', blocks: expect.any(Array), }),'Voyage'
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
      expect(notesService.createNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ma note'}), '');
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
