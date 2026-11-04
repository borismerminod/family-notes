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

/**
 * Name a board is stored under when the field is left empty, or holds nothing but spaces
 * (`D-E2`). It reads the same as the field hint on purpose, but it is a different thing: the hint
 * is never sent anywhere, whereas this name is what reaches the data source. An empty name is
 * therefore never refused by this screen, it is replaced — the service's own refusal staying a
 * safety net this screen never trips (`D-E10`).
 */
const FALLBACK_SAVED_NAME = 'Sans titre';

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

/**
 * Message of the banner shown when the save was refused (`D2`, `D-E9`). The screen must show it,
 * not merely log it: a message left in the console alone never reaches the user.
 */
const SAVE_FAILED_MESSAGE = "Impossible d'enregistrer le tableau.";

/** Warning of the popup shown when leaving would lose the typed name (`D2`). */
const DISCARD_CHANGES_MESSAGE = 'Vos modifications ne seront pas enregistrées. Quitter ce tableau ?';

/** Label of the popup button that leaves the screen anyway (`D2`). */
const DISCARD_CONFIRM_LABEL = 'Quitter';

/** Label of the popup button that keeps the user on the screen (`D2`). */
const DISCARD_CANCEL_LABEL = 'Annuler';

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
   * Presses the Escape key the way the user would, on the document itself: the confirmation popup
   * listens for it through a host listener, not through any element of this screen.
   */
  async function pressEscape(): Promise<void> {
    const escapeKeyDown = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeKeyDown);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Types a board name the way the user would, through the name field, then lets the screen
   * update. Going through the field rather than the component signal keeps the test black-box:
   * the binding is part of what is being checked.
   * @param name The name to type.
   * @throws When the name field is not on screen, which would signal an unexpected state.
   */
  async function typeName(name: string): Promise<void> {
    const field = nameInput();
    if (field === null) {
      throw new Error('Aucun champ de nom à remplir.');
    }
    field.value = name;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Gives the children of the board content area that are not the placeholders announcing the
   * lists to come. The lists and the cards do not exist yet, so emptiness is checked by what the
   * area really holds rather than by selectors this batch would have to invent — and the check
   * starts to bite as soon as the next batch plugs a first real child in.
   * @returns The unexpected children, empty as long as the area holds its placeholders only.
   */
  function boardCanvasChildrenBesidesPlaceholders(): Element[] {
    const canvas = el.querySelector<HTMLElement>('.board-canvas');
    const canvasChildren = canvas === null ? [] : Array.from(canvas.children);
    return canvasChildren.filter((child) => !child.classList.contains('ghost-column'));
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

  // ---------------------------------------------------------------------------
  // Groupe 5 — Enregistrement d'un tableau neuf
  // ---------------------------------------------------------------------------
  describe("Enregistrement d'un tableau neuf", () => {
    it('T5.1 demande la création avec le nom saisi sans ses espaces de début et de fin, les espaces intérieurs conservés', async () => {
      const typedName = '   Anniversaire de   Léa  ';
      const expectedStoredName = 'Anniversaire de   Léa';

      await setup();
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      expect(kanbanService.createKanban).toHaveBeenCalledTimes(1);
      expect(kanbanService.createKanban).toHaveBeenCalledWith(expectedStoredName);
    });

    it('T5.2 crée le tableau sous le nom « Sans titre » quand le champ est laissé vide', async () => {
      await setup();
      await render();

      const fieldBeforeSave = nameInput();
      const valueBeforeSave = fieldBeforeSave?.value;

      await clickOn('.btn-save');

      expect(valueBeforeSave).toBe('');
      expect(kanbanService.createKanban).toHaveBeenCalledTimes(1);
      expect(kanbanService.createKanban).toHaveBeenCalledWith(FALLBACK_SAVED_NAME);
    });

    it("T5.3 crée le tableau sous le nom « Sans titre » quand le nom saisi n'est fait que d'espaces", async () => {
      const spacesOnlyName = '    ';

      await setup();
      await render();
      await typeName(spacesOnlyName);

      const fieldBeforeSave = nameInput();
      const valueBeforeSave = fieldBeforeSave?.value;

      await clickOn('.btn-save');

      expect(valueBeforeSave).toBe(spacesOnlyName);
      expect(kanbanService.createKanban).toHaveBeenCalledTimes(1);
      expect(kanbanService.createKanban).toHaveBeenCalledWith(FALLBACK_SAVED_NAME);
    });

    it('T5.4 ne demande aucun renommage en mode création : la création est la seule écriture', async () => {
      const typedName = 'Anniversaire de Léa';

      await setup();
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const writesOnSave = writeCalls();

      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
      expect(kanbanService.createKanban).toHaveBeenCalledTimes(1);
      expect(writesOnSave).toBe(1);
    });

    it('T5.5 ramène à la liste après une création réussie', async () => {
      const typedName = 'Anniversaire de Léa';

      await setup();
      await render();
      await typeName(typedName);

      const navigationsBeforeSave = navigations();

      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      expect(navigationsBeforeSave).toEqual([]);
      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 6 — Enregistrement d'un tableau existant
  // ---------------------------------------------------------------------------
  describe("Enregistrement d'un tableau existant", () => {
    it("T6.1 demande le renommage sur l'identifiant de la route, avec le nom nettoyé", async () => {
      const routeIdentifier = 'k-de-la-route';
      const boardCarryingAnotherIdentifier: Kanban = {
        ...EXISTING_KANBAN,
        id: 'k-de-la-source',
      };
      const readBoard = vi.fn().mockResolvedValue(boardCarryingAnotherIdentifier);
      const typedName = '  Travaux du   garage  ';
      const expectedStoredName = 'Travaux du   garage';

      await setup({ id: routeIdentifier, getKanbanById: readBoard });
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      expect(kanbanService.renameKanban).toHaveBeenCalledTimes(1);
      expect(kanbanService.renameKanban).toHaveBeenCalledWith(routeIdentifier, expectedStoredName);
    });

    it('T6.2 ne demande aucune création en mode édition : le renommage est la seule écriture', async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const writesOnSave = writeCalls();

      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).toHaveBeenCalledTimes(1);
      expect(writesOnSave).toBe(1);
    });

    it("T6.3 renomme le tableau « Sans titre » quand l'utilisateur vide le champ", async () => {
      const emptiedName = '';

      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const fieldOnceLoaded = nameInput();
      const valueOnceLoaded = fieldOnceLoaded?.value;

      await typeName(emptiedName);

      const fieldBeforeSave = nameInput();
      const valueBeforeSave = fieldBeforeSave?.value;

      await clickOn('.btn-save');

      expect(valueOnceLoaded).toBe(EXISTING_KANBAN.name);
      expect(valueBeforeSave).toBe('');
      expect(kanbanService.renameKanban).toHaveBeenCalledTimes(1);
      expect(kanbanService.renameKanban).toHaveBeenCalledWith(
        EXISTING_KANBAN.id,
        FALLBACK_SAVED_NAME,
      );
    });

    it('T6.4 ramène à la liste après un renommage réussi', async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);

      const navigationsBeforeSave = navigations();

      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      expect(navigationsBeforeSave).toEqual([]);
      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 — Échec de l'enregistrement
  // ---------------------------------------------------------------------------
  describe("Échec de l'enregistrement", () => {
    it("T7.1 reste affiché après un échec d'enregistrement : aucune navigation vers la liste", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Anniversaire de Léa';

      await setup();
      kanbanService.createKanban.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const requestedNavigations = navigations();
      const editorStillShown = isShown('.kanban-editor');

      expect(kanbanService.createKanban).toHaveBeenCalledTimes(1);
      expect(requestedNavigations).toEqual([]);
      expect(editorStillShown).toBe(true);
    });

    it("T7.2 garde le nom saisi dans le champ après un échec : la frappe n'est pas perdue", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = '  Anniversaire de Léa  ';
      const expectedStoredName = 'Anniversaire de Léa';

      await setup();
      kanbanService.createKanban.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const fieldAfterFailure = nameInput();
      const valueAfterFailure = fieldAfterFailure?.value;

      expect(kanbanService.createKanban).toHaveBeenCalledWith(expectedStoredName);
      expect(fieldAfterFailure).not.toBeNull();
      expect(valueAfterFailure).toBe(typedName);
    });

    it("T7.3 affiche le bandeau « Impossible d'enregistrer le tableau. », annoncé comme une alerte", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Anniversaire de Léa';

      await setup();
      kanbanService.createKanban.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);

      const bannerBeforeSave = isShown('.action-error');

      await clickOn('.btn-save');

      const bannerAfterSave = el.querySelector<HTMLElement>('.action-error');
      const bannerText = normalizedTextOf('.action-error');
      const bannerRole = bannerAfterSave?.getAttribute('role');

      expect(bannerBeforeSave).toBe(false);
      expect(bannerAfterSave).not.toBeNull();
      expect(bannerText).toContain(SAVE_FAILED_MESSAGE);
      expect(bannerRole).toBe('alert');
    });

    it("T7.4 efface le bandeau de l'essai précédent avant de retenter l'enregistrement", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Anniversaire de Léa';

      await setup();
      kanbanService.createKanban
        .mockRejectedValueOnce(writeFailure)
        .mockResolvedValue(EXISTING_KANBAN);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const bannerAfterFirstAttempt = isShown('.action-error');

      await clickOn('.btn-save');

      const bannerAfterSecondAttempt = isShown('.action-error');
      const storedNames = kanbanService.createKanban.mock.calls.map((call: unknown[]) => call[0]);

      expect(bannerAfterFirstAttempt).toBe(true);
      expect(bannerAfterSecondAttempt).toBe(false);
      expect(storedNames).toEqual([typedName, typedName]);
    });

    it("T7.5 ramène à la liste, bandeau disparu, quand on retouche le nom puis que l'enregistrement réussit", async () => {
      const writeFailure = new Error('Écriture refusée');
      const refusedName = 'Travaux du garage';
      const correctedName = 'Travaux de la cave';
      const renamedBoard: Kanban = { ...EXISTING_KANBAN, name: correctedName };

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.renameKanban.mockRejectedValueOnce(writeFailure).mockResolvedValue(renamedBoard);

      await render();
      await typeName(refusedName);
      await clickOn('.btn-save');

      const bannerAfterFailure = isShown('.action-error');
      const navigationsAfterFailure = navigations();

      await typeName(correctedName);
      await clickOn('.btn-save');

      const bannerAfterSuccess = isShown('.action-error');
      const navigationsAfterSuccess = navigations();
      const renameArguments = kanbanService.renameKanban.mock.calls;

      expect(bannerAfterFailure).toBe(true);
      expect(navigationsAfterFailure).toEqual([]);
      expect(bannerAfterSuccess).toBe(false);
      expect(navigationsAfterSuccess).toEqual([KANBAN_LIST_ROUTE]);
      expect(renameArguments).toEqual([
        [EXISTING_KANBAN.id, refusedName],
        [EXISTING_KANBAN.id, correctedName],
      ]);
    });

    it("T7.6 traite un tableau supprimé pendant l'édition comme n'importe quel échec d'enregistrement", async () => {
      const boardGoneFailure = new Error('Kanban introuvable');
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.renameKanban.mockRejectedValue(boardGoneFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterFailure = nameInput();
      const valueAfterFailure = fieldAfterFailure?.value;
      const bannerText = normalizedTextOf('.action-error');
      const requestedNavigations = navigations();
      const notFoundShown = isShown('.not-found');
      const loadErrorShown = isShown('.error-state');

      expect(editorStillShown).toBe(true);
      expect(valueAfterFailure).toBe(typedName);
      expect(bannerText).toContain(SAVE_FAILED_MESSAGE);
      expect(bannerText).not.toContain('introuvable');
      expect(requestedNavigations).toEqual([]);
      expect(notFoundShown).toBe(false);
      expect(loadErrorShown).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 — Retour sans modification en attente
  // ---------------------------------------------------------------------------
  describe('Retour sans modification en attente', () => {
    it("T8.1 ramène immédiatement à la liste en mode création quand le champ est resté vide, sans aucune popup", async () => {
      await setup();
      await render();

      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-backdrop');

      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T8.2 ramène immédiatement à la liste en mode édition quand le nom est inchangé, sans popup', async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const fieldBeforeBack = nameInput();
      const valueBeforeBack = fieldBeforeBack?.value;
      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-backdrop');

      expect(valueBeforeBack).toBe(EXISTING_KANBAN.name);
      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T8.3 ne compte pas comme une modification le fait de retaper exactement le nom de départ', async () => {
      const intermediateName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(intermediateName);
      await typeName(EXISTING_KANBAN.name);

      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-backdrop');

      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it("T8.4 ne compte pas comme une modification l'ajout de seuls espaces en début ou en fin du nom", async () => {
      const paddedName = `  ${EXISTING_KANBAN.name}  `;

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(paddedName);

      const fieldBeforeBack = nameInput();
      const valueBeforeBack = fieldBeforeBack?.value;
      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-backdrop');

      expect(valueBeforeBack).toBe(paddedName);
      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it("T8.5 n'écrit rien quand le retour est immédiat : ni création ni renommage demandés", async () => {
      const intermediateName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(intermediateName);
      await typeName(EXISTING_KANBAN.name);
      await clickOn('.btn-back');

      const writesOnBack = writeCalls();
      const navigationsAfterBack = navigations();

      expect(writesOnBack).toBe(0);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 9 — Retour avec modification en attente
  // ---------------------------------------------------------------------------
  describe('Retour avec modification en attente', () => {
    it("T9.1 ouvre la popup d'abandon quand le nom a été modifié, sans naviguer ni écrire tant que l'utilisateur n'a pas répondu", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-message');
      const confirmLabel = normalizedTextOf('.confirm-card .btn-confirm');
      const cancelLabel = normalizedTextOf('.confirm-card .btn-cancel');
      const requestedNavigations = navigations();
      const writesWhileWaiting = writeCalls();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(confirmLabel).toBe(DISCARD_CONFIRM_LABEL);
      expect(cancelLabel).toBe(DISCARD_CANCEL_LABEL);
      expect(requestedNavigations).toEqual([]);
      expect(writesWhileWaiting).toBe(0);
    });

    it("T9.2 ferme la popup et laisse l'utilisateur sur l'écran quand il touche « Annuler », sa saisie intacte", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupBeforeAnswer = isShown('.confirm-backdrop');

      await clickOn('.confirm-card .btn-cancel');

      const confirmPopupAfterAnswer = isShown('.confirm-backdrop');
      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterAnswer = nameInput();
      const valueAfterAnswer = fieldAfterAnswer?.value;
      const requestedNavigations = navigations();
      const writesOnCancel = writeCalls();

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(editorStillShown).toBe(true);
      expect(valueAfterAnswer).toBe(typedName);
      expect(requestedNavigations).toEqual([]);
      expect(writesOnCancel).toBe(0);
    });

    it("T9.3 traite un clic hors de la popup comme « Annuler »", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupBeforeAnswer = isShown('.confirm-backdrop');

      await clickOn('.confirm-backdrop');

      const confirmPopupAfterAnswer = isShown('.confirm-backdrop');
      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterAnswer = nameInput();
      const valueAfterAnswer = fieldAfterAnswer?.value;
      const requestedNavigations = navigations();
      const writesOnBackdropClick = writeCalls();

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(editorStillShown).toBe(true);
      expect(valueAfterAnswer).toBe(typedName);
      expect(requestedNavigations).toEqual([]);
      expect(writesOnBackdropClick).toBe(0);
    });

    it('T9.4 traite la touche Échap comme « Annuler »', async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupBeforeAnswer = isShown('.confirm-backdrop');

      await pressEscape();

      const confirmPopupAfterAnswer = isShown('.confirm-backdrop');
      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterAnswer = nameInput();
      const valueAfterAnswer = fieldAfterAnswer?.value;
      const requestedNavigations = navigations();
      const writesOnEscape = writeCalls();

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(editorStillShown).toBe(true);
      expect(valueAfterAnswer).toBe(typedName);
      expect(requestedNavigations).toEqual([]);
      expect(writesOnEscape).toBe(0);
    });

    it("T9.5 ramène à la liste sans rien enregistrer quand l'utilisateur touche « Quitter »", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const navigationsBeforeAnswer = navigations();

      await clickOn('.confirm-card .btn-confirm');

      const navigationsAfterAnswer = navigations();
      const writesOnDiscard = writeCalls();

      expect(navigationsBeforeAnswer).toEqual([]);
      expect(navigationsAfterAnswer).toEqual([KANBAN_LIST_ROUTE]);
      expect(writesOnDiscard).toBe(0);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });

    it('T9.6 ne pose plus de question au retour après un enregistrement réussi', async () => {
      const typedName = 'Travaux du garage';
      const renamedBoard: Kanban = { ...EXISTING_KANBAN, name: typedName };

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.renameKanban.mockResolvedValue(renamedBoard);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupAfterBack).toBe(false);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE, KANBAN_LIST_ROUTE]);
    });

    it("T9.7 demande toujours confirmation au retour après un échec d'enregistrement", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.renameKanban.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const bannerAfterFailure = isShown('.action-error');
      const navigationsAfterFailure = navigations();

      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(bannerAfterFailure).toBe(true);
      expect(navigationsAfterFailure).toEqual([]);
      expect(confirmPopupAfterBack).toBe(true);
      expect(navigationsAfterBack).toEqual([]);
    });

    it("T9.8 ouvre la popup d'abandon en mode création dès qu'un nom a été tapé, le nom de départ étant vide", async () => {
      const typedName = 'Anniversaire de Léa';

      await setup();
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-message');
      const requestedNavigations = navigations();
      const writesWhileWaiting = writeCalls();

      expect(confirmPopupAfterBack).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
      expect(writesWhileWaiting).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 10 — Zone de contenu du tableau
  // ---------------------------------------------------------------------------
  describe('Zone de contenu du tableau', () => {
    it('T10.1 affiche en mode création une zone de contenu présente et vide, annonçant les listes à venir', async () => {
      await setup();
      await render();

      const canvasShown = isShown('.board-canvas');
      const placeholderShown = isShown('.board-canvas .ghost-column');
      const placeholderText = normalizedTextOf('.board-canvas .ghost-column');
      const unexpectedChildren = boardCanvasChildrenBesidesPlaceholders();
      const writesOnOpening = writeCalls();

      expect(canvasShown).toBe(true);
      expect(placeholderShown).toBe(true);
      expect(placeholderText.length).toBeGreaterThan(0);
      expect(unexpectedChildren).toEqual([]);
      expect(kanbanService.getKanbanById).not.toHaveBeenCalled();
      expect(writesOnOpening).toBe(0);
    });

    it("T10.2 affiche la même zone de contenu vide en mode édition, sans appel supplémentaire à la source", async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const canvasShown = isShown('.board-canvas');
      const placeholderShown = isShown('.board-canvas .ghost-column');
      const placeholderText = normalizedTextOf('.board-canvas .ghost-column');
      const unexpectedChildren = boardCanvasChildrenBesidesPlaceholders();
      const writesOnOpening = writeCalls();

      expect(canvasShown).toBe(true);
      expect(placeholderShown).toBe(true);
      expect(placeholderText.length).toBeGreaterThan(0);
      expect(unexpectedChildren).toEqual([]);
      expect(kanbanService.getKanbanById).toHaveBeenCalledTimes(1);
      expect(writesOnOpening).toBe(0);
    });
  });
});
