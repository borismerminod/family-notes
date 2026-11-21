import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { NoteList } from './note-list';
import { NotesService } from '../../core/services/notes/notes-service';

/**
 * Tests de l'écran "Liste des Notes" (approche TDD / boîte noire).
 *
 * Voir .agent/PLAN_TESTS_NOTE_LIST.md pour le comportement attendu.
 * Décisions de conception appliquées ici :
 *   - D1 : après une suppression réussie, la note est retirée localement de la liste
 *          (pas de rechargement complet de la source de données).
 *   - D2 : comportement pessimiste — la note n'est retirée qu'après succès ; en cas
 *          d'échec elle reste affichée.
 *
 * Le composant est testé en isolation : sa source de données (NotesService) est une
 * doublure, la navigation (Router) est espionnée, et la confirmation passe par la
 * popup interne (composant ConfirmDialog), pilotée via le DOM.
 */

// Jeu de données de référence utilisé par la plupart des cas.
const SAMPLE = [
  { id: '1', title: 'Courses', category: {id : 'cat-1', name: 'Maison', color:''}, updatedAt: '2026-01-01' },
  { id: '2', title: 'Idées vacances', category: {id : 'cat-2', name: 'Voyage', color:''}, updatedAt: '2026-02-01' },
  { id: '3', title: 'Recette gâteau', category: {id : 'cat-3', name: 'Cuisine', color:''}, updatedAt: '2026-03-01' },
];

/** Empty target of the real `/notes` route restored by the cases that need the real router. */
@Component({ selector: 'app-empty-route', template: '' })
class EmptyRoute {}

describe('NoteList (écran liste des notes)', () => {
  let fixture: ComponentFixture<NoteList>;
  let el: HTMLElement;
  let notesService: {
    getAllNotes: ReturnType<typeof vi.fn>;
    deleteNote: ReturnType<typeof vi.fn>;
  };
  let navigateSpy: ReturnType<typeof vi.spyOn>;
  let navigateByUrlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    notesService = {
      getAllNotes: vi.fn().mockResolvedValue([]),
      deleteNote: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [NoteList],
      providers: [
        provideRouter([]),
        { provide: NotesService, useValue: notesService },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(NoteList);
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Déclenche ngOnInit + laisse le chargement asynchrone se terminer, puis rafraîchit le DOM. */
  async function render(notes = SAMPLE): Promise<void> {
    notesService.getAllNotes.mockResolvedValue(notes);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function cards(): HTMLElement[] {
    return Array.from(el.querySelectorAll('.note-card'));
  }

  function cardTitles(): string[] {
    return Array.from(el.querySelectorAll('.note-title')).map((n) => n.textContent!.trim());
  }

  function type(term: string): void {
    const input = el.querySelector<HTMLInputElement>('.search-input')!;
    input.value = term;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Groupe 1 — Chargement initial
  // ---------------------------------------------------------------------------
  // --- Couleur d'accent ------------------------------------------------------
  describe('Couleur d’accent', () => {
    const cardStyle = (index: number) =>
      el.querySelectorAll<HTMLElement>('.note-card')[index].getAttribute('style') ?? '';

    it('utilise la couleur enregistrée sur la catégorie', async () => {
      await render([
        { id: '1', title: 'Courses', category: { id: 'cat-1', name: 'Maison', color: '#34C759' }, updatedAt: '2026-01-01' },
      ]);

      expect(cardStyle(0)).toContain('#34C759');
    });

    it('retombe sur une couleur dérivée du nom quand la catégorie n’a pas de couleur', async () => {
      await render([
        { id: '1', title: 'Courses', category: { id: 'cat-1', name: 'Maison', color: '' }, updatedAt: '2026-01-01' },
        { id: '2', title: 'Menus', category: { id: 'cat-1', name: 'Maison', color: '' }, updatedAt: '2026-01-02' },
      ]);

      expect(cardStyle(0)).not.toBe('');
      // Deux notes de la même catégorie partagent la même couleur dérivée.
      expect(cardStyle(0)).toBe(cardStyle(1));
    });
  });

  describe('Chargement initial', () => {
    it('T1.1 demande les notes à la source de données à l’ouverture', async () => {
      await render(SAMPLE);
      expect(notesService.getAllNotes).toHaveBeenCalledTimes(1);
    });

    it('T1.2 affiche une carte par note reçue', async () => {
      await render(SAMPLE);
      expect(cards().length).toBe(SAMPLE.length);
    });

    it('T1.3 affiche titre, catégorie et date sur chaque carte', async () => {
      await render([SAMPLE[0]]);
      const card = cards()[0];
      expect(card.querySelector('.note-title')?.textContent).toContain('Courses');
      expect(card.querySelector('.cat-pill')?.textContent).toContain('Maison');
      expect(card.querySelector('.note-date')?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 2 — État de chargement
  // ---------------------------------------------------------------------------
  describe('État de chargement', () => {
    it('T2.1 affiche un indicateur pendant l’attente des notes', () => {
      let resolve!: (v: unknown[]) => void;
      notesService.getAllNotes.mockReturnValue(new Promise((r) => (resolve = r)));

      fixture.detectChanges(); // déclenche ngOnInit ; la promesse n'est pas résolue
      expect(el.querySelector('.spinner')).toBeTruthy();

      resolve(SAMPLE); // nettoyage
    });

    it('T2.2 masque l’indicateur une fois les notes arrivées', async () => {
      await render(SAMPLE);
      expect(el.querySelector('.spinner')).toBeNull();
      expect(cards().length).toBe(SAMPLE.length);
    });

    it('T2.3 termine le chargement sans planter si la source échoue', async () => {
      notesService.getAllNotes.mockRejectedValue(new Error('boom'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el.querySelector('.spinner')).toBeNull();
      expect(cards().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Liste vide
  // ---------------------------------------------------------------------------
  describe('Liste vide', () => {
    it('T3.1 affiche un message quand il n’y a aucune note', async () => {
      await render([]);
      expect(el.querySelector('.empty')).toBeTruthy();
      expect(cards().length).toBe(0);
    });

    it('T3.2 affiche un message quand la recherche ne correspond à rien', async () => {
      await render(SAMPLE);
      type('zzzzz-introuvable');
      expect(cards().length).toBe(0);
      expect(el.querySelector('.empty')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Recherche / filtrage
  // ---------------------------------------------------------------------------
  describe('Recherche / filtrage', () => {
    it('T4.1 filtre par titre', async () => {
      await render(SAMPLE);
      type('cou');
      expect(cardTitles()).toEqual(['Courses']);
    });

    it('T4.2 filtre aussi par catégorie', async () => {
      await render(SAMPLE);
      type('voyage');
      expect(cardTitles()).toEqual(['Idées vacances']);
    });

    it('T4.3 est insensible à la casse et aux espaces', async () => {
      await render(SAMPLE);
      type('  COURSES  ');
      expect(cardTitles()).toEqual(['Courses']);
    });

    it('T4.4 réaffiche toutes les notes quand la recherche est vide', async () => {
      await render(SAMPLE);
      type('cou');
      expect(cards().length).toBe(1);
      type('');
      expect(cards().length).toBe(SAMPLE.length);
    });

    it('T4.5 filtre sans redemander les notes à la source', async () => {
      await render(SAMPLE);
      type('cou');
      expect(notesService.getAllNotes).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 5 — Création
  // ---------------------------------------------------------------------------
  describe('Création', () => {
    it('T5.1 navigue vers l’écran de création', async () => {
      await render(SAMPLE);
      el.querySelector<HTMLButtonElement>('.fab')!.click();
      expect(navigateSpy).toHaveBeenCalledWith(['/notes/new']);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 6 — Ouverture / édition
  // ---------------------------------------------------------------------------
  describe('Ouverture / édition', () => {
    it('T6.1 ouvre l’édition de la note choisie au clic sur la carte', async () => {
      await render(SAMPLE);
      cards()[1].click();
      // La carte entière est un lien (routerLink) → router.navigateByUrl(UrlTree).
      expect(navigateByUrlSpy).toHaveBeenCalledTimes(1);
      expect(navigateByUrlSpy.mock.calls[0][0].toString()).toBe('/notes/edit/2');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 — Suppression
  // ---------------------------------------------------------------------------
  describe('Suppression', () => {
    /** Clique la corbeille de la carte : ouvre la popup de confirmation. */
    function clickDelete(index: number): void {
      cards()[index].querySelector<HTMLButtonElement>('.btn-danger')!.click();
      fixture.detectChanges();
    }

    /** La popup de confirmation (null si fermée). */
    function confirmDialog(): HTMLElement | null {
      return el.querySelector('.confirm-backdrop');
    }

    /** Répond « Oui » dans la popup. */
    function answerYes(): void {
      el.querySelector<HTMLButtonElement>('.confirm-card .btn-confirm')!.click();
      fixture.detectChanges();
    }

    /** Répond « Non » dans la popup. */
    function answerNo(): void {
      el.querySelector<HTMLButtonElement>('.confirm-card .btn-cancel')!.click();
      fixture.detectChanges();
    }

    it('T7.1 ouvre une popup de confirmation ciblant la bonne note, sans rien supprimer', async () => {
      await render(SAMPLE);
      clickDelete(0);
      expect(confirmDialog()).toBeTruthy();
      expect(el.querySelector('.confirm-message')?.textContent).toContain('Courses');
      // Tant que l'utilisateur n'a pas répondu, aucune suppression n'est déclenchée.
      expect(notesService.deleteNote).not.toHaveBeenCalled();
    });

    it('T7.2 supprime la bonne note après confirmation (Oui)', async () => {
      await render(SAMPLE);
      clickDelete(0);
      answerYes();
      await fixture.whenStable();
      expect(notesService.deleteNote).toHaveBeenCalledWith('1');
    });

    it('T7.3 retire la note de la liste après suppression réussie', async () => {
      await render(SAMPLE);
      clickDelete(0);
      answerYes();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(cardTitles()).not.toContain('Courses');
      expect(cards().length).toBe(SAMPLE.length - 1);
    });

    it('T7.4 ne supprime rien et referme la popup si l’utilisateur annule (Non)', async () => {
      await render(SAMPLE);
      clickDelete(0);
      answerNo();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(notesService.deleteNote).not.toHaveBeenCalled();
      expect(cards().length).toBe(SAMPLE.length);
      expect(confirmDialog()).toBeNull();
    });

    it('T7.5 conserve la note affichée si la suppression échoue (pessimiste)', async () => {
      notesService.deleteNote.mockRejectedValue(new Error('échec'));
      await render(SAMPLE);
      clickDelete(0);
      answerYes();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(notesService.deleteNote).toHaveBeenCalledWith('1');
      expect(cardTitles()).toContain('Courses');
      expect(cards().length).toBe(SAMPLE.length);
    });

    it('T7.6 le bouton supprimer ne déclenche pas l’ouverture de la carte', async () => {
      await render(SAMPLE);
      clickDelete(0);
      expect(navigateByUrlSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 — Erreur de chargement (C4)
  // ---------------------------------------------------------------------------
  describe('Erreur de chargement', () => {
    /** Déclenche ngOnInit avec une source en échec, puis stabilise le DOM. */
    async function renderError(): Promise<void> {
      notesService.getAllNotes.mockRejectedValue(new Error('boom'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('T8.1 affiche un encart d’erreur quand le chargement échoue', async () => {
      await renderError();
      expect(el.querySelector('.error-state')).toBeTruthy();
      expect(el.querySelector('.spinner')).toBeNull();
      expect(cards().length).toBe(0);
    });

    it('T8.2 distingue l’erreur du cas « aucune note » (pas d’encart vide)', async () => {
      await renderError();
      // L'état d'erreur ne doit pas être confondu avec la liste vide normale.
      expect(el.querySelector('.notes-list')).toBeNull();
    });

    it('T8.3 « Réessayer » relance le chargement et affiche les notes récupérées', async () => {
      await renderError();
      // La source se rétablit avant la nouvelle tentative.
      notesService.getAllNotes.mockResolvedValue(SAMPLE);
      el.querySelector<HTMLButtonElement>('.btn-retry')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(notesService.getAllNotes).toHaveBeenCalledTimes(2);
      expect(el.querySelector('.error-state')).toBeNull();
      expect(cards().length).toBe(SAMPLE.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 9 — Messages d’absence distincts (C5)
  // ---------------------------------------------------------------------------
  describe('Messages d’absence de notes', () => {
    function emptyText(): string {
      return el.querySelector('.empty p')?.textContent?.toLowerCase() ?? '';
    }

    it('T9.1 base vide : message « aucune note pour l’instant » (invite à créer)', async () => {
      await render([]);
      expect(el.querySelector('.empty')).toBeTruthy();
      expect(emptyText()).toContain("pour l'instant");
    });

    it('T9.2 recherche infructueuse : message ciblant la recherche', async () => {
      await render(SAMPLE);
      type('zzzzz-introuvable');
      expect(el.querySelector('.empty')).toBeTruthy();
      expect(emptyText()).toContain('recherche');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 12 — Intégration de la barre de navigation (NAVBAR, lot B)
  // ---------------------------------------------------------------------------
  /**
   * Group 12 of `.agent/NAVBAR/PLAN_TESTS_NAVBAR.md` (couples P17 to P22, decision D2).
   *
   * Numbered 12 so that its titles never collide with the existing T1 to T9 of this file. Only
   * T12.3 restores the real router (the `navigateByUrl` spy of the shared `beforeEach` is lifted
   * for that case alone); the other cases keep the spy and never reach a real URL.
   *
   * DOM contract: `nav[aria-label="Navigation principale"]` is the bar, `nav .navbar-tab` one tab,
   * `[aria-current="page"]` inside the bar the active tab, `.fab` the "+" that stays outside the bar.
   */
  describe('Intégration de la barre de navigation', () => {
    const NAVBAR_SELECTOR: string = 'nav[aria-label="Navigation principale"]';

    /** Returns every navigation bar found in the list's DOM. */
    function navigationBars(): HTMLElement[] {
      return Array.from(el.querySelectorAll<HTMLElement>(NAVBAR_SELECTOR));
    }

    /** Returns the labels of the tabs of the bar, in display order. */
    function tabLabels(): string[] {
      const tabElements: HTMLElement[] = Array.from(el.querySelectorAll<HTMLElement>(`${NAVBAR_SELECTOR} .navbar-tab`));
      return tabElements.map((tab: HTMLElement): string => (tab.textContent ?? '').trim());
    }

    it('T12.1 la liste affiche une seule barre, aux trois onglets', async () => {
      await render(SAMPLE);

      const bars: HTMLElement[] = navigationBars();
      const labels: string[] = tabLabels();

      expect(bars.length).toBe(1);
      expect(labels).toEqual(['Notes', 'Kanbans', 'Calendrier']);
    });

    it('T12.2 le « + » est hors de la barre ; la barre n’a aucun contrôle de création', async () => {
      await render(SAMPLE);

      const bar: HTMLElement = navigationBars()[0];
      const addButton: HTMLElement | null = el.querySelector<HTMLElement>('.fab');
      const creationControlsInBar: NodeListOf<HTMLElement> = bar.querySelectorAll<HTMLElement>('.fab, [aria-label*="Nouvelle"]');

      expect(addButton).not.toBeNull();
      expect(bar.contains(addButton)).toBe(false);
      expect(creationControlsInBar.length).toBe(0);
    });

    it('T12.3 sur la vraie route /notes, Notes est l’onglet actif', async () => {
      const router: Router = TestBed.inject(Router);
      navigateByUrlSpy.mockRestore();
      router.resetConfig([
        { path: 'notes', component: EmptyRoute },
        { path: 'kanban', component: EmptyRoute },
      ]);
      await render(SAMPLE);

      await router.navigateByUrl('/notes');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const activeTabs: HTMLElement[] = Array.from(el.querySelectorAll<HTMLElement>(`${NAVBAR_SELECTOR} [aria-current="page"]`));
      const activeLabels: string[] = activeTabs.map((tab: HTMLElement): string => (tab.textContent ?? '').trim());

      expect(activeLabels).toEqual(['Notes']);
    });

    it('T12.4 la barre est présente pendant le chargement', async () => {
      const neverResolvingLoad: Promise<typeof SAMPLE> = new Promise<typeof SAMPLE>((): void => undefined);
      notesService.getAllNotes.mockReturnValue(neverResolvingLoad);
      fixture.detectChanges();

      const spinner: Element | null = el.querySelector('.spinner');
      const bars: HTMLElement[] = navigationBars();

      expect(spinner).not.toBeNull();
      expect(bars.length).toBe(1);
      expect(tabLabels()).toEqual(['Notes', 'Kanbans', 'Calendrier']);
    });

    it('T12.5 la barre est présente quand la liste est vide', async () => {
      await render([]);

      const emptyState: Element | null = el.querySelector('.empty');
      const bars: HTMLElement[] = navigationBars();

      expect(emptyState).not.toBeNull();
      expect(bars.length).toBe(1);
      expect(tabLabels()).toEqual(['Notes', 'Kanbans', 'Calendrier']);
    });

    it('T12.6 la barre est présente quand le chargement a échoué', async () => {
      notesService.getAllNotes.mockRejectedValue(new Error('boom'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const errorState: Element | null = el.querySelector('.error-state');
      const bars: HTMLElement[] = navigationBars();

      expect(errorState).not.toBeNull();
      expect(bars.length).toBe(1);
      expect(tabLabels()).toEqual(['Notes', 'Kanbans', 'Calendrier']);
    });
  });
});
