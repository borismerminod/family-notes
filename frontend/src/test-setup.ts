import { vi } from 'vitest';

/**
 * @file test-setup.ts
 * @description Setup global des tests (déclaré dans `angular.json` → cible `test`, `setupFiles`).
 *
 * Les plugins Capacitor sont exposés via `registerPlugin()`, qui renvoie un `Proxy` **sans
 * propriété propre** : `vi.spyOn(Browser, 'open')` échoue alors (`'open' in Browser` est faux).
 * On remplace donc `@capacitor/browser` par un objet simple et **espionnable** pour les tests
 * (cf. `external-link.spec.ts` §E1). `@capacitor/core` (`Capacitor`) est un vrai objet, il n'a
 * pas besoin d'être mocké — `Capacitor.isNativePlatform` reste espionnable directement.
 */
vi.mock('@capacitor/browser', () => ({
  Browser: { open: async (): Promise<void> => undefined },
}));
