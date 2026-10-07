import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { KanbanList } from './kanban-list';
import { KanbanService } from '../core/services/kanban-service';
import { Kanban } from '../core/models';

/**
 * Tests de la page « Mes Kanbans » (approche TDD / boîte noire).
 *
 * Comportement attendu : `.agent/KANBAN/CRUD/PLAN_TESTS_KANBAN_CRUD.md`, partie B (groupes 6 à 11).
 * Les sélecteurs ciblés suivent le gabarit de la page (`.kanban-card`, `.kanban-name`, …), et non
 * les noms de `MAQUETTE_KANBAN_LIST.html`, le plan de test ne figeant pas de contrat DOM.
 *
 * La page est testée en isolation : sa source de données (KanbanService) est une doublure, et les
 * interactions passent par le DOM.
 */

/**
 * Jeu de données de référence : du plus récemment modifié au plus ancien, comme la source les
 * fournit. Les noms sont volontairement ni dans l'ordre alphabétique ni dans son inverse, pour
 * qu'un tri parasite de la page fasse échouer T6.5.
 */
const SAMPLE: Kanban[] = [
  { id: 'k-recent', name: "Vacances d'été", updatedAt: '2026-09-28T18:30:00.000Z' },
  { id: 'k-middle', name: 'Courses de la semaine', updatedAt: '2026-09-25T11:00:00.000Z' },
  { id: 'k-oldest', name: 'Travaux de la maison', updatedAt: '2026-08-30T10:05:00.000Z' },
];

/**
 * Les deux phrases du message affiché quand aucun tableau n'existe. Elles sont vérifiées
 * séparément : le gabarit est libre de les séparer par un `<br>`, comme la maquette, ce qui ne
 * laisse aucune espace entre elles dans le texte du DOM.
 */
const EMPTY_LIST_MESSAGE = "Aucun tableau pour l'instant.";
const EMPTY_LIST_CALL_TO_ACTION = 'Touchez « + » pour en créer un.';

describe('KanbanList (page « Mes Kanbans »)', () => {
  let fixture: ComponentFixture<KanbanList>;
  let el: HTMLElement;
  let kanbanService: {
    getAllKanbans: ReturnType<typeof vi.fn>;
    createKanban: ReturnType<typeof vi.fn>;
  };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    kanbanService = {
      getAllKanbans: vi.fn().mockResolvedValue([]),
      createKanban: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [KanbanList],
      providers: [provideRouter([]), { provide: KanbanService, useValue: kanbanService }],
    }).compileComponents();

    const router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(KanbanList);
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Déclenche le chargement initial de la page avec les tableaux donnés, attend la réponse de la
   * source, puis rafraîchit le DOM.
   * @param kanbans Les tableaux renvoyés par la source de données.
   */
  async function render(kanbans: Kanban[] = SAMPLE): Promise<void> {
    kanbanService.getAllKanbans.mockResolvedValue(kanbans);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Indique si un élément est présent à l'écran.
   * @param selector Le sélecteur CSS cherché dans le gabarit de la page.
   * @returns Vrai si au moins un élément correspond.
   */
  function isShown(selector: string): boolean {
    const found = el.querySelector(selector);
    return found !== null;
  }

  /**
   * Lit le texte d'un élément de la page.
   * @param selector Le sélecteur CSS cherché dans le gabarit de la page.
   * @returns Le texte, espaces de bord retirés, ou une chaîne vide si l'élément est absent.
   */
  function textOf(selector: string): string {
    const found = el.querySelector(selector);
    return found?.textContent?.trim() ?? '';
  }

  /**
   * Lit le texte d'un élément en neutralisant la mise en forme : espaces insécables ramenés à des
   * espaces ordinaires, suites d'espaces et retours à la ligne réduits à un seul espace. Permet de
   * vérifier un libellé sans figer la façon dont le gabarit le découpe (icône, `<br>`, indentation).
   * @param selector Le sélecteur CSS cherché dans le gabarit de la page.
   * @returns Le texte normalisé, espaces de bord retirés, ou une chaîne vide si l'élément est absent.
   */
  function normalizedTextOf(selector: string): string {
    const found = el.querySelector(selector);
    const raw = found?.textContent ?? '';
    return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Clique sur un élément de la page, puis attend que l'écran ait fini de se mettre à jour.
   * @param selector Le sélecteur CSS de l'élément à cliquer.
   * @throws Quand aucun élément ne correspond, ce qui signalerait un gabarit inattendu.
   */
  async function clickOn(selector: string): Promise<void> {
    const target = el.querySelector<HTMLElement>(selector);
    if (target === null) {
      throw new Error(`Aucun élément « ${selector} » à cliquer.`);
    }
    target.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** @returns Les cartes de tableau affichées, dans l'ordre du DOM. */
  function cards(): HTMLElement[] {
    const found = el.querySelectorAll<HTMLElement>('.kanban-card');
    return Array.from(found);
  }

  /** @returns Les noms affichés sur les cartes, dans l'ordre du DOM. */
  function cardNames(): string[] {
    const found = el.querySelectorAll('.kanban-name');
    return Array.from(found).map((name) => name.textContent!.trim());
  }

  /**
   * Lit la date affichée sur une carte.
   * @param card La carte de tableau à inspecter.
   * @returns Le texte de la date, espaces de bord retirés, ou une chaîne vide si elle est absente.
   */
  function dateOf(card: HTMLElement): string {
    const dateElement = card.querySelector('.kanban-date');
    return dateElement?.textContent?.trim() ?? '';
  }

  // ---------------------------------------------------------------------------
  // Groupe 6 — Chargement et affichage
  // ---------------------------------------------------------------------------
  describe('Chargement et affichage', () => {
    it('T6.1 demande les tableaux une seule fois à la source de données à l’ouverture', async () => {
      await render(SAMPLE);

      expect(kanbanService.getAllKanbans).toHaveBeenCalledTimes(1);
    });

    it('T6.2 affiche un indicateur de chargement tant que la réponse n’est pas arrivée, puis le masque', async () => {
      let respond!: (kanbans: Kanban[]) => void;
      const pendingResponse = new Promise<Kanban[]>((resolve) => {
        respond = resolve;
      });
      kanbanService.getAllKanbans.mockReturnValue(pendingResponse);

      fixture.detectChanges();
      const spinnerWhileLoading = isShown('.spinner');
      expect(spinnerWhileLoading).toBe(true);

      respond(SAMPLE);
      await fixture.whenStable();
      fixture.detectChanges();

      const spinnerAfterResponse = isShown('.spinner');
      expect(spinnerAfterResponse).toBe(false);
    });

    it('T6.3 affiche une carte par tableau, avec son nom et une date non vide', async () => {
      await render(SAMPLE);

      const displayedCards = cards();
      const displayedNames = cardNames().sort();
      const expectedNames = SAMPLE.map((kanban) => kanban.name).sort();

      expect(displayedCards.length).toBe(SAMPLE.length);
      expect(displayedNames).toEqual(expectedNames);

      for (const card of displayedCards) {
        const dateText = dateOf(card);
        expect(dateText.length).toBeGreaterThan(0);
      }
    });

    it('T6.4 affiche le titre « Mes Kanbans » et le nombre de tableaux', async () => {
      await render(SAMPLE);

      const titleText = textOf('.topbar h1');
      const countText = textOf('.count');

      expect(titleText).toBe('Mes Kanbans');
      expect(countText).toContain(String(SAMPLE.length));
    });
    it('T6.5 affiche les cartes dans l’ordre fourni par la source, du plus récent au plus ancien', async () => {
      await render(SAMPLE);

      const displayedNames = cardNames();
      const expectedNames = SAMPLE.map((kanban) => kanban.name);

      expect(displayedNames).toEqual(expectedNames);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 — Liste vide et erreur de chargement
  // ---------------------------------------------------------------------------
  describe('Liste vide et erreur de chargement', () => {
    /**
     * Déclenche le chargement initial avec une source de données en échec, attend son rejet, puis
     * rafraîchit le DOM.
     */
    async function renderError(): Promise<void> {
      kanbanService.getAllKanbans.mockRejectedValue(new Error('source indisponible'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('T7.1 affiche le message d’invitation et aucune carte quand il n’y a aucun tableau', async () => {
      await render([]);

      const emptyShown = isShown('.empty');
      const emptyMessage = normalizedTextOf('.empty');
      const displayedCards = cards();

      expect(emptyShown).toBe(true);
      expect(emptyMessage).toContain(EMPTY_LIST_MESSAGE);
      expect(emptyMessage).toContain(EMPTY_LIST_CALL_TO_ACTION);
      expect(displayedCards.length).toBe(0);
    });

    it('T7.2 affiche une erreur et « Réessayer » quand le chargement échoue, sans chargement, liste ni message vide', async () => {
      await renderError();

      const errorShown = isShown('.error-state');
      const errorMessage = normalizedTextOf('.error-state p');
      const retryLabel = textOf('.btn-retry');
      const spinnerShown = isShown('.spinner');
      const listShown = isShown('.kanbans-list');
      const displayedCards = cards();
      const pageText = normalizedTextOf('.kanban-list-container');

      expect(errorShown).toBe(true);
      expect(errorMessage.length).toBeGreaterThan(0);
      expect(retryLabel).toBe('Réessayer');
      expect(spinnerShown).toBe(false);
      expect(listShown).toBe(false);
      expect(displayedCards.length).toBe(0);
      expect(pageText).not.toContain(EMPTY_LIST_MESSAGE);
    });

    it('T7.3 relance le chargement au clic sur « Réessayer » et affiche la liste une fois la source rétablie', async () => {
      await renderError();
      kanbanService.getAllKanbans.mockResolvedValue(SAMPLE);

      await clickOn('.btn-retry');

      const loadAttempts = kanbanService.getAllKanbans.mock.calls.length;
      const errorShown = isShown('.error-state');
      const displayedNames = cardNames();
      const expectedNames = SAMPLE.map((kanban) => kanban.name);

      expect(loadAttempts).toBe(2);
      expect(errorShown).toBe(false);
      expect(displayedNames).toEqual(expectedNames);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 — Création
  // ---------------------------------------------------------------------------
  describe('Création', () => {
    it('T8.1 navigue vers l’édition d’un nouveau tableau au clic sur « + », sans rien écrire en base', async () => {
      await render();

      await clickOn('.fab');

      const navigations = navigateSpy.mock.calls;
      const createCalls = kanbanService.createKanban.mock.calls;

      expect(navigations.length).toBe(1);
      expect(navigations[0][0]).toEqual(['/kanban/new']);
      expect(createCalls.length).toBe(0);
    });
  });
});
