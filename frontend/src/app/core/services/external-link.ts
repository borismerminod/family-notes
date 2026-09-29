import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { sanitizeHttpUrl } from './url-sanitize';

/**
 * @file external-link.ts
 * @description Opens a URL **outside the app**: native browser via `@capacitor/browser` on
 * mobile, `window.open` fallback in a web context (dev). See
 * .agent/URL_LINK/PLAN_TESTS_INSERTION_LIEN.md §E1 and APPROCHE_INSERTION_LIEN.md §3 Lot E.
 */
@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
  /**
   * Opens `url` outside the app (DL8): sanitize first (no-op if empty/rejected, defense in
   * depth); native → `Browser.open({ url })`; web → `window.open(url, '_blank', 'noopener')`.
   * @param url The URL to open.
   */
  async open(url: string): Promise<void> {
    const safe = sanitizeHttpUrl(url);
    if (!safe) return; // no-op: empty URL or rejected scheme (DL8)
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: safe });
    } else {
      window.open(safe, '_blank', 'noopener');
    }
  }
}
