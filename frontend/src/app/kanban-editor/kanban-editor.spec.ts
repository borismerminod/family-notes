import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { KanbanEditor } from './kanban-editor';
import { KanbanService } from '../core/services/kanban-service';
import { Kanban } from '../core/models';

/**
 * @file kanban-editor.spec.ts
 * @description Black-box TDD tests for the kanban board editor screen.
 *
 * Expected behaviour: `.agent/KANBAN/EDITION/PLAN_TESTS_KANBAN_EDITION.md`, part B (groups 2 to
 * 10). The selectors used here are the ones of the plan's DOM contract (§7), taken from
 * `MAQUETTE_KANBAN_EDITOR.html`: the component template must honour them (decision `D1`).
 *
 * The screen is tested in isolation: its data source (`KanbanService`) is a test double,
 * navigation is spied on, the route identifier comes from a stubbed `ActivatedRoute` whose
 * snapshot is read once (`D8`), and `ConfirmDialog` stays real, driven through the DOM.
 */

/** The board the data source returns in edit mode. */
const EXISTING_KANBAN: Kanban = {
  id: 'k-maison',
  name: 'Travaux de la maison',
  updatedAt: '2026-09-28T18:30:00.000Z',
};

/**
 * Hint carried by the name field while it is empty (`D2`). It is only a hint: an empty name falls
 * back to 'Sans titre' when saving (`D-E2`), never while typing.
 */
const NAME_PLACEHOLDER = 'Sans titre';

/** Screen title shown when no identifier comes from the route, i.e. a brand new board (`D2`). */
const CREATION_SCREEN_TITLE = 'Nouveau tableau';

/** Screen title shown when the route carries an identifier, i.e. an existing board (`D2`). */
const EDITION_SCREEN_TITLE = 'Modifier le tableau';

/** The only exit of this screen: the board list (`D-E1`). */
const KANBAN_LIST_ROUTE = '/kanban';

/**
 * Message shown when the route carries an identifier no board matches (`D-E4`, revised on
 * 2026-10-11): the screen says so and lets the user leave, rather than navigating away by itself,
 * a silent redirection having read as a bug.
 */
const BOARD_NOT_FOUND_MESSAGE = 'Tableau introuvable.';

/** Message shown when the board could not be read at all, as opposed to not existing (`D2`). */
const LOAD_FAILED_MESSAGE = 'Impossible de charger ce tableau.';

describe("KanbanEditor (écran d'édition d'un tableau)", () => {
  let fixture: ComponentFixture<KanbanEditor>;
  let el: HTMLElement;
  let kanbanService: {
    getKanbanById: ReturnType<typeof vi.fn>;
    createKanban: ReturnType<typeof vi.fn>;
    renameKanban: ReturnType<typeof vi.fn>;
    getAllKanbans: ReturnType<typeof vi.fn>;
    deleteKanban: ReturnType<typeof vi.fn>;
  };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Mounts the screen in the mode the route asks for.
   *
   * The service double also exposes `getAllKanbans` and `deleteKanban`, which this screen never
   * calls: exposing them makes a stray call visible instead of letting it throw.
   * @param options.id The identifier carried by the route; absent means creation mode.
   * @param options.getKanbanById The single-read double, for cases expecting a specific answer
   * (missing board, read failure, deferred answer).
   */
  async function setup(
    options: { id?: string; getKanbanById?: ReturnType<typeof vi.fn> } = {},
  ): Promise<void> {
    const readKanban = options.getKanbanById ?? vi.fn().mockResolvedValue(EXISTING_KANBAN);
    kanbanService = {
      getKanbanById: readKanban,
      createKanban: vi.fn().mockResolvedValue(EXISTING_KANBAN),
      renameKanban: vi.fn().mockResolvedValue(EXISTING_KANBAN),
      getAllKanbans: vi.fn().mockResolvedValue([]),
      deleteKanban: vi.fn().mockResolvedValue(undefined),
    };

    const routeParams = options.id === undefined ? {} : { id: options.id };
    const activatedRouteStub = { snapshot: { paramMap: convertToParamMap(routeParams) } };

    await TestBed.configureTestingModule({
      imports: [KanbanEditor],
      providers: [
        provideRouter([]),
        { provide: KanbanService, useValue: kanbanService },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(KanbanEditor);
    el = fixture.nativeElement as HTMLElement;
  }

  /** Triggers the first render, lets the data source answer, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Tells whether an element is currently on screen.
   * @param selector The CSS selector looked up in the screen template.
   * @returns True when at least one element matches.
   */
  function isShown(selector: string): boolean {
    const found = el.querySelector(selector);
    return found !== null;
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space. Lets a label be checked
   * without freezing the icon, line break or indentation the template puts around it.
   * @param selector The CSS selector looked up in the screen template.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found = el.querySelector(selector);
    const raw = found?.textContent ?? '';
    return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Clicks an element of the screen, then waits for the screen to finish updating.
   * @param selector The CSS selector of the element to click.
   * @throws When no element matches, which would signal an unexpected template.
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

  /**
   * Gives the addresses the screen asked the router to go to. What matters is the screen reached,
   * not the way of reaching it; this screen navigates from code only, so the spied `navigate` is
   * the single source — unlike the board list, which also navigates through template links.
   * @returns The requested addresses, in call order.
   */
  function navigations(): string[] {
    return navigateSpy.mock.calls.map((call: unknown[]) => (call[0] as unknown[]).join('/'));
  }

  /**
   * Counts the writes asked of the data source, whatever the operation. The plan's 'no write'
   * effect covers creation and renaming; deletion is counted too, so that a stray call this
   * screen should never make shows up here rather than passing unnoticed.
   * @returns The number of write calls the double received.
   */
  function writeCalls(): number {
    const created = kanbanService.createKanban.mock.calls.length;
    const renamed = kanbanService.renameKanban.mock.calls.length;
    const deleted = kanbanService.deleteKanban.mock.calls.length;
    return created + renamed + deleted;
  }

  /**
   * Gives the board name input.
   * @returns The input, or `null` when the screen does not show it (loading, load error).
   */
  function nameInput(): HTMLInputElement | null {
    return el.querySelector<HTMLInputElement>('.editor-name');
  }

  // ---------------------------------------------------------------------------
  // Groupe 2 — Ouverture d'un tableau neuf (`/kanban/new`)
  // ---------------------------------------------------------------------------
  describe("Ouverture d'un tableau neuf", () => {
    it('T2.1 affiche un champ de nom vide portant « Sans titre » en simple indication', async () => {
      await setup();
      await render();

      const field = nameInput();
      expect(field).not.toBeNull();

      const displayedValue = field?.value;
      const displayedPlaceholder = field?.placeholder;

      expect(displayedValue).toBe('');
      expect(displayedPlaceholder).toBe(NAME_PLACEHOLDER);
    });

    it("T2.2 ne demande aucune lecture à la source de données : il n'y a rien à charger", async () => {
      await setup();
      await render();

      expect(kanbanService.getKanbanById).not.toHaveBeenCalled();
    });

    it("T2.3 n'affiche aucun indicateur de chargement : un tableau neuf n'attend rien de la base", async () => {
      await setup();

      fixture.detectChanges();
      const overlayWhileOpening = isShown('.loading-overlay');
      const spinnerWhileOpening = isShown('.spinner');

      await fixture.whenStable();
      fixture.detectChanges();
      const overlayOnceOpen = isShown('.loading-overlay');
      const spinnerOnceOpen = isShown('.spinner');

      expect(overlayWhileOpening).toBe(false);
      expect(spinnerWhileOpening).toBe(false);
      expect(overlayOnceOpen).toBe(false);
      expect(spinnerOnceOpen).toBe(false);
    });

    it("T2.4 affiche « Nouveau tableau » comme titre de l'écran", async () => {
      await setup();
      await render();

      const displayedTitle = normalizedTextOf('.editor-navbar-title');

      expect(displayedTitle).toBe(CREATION_SCREEN_TITLE);
    });

    it("T2.5 n'écrit rien à l'ouverture : en repartir ne laisse aucun tableau fantôme dans la liste", async () => {
      await setup();
      await render();

      const writesOnOpening = writeCalls();

      expect(writesOnOpening).toBe(0);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Ouverture d'un tableau existant (`/kanban/edit/:id`)
  // ---------------------------------------------------------------------------
  describe("Ouverture d'un tableau existant", () => {
    it('T3.1 demande le tableau de la route une seule fois, sur son identifiant', async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      expect(kanbanService.getKanbanById).toHaveBeenCalledTimes(1);
      expect(kanbanService.getKanbanById).toHaveBeenCalledWith(EXISTING_KANBAN.id);
    });

    it('T3.2 pré-remplit le champ de nom avec le nom du tableau', async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const field = nameInput();
      expect(field).not.toBeNull();

      const displayedValue = field?.value;

      expect(displayedValue).toBe(EXISTING_KANBAN.name);
    });

    it("T3.3 affiche « Modifier le tableau » comme titre de l'écran", async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const displayedTitle = normalizedTextOf('.editor-navbar-title');

      expect(displayedTitle).toBe(EDITION_SCREEN_TITLE);
    });

    it("T3.4 affiche un indicateur de chargement tant que la source n'a pas répondu, puis le retire", async () => {
      let respond!: (kanban: Kanban) => void;
      const pendingRead = new Promise<Kanban>((resolve) => {
        respond = resolve;
      });
      const deferredRead = vi.fn().mockReturnValue(pendingRead);

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: deferredRead });

      fixture.detectChanges();
      const overlayWhileLoading = isShown('.loading-overlay');
      const spinnerWhileLoading = isShown('.spinner');

      respond(EXISTING_KANBAN);
      await fixture.whenStable();
      fixture.detectChanges();

      const overlayOnceLoaded = isShown('.loading-overlay');
      const spinnerOnceLoaded = isShown('.spinner');
      const fieldOnceLoaded = nameInput();

      expect(overlayWhileLoading).toBe(true);
      expect(spinnerWhileLoading).toBe(true);
      expect(overlayOnceLoaded).toBe(false);
      expect(spinnerOnceLoaded).toBe(false);
      expect(fieldOnceLoaded).not.toBeNull();
    });

    it("T3.5 n'écrit rien à l'ouverture d'un tableau existant", async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const writesOnOpening = writeCalls();

      expect(writesOnOpening).toBe(0);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Identifiant inexistant et erreur de chargement
  // ---------------------------------------------------------------------------
  describe('Identifiant inexistant et erreur de chargement', () => {
    it("T4.1 affiche « Tableau introuvable. » et un bouton de retour quand aucun tableau ne porte l'identifiant de la route, sans navigation spontanée", async () => {
      const missingBoard = vi.fn().mockResolvedValue(null);

      await setup({ id: 'k-disparu', getKanbanById: missingBoard });
      await render();

      const notFoundShown = isShown('.not-found');
      const notFoundText = normalizedTextOf('.not-found');
      const backToListShown = isShown('.not-found .btn-back-to-list');
      const requestedNavigations = navigations();
      const loadErrorShown = isShown('.error-state');
      const confirmPopupShown = isShown('.confirm-backdrop');
      const fieldShown = isShown('.editor-name');
      const saveShown = isShown('.btn-save');

      expect(notFoundShown).toBe(true);
      expect(notFoundText).toContain(BOARD_NOT_FOUND_MESSAGE);
      expect(backToListShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
      expect(loadErrorShown).toBe(false);
      expect(confirmPopupShown).toBe(false);
      expect(fieldShown).toBe(false);
      expect(saveShown).toBe(false);
    });

    it("T4.1b ramène à la liste quand on touche « Revenir à la liste » depuis l'état « introuvable »", async () => {
      const missingBoard = vi.fn().mockResolvedValue(null);

      await setup({ id: 'k-disparu', getKanbanById: missingBoard });
      await render();

      const navigationsBeforeClick = navigations();

      await clickOn('.not-found .btn-back-to-list');

      const navigationsAfterClick = navigations();

      expect(navigationsBeforeClick).toEqual([]);
      expect(navigationsAfterClick).toEqual([KANBAN_LIST_ROUTE]);
    });

    it("T4.2 affiche « Impossible de charger ce tableau. » quand la lecture échoue, retire l'indicateur de chargement et n'affiche ni champ de nom ni « Enregistrer »", async () => {
      const failingRead = vi.fn().mockRejectedValue(new Error('Base indisponible'));

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: failingRead });
      await render();

      const loadErrorShown = isShown('.error-state');
      const loadErrorText = normalizedTextOf('.error-state');
      const overlayShown = isShown('.loading-overlay');
      const spinnerShown = isShown('.spinner');
      const fieldShown = isShown('.editor-name');
      const saveShown = isShown('.btn-save');
      const navbarShown = isShown('.editor-navbar');
      const notFoundShown = isShown('.not-found');

      expect(loadErrorShown).toBe(true);
      expect(loadErrorText).toContain(LOAD_FAILED_MESSAGE);
      expect(overlayShown).toBe(false);
      expect(spinnerShown).toBe(false);
      expect(fieldShown).toBe(false);
      expect(saveShown).toBe(false);
      expect(navbarShown).toBe(true);
      expect(notFoundShown).toBe(false);
    });

    it("T4.3 ramène à la liste quand on touche « Revenir à la liste » depuis l'erreur de chargement, sans popup de confirmation", async () => {
      const failingRead = vi.fn().mockRejectedValue(new Error('Base indisponible'));

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: failingRead });
      await render();

      const navigationsBeforeClick = navigations();

      await clickOn('.error-state .btn-back-to-list');

      const navigationsAfterClick = navigations();
      const confirmPopupShown = isShown('.confirm-backdrop');

      expect(navigationsBeforeClick).toEqual([]);
      expect(navigationsAfterClick).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T4.4 relance la lecture du tableau sur « Réessayer » : la source rétablie, le champ se remplit et le message d’erreur disparaît', async () => {
      const recoveringRead = vi
        .fn()
        .mockRejectedValueOnce(new Error('Base indisponible'))
        .mockResolvedValue(EXISTING_KANBAN);

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: recoveringRead });
      await render();

      const loadErrorBeforeRetry = isShown('.error-state');
      const readIdentifiersBeforeRetry = recoveringRead.mock.calls.map(
        (call: unknown[]) => call[0],
      );

      await clickOn('.error-state .btn-retry');

      const loadErrorAfterRetry = isShown('.error-state');
      const field = nameInput();
      const displayedValue = field?.value;
      const readIdentifiersAfterRetry = recoveringRead.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      const requestedNavigations = navigations();

      expect(loadErrorBeforeRetry).toBe(true);
      expect(readIdentifiersBeforeRetry).toEqual([EXISTING_KANBAN.id]);
      expect(loadErrorAfterRetry).toBe(false);
      expect(displayedValue).toBe(EXISTING_KANBAN.name);
      expect(readIdentifiersAfterRetry).toEqual([EXISTING_KANBAN.id, EXISTING_KANBAN.id]);
      expect(requestedNavigations).toEqual([]);
    });

    it("T4.5 n'écrit rien depuis l'état d'erreur de chargement, pas même en réessayant", async () => {
      const failingRead = vi.fn().mockRejectedValue(new Error('Base indisponible'));

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: failingRead });
      await render();

      const writesInErrorState = writeCalls();
      const saveShown = isShown('.btn-save');

      await clickOn('.error-state .btn-retry');

      const writesAfterRetry = writeCalls();
      const stillInErrorState = isShown('.error-state');

      expect(writesInErrorState).toBe(0);
      expect(saveShown).toBe(false);
      expect(writesAfterRetry).toBe(0);
      expect(stillInErrorState).toBe(true);
    });
  });
});
