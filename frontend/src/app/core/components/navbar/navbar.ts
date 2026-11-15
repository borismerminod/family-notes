import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * One tab of the bottom navigation bar.
 */
export interface NavbarTab {
  /** Stable identifier of the tab, used to track it in the template loop. */
  id: string;
  /** Label displayed in the tab. */
  label: string;
  /** Router commands the tab leads to; empty while the destination does not exist. */
  commands: string[];
  /** Whether the tab can be used; a disabled tab is rendered as an inert button. */
  enabled: boolean;
}

/**
 * Single source of truth of the bar tabs (D-N3). The array order is the display order.
 */
export const NAVBAR_TABS: readonly NavbarTab[] = [
  { id: 'notes', label: 'Notes', commands: ['/notes'], enabled: true },
  { id: 'kanbans', label: 'Kanbans', commands: ['/kanban'], enabled: true },
  { id: 'calendar', label: 'Calendrier', commands: [], enabled: false },
];

/**
 * Shared bottom navigation bar of the application, hosted by the list screens. It has no input,
 * no output and injects nothing (D-N2): everything it shows comes from the router.
 *
 * **Batch A in progress.** The `nav` landmark, the three tabs (labels and order) and the
 * destinations of the enabled tabs (`routerLink`) exist, and a disabled tab is rendered as a native
 * `disabled` button (D-N8). The enabled tab matching the URL exactly is flagged by
 * `routerLinkActive` with `aria-current="page"` (D-N5); the remaining cases of
 * `PLAN_TESTS_NAVBAR.md` are not implemented yet.
 */
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class NavBar {
  /** The tabs rendered by the template, read from {@link NAVBAR_TABS}. */
  readonly tabs: readonly NavbarTab[] = NAVBAR_TABS;
}
