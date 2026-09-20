/**
 * @file url-sanitize.ts
 * @description **Single filtering point** for link URLs (DL6, see
 * .agent/URL_LINK/APPROCHE_INSERTION_LIEN.md §0.4). Only the `http:` / `https:` schemes are
 * accepted; `javascript:`, `data:`, an empty URL or an **unresolved relative** link → `''`.
 *
 * Called at the **three** boundaries of the feature (defense in depth): when **parsing** a pasted
 * `<a>` (§B2), when **inserting** from the toolbar (§D), and when **opening** externally (§E).
 */

/**
 * Validates and returns an `http(s)` URL, otherwise `''`.
 *
 * Validation goes through `new URL()` (rejects an unresolved relative link) then a protocol
 * check; the **original** string is returned (only `trim`med), **not** `url.href`, so as not to
 * renormalize (e.g. `https://ex.com` → `https://ex.com/`) and break the parse/render round-trip.
 * @param href The raw URL (`href` attribute, user input…), possibly `null`.
 * @returns The trimmed original `http(s)` URL, or `''` when the scheme is rejected / the URL is invalid.
 */
export function sanitizeHttpUrl(href: string | null | undefined): string {
  const trimmed = (href ?? '').trim();
  if (!trimmed) return '';
  let protocol: string;
  try {
    protocol = new URL(trimmed).protocol;
  } catch {
    return ''; // unresolved relative link or invalid URL
  }
  return protocol === 'http:' || protocol === 'https:' ? trimmed : '';
}
