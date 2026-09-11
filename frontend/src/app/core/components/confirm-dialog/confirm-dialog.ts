import { Component, HostListener, input, model, output } from '@angular/core';

/**
 * Boîte de dialogue de confirmation générique (popup).
 *
 * Affiche un message et deux boutons (Oui / Non). Un clic ferme la fenêtre
 * et émet un booléen via l'output `answered` (true = Oui, false = Non).
 *
 * Exemple d'utilisation (par le parent) :
 *   <app-confirm-dialog
 *     [message]="'Supprimer cette note ?'"
 *     [(open)]="showConfirm"
 *     (answered)="onAnswer($event)" />
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  /** Message affiché dans la popup. */
  message = input<string>('');

  /**
   * Visibilité de la popup. `model()` autorise un binding simple `[open]`
   * ou bidirectionnel `[(open)]`, et permet au composant de se refermer.
   */
  open = model<boolean>(false);

  /** Libellé du bouton de confirmation (défaut : « Oui »). */
  confirmLabel = input<string>('Oui');

  /** Libellé du bouton d'annulation (défaut : « Non »). */
  cancelLabel = input<string>('Non');

  /** Émet la réponse de l'utilisateur : true (Oui) ou false (Non). */
  answered = output<boolean>();

  /** Clic sur « Oui » : ferme la fenêtre et renvoie true. */
  onConfirm(): void {
    this.answered.emit(true);
    this.open.set(false);
  }

  /** Clic sur « Non » : ferme la fenêtre et renvoie false. */
  onCancel(): void {
    this.answered.emit(false);
    this.open.set(false);
  }

  /**
   * Clic sur le fond (backdrop) : équivaut à « Non ».
   * Ignoré si le clic provient de la carte elle-même.
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  /** Touche Échap : équivaut à « Non » quand la popup est ouverte. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.onCancel();
    }
  }
}
