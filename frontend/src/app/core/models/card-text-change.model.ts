/**
 * @file card-text-change.model.ts
 * @description What `KanbanColumnPanel` hands to the edit screen when one of its cards had its
 * text validated
 * (see .agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md, D-C22).
 *
 * A card emits its typed text alone: it has no reason to name itself, being the only card it
 * speaks for. The column, which renders one panel per card (D-C22), is the one that knows which
 * card spoke, and it relays both together — hence this pair, rather than two outputs the screen
 * would have to correlate.
 *
 * It lives among the models because the screen takes it as a whole on `onCardTextChanged`: it is
 * shared between the column panel and the editor, like `KanbanSaveResult` is between the service
 * and the screen.
 */

export interface CardTextChange {
  /**
   * Identifier of the card whose text was validated — the label the column adds, without which
   * the screen could not tell which card of which column spoke (D-C22).
   */
  cardId: string;
  /**
   * The text **as it was typed**: neither trimmed nor replaced by the fallback name. Those rules
   * belong to the editor, in a single place (D-C30), so neither the card nor the column applies
   * them.
   */
  text: string;
}
