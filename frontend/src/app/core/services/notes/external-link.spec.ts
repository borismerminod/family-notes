import { vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

import { ExternalLinkService } from './external-link';

/**
 * Tests du `ExternalLinkService` — ouverture d'une URL hors application — TDD / boîte noire.
 * Voir .agent/URL_LINK/PLAN_TESTS_INSERTION_LIEN.md §E1 et APPROCHE_INSERTION_LIEN.md §3 Lot E.
 *
 * Service pur (aucun état) : on l'instancie directement (`new ExternalLinkService()`), comme les
 * autres services du dossier. Les dépendances plateforme sont ESPIONNÉES (aucune ouverture réelle) :
 *   - `Capacitor.isNativePlatform()` (natif vs web) ;
 *   - `Browser.open` (`@capacitor/browser`, ouverture native hors app) ;
 *   - `window.open` (repli web).
 *
 * Décisions figées (plan §3) :
 *   DL8 — open(url) : sanitizeHttpUrl d'abord (no-op si invalide) ; natif → Browser.open({ url }) ;
 *         web → window.open(url, '_blank', 'noopener').
 *   DL6 — seuls http:/https: sont acceptés ; javascript:/data:/vide → no-op (défense en profondeur).
 */
describe('ExternalLinkService (ouverture externe)', () => {
  let service: ExternalLinkService;

  beforeEach(() => {
    service = new ExternalLinkService();
  });

  afterEach(() => vi.restoreAllMocks());

  // --- Groupe E1 ------------------------------------------------------------
  it('TE1.1 en contexte natif, open() appelle Browser.open({ url }) avec l\'URL sanitée (US5)', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const browserOpen = vi.spyOn(Browser, 'open').mockResolvedValue(undefined);
    const win = vi.spyOn(window, 'open').mockReturnValue(null);

    await service.open('https://ex.com');

    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://ex.com' });
    expect(win).not.toHaveBeenCalled();
  });

  it('TE1.2 en contexte web, open() appelle window.open(url, "_blank", "noopener") (repli, US5)', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const browserOpen = vi.spyOn(Browser, 'open').mockResolvedValue(undefined);
    const win = vi.spyOn(window, 'open').mockReturnValue(null);

    await service.open('https://ex.com');

    expect(win).toHaveBeenCalledWith('https://ex.com', '_blank', 'noopener');
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('TE1.3 open() avec une URL invalide → no-op (ni Browser.open ni window.open) (DL8)', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const browserOpen = vi.spyOn(Browser, 'open').mockResolvedValue(undefined);
    const win = vi.spyOn(window, 'open').mockReturnValue(null);

    await service.open('javascript:alert(1)');
    await service.open('');

    expect(browserOpen).not.toHaveBeenCalled();
    expect(win).not.toHaveBeenCalled();
  });
});
