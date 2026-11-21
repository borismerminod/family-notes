import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationStart, Router, Routes, provideRouter } from '@angular/router';

import { NavBar } from './navbar';

/**
 * @file navbar.spec.ts
 * @description Black-box TDD tests for the shared bottom navigation bar.
 *
 * Expected behaviour: `.agent/NAVBAR/PLAN_TESTS_NAVBAR.md`, groups 1 to 4 (cases T1.1 to T4.3,
 * couples P1 to P16, decisions D1 to D6), and `.agent/NAVBAR/APPROCHE_NAVBAR.md` (decisions
 * `D-N1` to `D-N10`), serving `US1` to `US4` of `.agent/NAVBAR/FEATURE_NAVBAR.md`.
 *
 * The bar has no input, no output and injects nothing (`D-N2`): everything observable goes through
 * the **real router** (`routerLink`, `routerLinkActive`, `D-N5`), mounted here with empty routes.
 * Labels, order and destinations are written **by hand** in this file and never read from the
 * component's tab constant (`D6`). Numeric layout values (heights, gaps, `fixed`, `z-index`) are
 * not asserted: jsdom computes no layout, they belong to the device checklist (`D1`).
 *
 * The Calendar tab, disabled in the plan (group 4), was unlocked once the calendar was delivered:
 * T1.3, T1.4 and group 4 now assert a tab leading to `/calendar`, and T2.6 a tab active on a month
 * of the calendar, the calendar screen hosting the bar too.
 *
 * DOM contract, §7 of the plan:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `nav[aria-label="Navigation principale"]` | The bar | T1.1 |
 * | `nav .navbar-tab` | One tab, in display order | T1.2, T3.x, T4.x |
 * | `a.navbar-tab` | Navigable tab (`href` is `/notes`, `/kanban` or `/calendar`) | T1.3, T3.x, T4.x |
 * | `button.navbar-tab[disabled]` | A disabled tab; none since the calendar was unlocked | T1.4 |
 * | `[aria-current="page"]` (inside the bar) | The active tab, the **only** marker asserted | T2.x, T3.x |
 */

/** Empty target of every route the bar can lead to. */
@Component({ selector: 'app-empty-route', template: '' })
class EmptyRoute {}

/** The routes the bar leads to, plus the editor route used to leave both lists (`D4`). */
const TEST_ROUTES: Routes = [
  { path: 'notes', component: EmptyRoute },
  { path: 'kanban', component: EmptyRoute },
  { path: 'calendar', component: EmptyRoute },
  { path: 'calendar/:selectedMonthDate', component: EmptyRoute },
  { path: 'notes/edit/:id', component: EmptyRoute },
];

describe('NavBar (la barre de navigation partagée)', () => {
  let fixture: ComponentFixture<NavBar>;
  let el: HTMLElement;
  let router: Router;

  /**
   * Mounts the bar on the real router, fed with the empty test routes, then renders it.
   *
   * @param initialUrl When given, the router navigates there **before** the bar is created, so the
   * first render of the bar already happens on that route (direct access).
   */
  async function mountNavBar(initialUrl?: string): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [NavBar],
      providers: [provideRouter(TEST_ROUTES)],
    }).compileComponents();

    router = TestBed.inject(Router);
    if (initialUrl !== undefined) {
      await router.navigateByUrl(initialUrl);
    }
    fixture = TestBed.createComponent(NavBar);
    el = fixture.nativeElement as HTMLElement;
    await render();
  }

  /** Navigates the real router to the given URL, then refreshes the bar. */
  async function navigateTo(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await render();
  }

  /** Returns the labels of the tabs flagged as the current page, in display order. */
  function activeTabLabels(): string[] {
    const activeTabs: HTMLElement[] = Array.from(el.querySelectorAll<HTMLElement>('nav [aria-current="page"]'));
    return activeTabs.map((tab: HTMLElement): string => (tab.textContent ?? '').trim());
  }

  /** Returns the tab displaying the given label, or fails the test when there is none. */
  function tabByLabel(label: string): HTMLElement {
    const tabElements: HTMLElement[] = Array.from(el.querySelectorAll<HTMLElement>('nav .navbar-tab'));
    const matchingTab: HTMLElement | undefined = tabElements.find(
      (tab: HTMLElement): boolean => (tab.textContent ?? '').trim() === label,
    );
    if (matchingTab === undefined) {
      throw new Error(`No tab labelled "${label}" in the bar`);
    }
    return matchingTab;
  }

  /** Starts recording the router's `NavigationStart` events; the returned array fills up as they happen. */
  function trackNavigationStarts(): NavigationStart[] {
    const navigationStarts: NavigationStart[] = [];
    router.events.subscribe((event: unknown): void => {
      if (event instanceof NavigationStart) {
        navigationStarts.push(event);
      }
    });
    return navigationStarts;
  }

  /** Taps the tab with the given label, waits for the resulting navigation, then refreshes the bar. */
  async function tapTab(label: string): Promise<void> {
    const tab: HTMLElement = tabByLabel(label);
    tab.click();
    await fixture.whenStable();
    await render();
  }

  /** Triggers a render, lets the component settle, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Groupe 1 — Structure et libellés
  // ---------------------------------------------------------------------------
  describe('Structure et libellés', () => {
    it('T1.1 la barre est un repère nav nommé « Navigation principale »', async () => {
      await mountNavBar();

      const navigationLandmark = el.querySelector('nav[aria-label="Navigation principale"]');

      expect(navigationLandmark).not.toBeNull();
    });

    it('T1.2 elle porte trois onglets, dans l\'ordre Notes, Kanbans, Calendrier', async () => {
      await mountNavBar();

      const tabElements: HTMLElement[] = Array.from(el.querySelectorAll<HTMLElement>('nav .navbar-tab'));
      const tabLabels: string[] = tabElements.map((tab: HTMLElement): string => (tab.textContent ?? '').trim());

      expect(tabLabels).toEqual(['Notes', 'Kanbans', 'Calendrier']);
    });

    it('T1.3 Notes, Kanbans et Calendrier sont des liens vers /notes, /kanban et /calendar', async () => {
      await mountNavBar();

      const linkElements: HTMLAnchorElement[] = Array.from(el.querySelectorAll<HTMLAnchorElement>('nav a.navbar-tab'));
      const linkLabels: string[] = linkElements.map((link: HTMLAnchorElement): string => (link.textContent ?? '').trim());
      const linkDestinations: (string | null)[] = linkElements.map(
        (link: HTMLAnchorElement): string | null => link.getAttribute('href'),
      );

      expect(linkLabels).toEqual(['Notes', 'Kanbans', 'Calendrier']);
      expect(linkDestinations).toEqual(['/notes', '/kanban', '/calendar']);
    });

    it('T1.4 aucun onglet n\'est désactivé', async () => {
      await mountNavBar();

      const disabledButtons: HTMLButtonElement[] = Array.from(
        el.querySelectorAll<HTMLButtonElement>('nav button.navbar-tab[disabled]'),
      );

      expect(disabledButtons).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 2 — Onglet actif
  // ---------------------------------------------------------------------------
  describe('Onglet actif', () => {
    it('T2.1 à /notes, seul Notes porte aria-current="page"', async () => {
      await mountNavBar();

      await navigateTo('/notes');

      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(labelsOfActiveTabs).toEqual(['Notes']);
    });

    it('T2.2 à /kanban, seul Kanbans porte aria-current="page"', async () => {
      await mountNavBar();

      await navigateTo('/kanban');

      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(labelsOfActiveTabs).toEqual(['Kanbans']);
    });

    it('T2.3 route ouverte avant le premier rendu : l\'onglet est actif dès ce rendu', async () => {
      await mountNavBar('/kanban');

      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(labelsOfActiveTabs).toEqual(['Kanbans']);
    });

    it('T2.4 l\'onglet actif suit l\'URL quand elle change sans toucher la barre ; un seul actif', async () => {
      await mountNavBar();

      await navigateTo('/notes');
      const labelsAtNotes: string[] = activeTabLabels();
      await navigateTo('/kanban');
      const labelsAtKanban: string[] = activeTabLabels();
      await navigateTo('/notes');
      const labelsBackAtNotes: string[] = activeTabLabels();

      expect(labelsAtNotes).toEqual(['Notes']);
      expect(labelsAtKanban).toEqual(['Kanbans']);
      expect(labelsBackAtNotes).toEqual(['Notes']);
    });

    it('T2.5 hors des listes, aucun onglet actif', async () => {
      await mountNavBar();

      await navigateTo('/notes/edit/n-1');

      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(labelsOfActiveTabs).toEqual([]);
    });

    it('T2.6 à /calendar/2026-11, seul Calendrier porte aria-current="page"', async () => {
      await mountNavBar();

      await navigateTo('/calendar/2026-11');

      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(labelsOfActiveTabs).toEqual(['Calendrier']);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Navigation
  // ---------------------------------------------------------------------------
  describe('Navigation', () => {
    it('T3.1 toucher Kanbans depuis /notes mène à /kanban et déplace l\'onglet actif', async () => {
      await mountNavBar('/notes');

      await tapTab('Kanbans');

      const currentUrl: string = router.url;
      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(currentUrl).toBe('/kanban');
      expect(labelsOfActiveTabs).toEqual(['Kanbans']);
    });

    it('T3.2 toucher Notes depuis /kanban mène à /notes et déplace l\'onglet actif', async () => {
      await mountNavBar('/kanban');

      await tapTab('Notes');

      const currentUrl: string = router.url;
      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(currentUrl).toBe('/notes');
      expect(labelsOfActiveTabs).toEqual(['Notes']);
    });

    it('T3.3 toucher l\'onglet de l\'écran affiché ne déclenche aucune navigation', async () => {
      await mountNavBar('/notes');
      const navigationStarts: NavigationStart[] = trackNavigationStarts();

      await tapTab('Notes');

      const currentUrl: string = router.url;
      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(navigationStarts.length).toBe(0);
      expect(currentUrl).toBe('/notes');
      expect(labelsOfActiveTabs).toEqual(['Notes']);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Calendrier
  // ---------------------------------------------------------------------------
  describe('Calendrier', () => {
    it('T4.1 toucher Calendrier depuis /notes mène à /calendar et déplace l\'onglet actif', async () => {
      await mountNavBar('/notes');

      await tapTab('Calendrier');

      const currentUrl: string = router.url;
      const labelsOfActiveTabs: string[] = activeTabLabels();
      expect(currentUrl).toBe('/calendar');
      expect(labelsOfActiveTabs).toEqual(['Calendrier']);
    });

    it('T4.2 toucher Calendrier depuis /kanban mène aussi à /calendar', async () => {
      await mountNavBar('/kanban');

      await tapTab('Calendrier');

      const currentUrl: string = router.url;
      expect(currentUrl).toBe('/calendar');
    });

    it('T4.3 Calendrier est un lien focalisable', async () => {
      await mountNavBar('/notes');
      const calendarLink: HTMLElement = tabByLabel('Calendrier');

      calendarLink.focus();

      const activeElementAfterFocus: Element | null = document.activeElement;
      expect(calendarLink.tagName).toBe('A');
      expect(activeElementAfterFocus).toBe(calendarLink);
    });
  });
});
