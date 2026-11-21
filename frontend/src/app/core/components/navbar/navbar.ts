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
  /**
   * Whether the tab is active only on its exact URL. `false` also activates it on the URLs below
   * its destination, as `/calendar/2026-11` for the Calendar tab.
   */
  matchExactUrl: boolean;
}

/**
 * Single source of truth of the bar tabs (D-N3). The array order is the display order.
 */
export const NAVBAR_TABS: readonly NavbarTab[] = [
  { id: 'notes', label: 'Notes', commands: ['/notes'], enabled: true, matchExactUrl: true },
  { id: 'kanbans', label: 'Kanbans', commands: ['/kanban'], enabled: true, matchExactUrl: true },
  { id: 'calendar', label: 'Calendrier', commands: ['/calendar'], enabled: true, matchExactUrl: false },
];

/**
 * Shared bottom navigation bar of the application, hosted by the list screens. It has no input,
 * no output and injects nothing (D-N2): everything it shows comes from the router.
 *
 * The three tabs lead to their screen through `routerLink`; a tab marked disabled would be rendered
 * as a native `disabled` button (D-N8). The Calendar tab leads to `/calendar`, whose screen opens on
 * the current month by itself, so the tab never freezes a month. The enabled tab matching the URL
 * is flagged by `routerLinkActive` with `aria-current="page"` (D-N5): exactly for Notes and
 * Kanbans, whose editors must not light them up, and with the month below it for Calendar.
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
