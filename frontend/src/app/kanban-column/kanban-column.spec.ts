import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KanbanColumnPanel } from './kanban-column';
import { KanbanColumn } from '../core/models';

/**
 * @file kanban-column.spec.ts
 * @description Black-box TDD tests for the column panel of a kanban board.
 *
 * Expected behaviour: `.agent/KANBAN/EDITION_LISTES/PLAN_TESTS_KANBAN_EDITION_LISTES.md`, group 5
 * (cases T5.1 to T5.11, effects E29 to E34), and batch `E` of
 * `.agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md` (decisions `D-L18`, `D-L21`,
 * `D-L22`, `D-L23`).
 *
 * The component is purely presentational (`D-L23`): it injects no service, holds no router and
 * decides nothing. It is therefore mounted alone, fed a column through its input, and judged on
 * what it displays and what it emits. Everything it does not do is part of the contract too: no
 * name cleaning, no fallback on « Sans titre », no confirmation popup and no deletion — those
 * live in `KanbanEditor`, in a single place.
 *
 * DOM contract — **§9.2 of the plan**, which these selectors are the copy of. They were proposed
 * here first, the plan's contract section being unwritten when this file was built, and were
 * raised into it on 2026-11-11 (`R8` of `REVUE_KANBAN_EDITION_LISTES.md`). The template must
 * honour them:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.kanban-column` | Root of the panel | T5.11 |
 * | `.column-header` | Header: the name and the trash | — |
 * | `.column-name` | The displayed name; touching it opens the rename field | T5.1, T5.2, T5.4, T5.10, T5.11 |
 * | `.column-name-input` | In-place rename field (`input[type="text"]`), prefilled | T5.4 to T5.10 |
 * | `.btn-rename-confirm` | Validates the rename | T5.6, T5.7, T5.8 |
 * | `.btn-rename-cancel` | Gives the rename up | T5.9, T5.10 |
 * | `.btn-remove-column` | The trash of this column (`D-L23`) | T5.11 |
 * | `.column-cards` | Area reserved for the cards of the next batch (`D-L21`) | T5.3 |
 *
 * Decisions taken here for lack of a plan contract, and since confirmed — they are **§8.2 of the
 * plan** (`D-P1` → `D-P4`), raised into it on 2026-11-11:
 * - **D-P1** — the rename is validated and given up by **two buttons** `✓` / `✗` shown in the
 *   header while the field is open, and not by the keyboard: `Échap` is out of reach of an
 *   Android soft keyboard, whereas `ConfirmDialog` can afford it on a desktop browser.
 * - **D-P2** — the displayed name and the rename field **take turns**: opening the field hides
 *   `.column-name`, which is what T5.10 reads back once the rename is given up.
 * - **D-P3** — the outputs are `renamed` (the typed text) and `removeRequested` (nothing), as the
 *   class diagram of the approach names them. They are the public API of a presentational
 *   component, hence what these tests listen to.
 * - **D-P4** — « the cards area is empty » is read as **no child element and no text**: the
 *   anchor of the next batch, not a legend to be rewritten the moment a first card lands.
 */

/** The column fed to the panel in most cases. */
const COLUMN_TO_DO: KanbanColumn = { id: 'col-a-faire', name: 'À faire', position: 0 };

/**
 * The column the editor substitutes for the previous one. Its name and identifier both differ:
 * the panel must follow its input rather than an internal copy made on construction.
 */
const COLUMN_IN_PROGRESS: KanbanColumn = { id: 'col-en-cours', name: 'En cours', position: 1 };

/**
 * Name a column is stored under when the typed name is empty (`D-L17`). The panel must **not**
 * know it: the fallback belongs to the editor (`D-L23`), and T5.8 checks the panel emits the
 * empty text instead.
 */
const FALLBACK_COLUMN_NAME = 'Sans titre';

describe('KanbanColumnPanel (le composant colonne)', () => {
  let fixture: ComponentFixture<KanbanColumnPanel>;
  let el: HTMLElement;
  let renameEmissions: string[];
  let removeRequestCount: number;

  /**
   * Mounts the panel on a column and starts listening to what it emits.
   * @param column The column given to the panel's input.
   */
  async function setup(column: KanbanColumn): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [KanbanColumnPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(KanbanColumnPanel);
    el = fixture.nativeElement as HTMLElement;

    renameEmissions = [];
    removeRequestCount = 0;

    const panel = fixture.componentInstance;
    panel.renamed.subscribe((typedName: string) => {
      renameEmissions.push(typedName);
    });
    panel.removeRequested.subscribe(() => {
      removeRequestCount = removeRequestCount + 1;
    });

    fixture.componentRef.setInput('column', column);
  }

  /** Triggers a render, lets the component settle, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Replaces the column on the input, the way the editor does when it renumbers or renames its
   * composition, then refreshes the DOM.
   * @param column The column that takes the place of the previous one.
   */
  async function replaceColumn(column: KanbanColumn): Promise<void> {
    fixture.componentRef.setInput('column', column);
    await render();
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space.
   * @param selector The CSS selector looked up in the panel template.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found = el.querySelector(selector);
    const raw = found?.textContent ?? '';
    return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Clicks an element of the panel, then waits for it to finish updating.
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
   * Gives the in-place rename field.
   * @returns The field, or `null` as long as the rename is not open.
   */
  function renameInput(): HTMLInputElement | null {
    return el.querySelector<HTMLInputElement>('.column-name-input');
  }

  /**
   * Types a name the way the user would, through the rename field. Going through the field rather
   * than the component keeps the test black-box: the binding is part of what is checked.
   * @param typedName The text to type, kept as is — trailing spaces included.
   * @throws When the rename field is not open, which would signal an unexpected state.
   */
  async function typeRenameName(typedName: string): Promise<void> {
    const field = renameInput();
    if (field === null) {
      throw new Error('Aucune saisie de renommage ouverte à remplir.');
    }
    field.value = typedName;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Groupe 5 — Afficher, renommer, demander le retrait
  // ---------------------------------------------------------------------------
  describe('Afficher, renommer, demander le retrait', () => {
    it('T5.1 affiche le nom de la colonne reçue', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const displayedName = normalizedTextOf('.column-name');

      expect(displayedName).toBe(COLUMN_TO_DO.name);
    });

    it('T5.2 change le nom affiché quand une nouvelle colonne arrive en entrée : aucune copie interne', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const nameBeforeReplacement = normalizedTextOf('.column-name');

      await replaceColumn(COLUMN_IN_PROGRESS);

      const nameAfterReplacement = normalizedTextOf('.column-name');

      expect(nameBeforeReplacement).toBe(COLUMN_TO_DO.name);
      expect(nameAfterReplacement).toBe(COLUMN_IN_PROGRESS.name);
    });

    it('T5.3 réserve aux futures cartes une zone présente et vide', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const cardsArea = el.querySelector('.column-cards');
      const cardsAreaChildren = cardsArea === null ? [] : Array.from(cardsArea.children);
      const cardsAreaText = normalizedTextOf('.column-cards');

      expect(cardsArea).not.toBeNull();
      expect(cardsAreaChildren).toEqual([]);
      expect(cardsAreaText).toBe('');
    });

    it('T5.4 ouvre, en touchant le nom, une saisie pré-remplie du nom courant', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const fieldBeforeTouch = renameInput();

      await clickOn('.column-name');

      const fieldAfterTouch = renameInput();
      const prefilledValue = fieldAfterTouch?.value;

      expect(fieldBeforeTouch).toBeNull();
      expect(fieldAfterTouch).not.toBeNull();
      expect(prefilledValue).toBe(COLUMN_TO_DO.name);
    });

    it('T5.5 fait repartir la saisie du nouveau nom après un remplacement de la colonne', async () => {
      await setup(COLUMN_TO_DO);
      await render();
      await replaceColumn(COLUMN_IN_PROGRESS);

      await clickOn('.column-name');

      const prefilledValue = renameInput()?.value;

      expect(prefilledValue).toBe(COLUMN_IN_PROGRESS.name);
    });

    it('T5.6 émet le texte tapé à la validation', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await typeRenameName('Terminé');
      await clickOn('.btn-rename-confirm');

      expect(renameEmissions).toEqual(['Terminé']);
    });

    it('T5.7 émet les espaces superflus sans les nettoyer : le nettoyage appartient à l’éditeur', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const typedNameWithSpaces = '   En  cours   ';

      await clickOn('.column-name');
      await typeRenameName(typedNameWithSpaces);
      await clickOn('.btn-rename-confirm');

      expect(renameEmissions).toEqual([typedNameWithSpaces]);
    });

    it('T5.8 émet une saisie vide telle quelle, sans repli sur « Sans titre »', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await typeRenameName('');
      await clickOn('.btn-rename-confirm');

      expect(renameEmissions).toEqual(['']);
      expect(renameEmissions).not.toContain(FALLBACK_COLUMN_NAME);
      expect(renameEmissions).not.toContain(COLUMN_TO_DO.name);
    });

    it('T5.9 n’émet rien quand la saisie est abandonnée', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await clickOn('.btn-rename-cancel');

      const fieldAfterCancel = renameInput();

      expect(renameEmissions).toEqual([]);
      expect(fieldAfterCancel).toBeNull();
    });

    it('T5.10 laisse le nom affiché inchangé quand la saisie est abandonnée après avoir tapé', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await typeRenameName('Brouillon abandonné');
      await clickOn('.btn-rename-cancel');

      const displayedName = normalizedTextOf('.column-name');

      expect(displayedName).toBe(COLUMN_TO_DO.name);
      expect(renameEmissions).toEqual([]);
    });

    it('T5.11 n’émet qu’une demande de retrait à la corbeille : aucune popup, aucune suppression', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.btn-remove-column');

      const panelStillShown = el.querySelector('.kanban-column');
      const displayedName = normalizedTextOf('.column-name');
      const confirmDialogShown = el.querySelector('app-confirm-dialog, .confirm-backdrop');

      expect(removeRequestCount).toBe(1);
      expect(renameEmissions).toEqual([]);
      expect(panelStillShown).not.toBeNull();
      expect(displayedName).toBe(COLUMN_TO_DO.name);
      expect(confirmDialogShown).toBeNull();
    });
  });
});
