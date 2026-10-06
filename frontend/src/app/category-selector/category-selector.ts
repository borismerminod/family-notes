import { Component, input, output, signal, computed, model, HostListener } from '@angular/core';
import { Category, NOTE_COLOR_PALETTE } from '../core/models';

@Component({
  selector: 'app-category-selector',
  imports: [],
  templateUrl: './category-selector.html',
  styleUrl: './category-selector.css',
})
export class CategorySelector 
{
    /**
     * Input signal providing the full list of available categories.
     * @type {Input<Category[]>}
     */
    categories = input<Category[]>([]);
    /**
     * Internal model holding the currently typed or selected category name.
     * @type {Model<string>}
     */
    draft = model<string>('');
    /**
     * Internal model holding the currently selected color for the category.
     * @type {Model<string | undefined>}
     */
    color = model<string | undefined>();
    /**
     * Input signal defining the placeholder text displayed when no category is selected.
     * @type {Input<string>}
     */
    placeholder = input<string>('Select a category...');

    /**
     * Output event that emits the current value of the draft input.
     */
    draftChange = output<string>();
    /**
     * Output event that emits the final, selected Category object.
     */
    selected = output<Category>();

    /**
     * Signal tracking whether the category selection dropdown is visible.
     */
    isOpen = signal(false);
    /**
     * Signal tracking whether the color selection popup is visible.
     */
    colorPopupOpen = signal(false);

    /**
     * Colors available for selection in the popup. This is the single source of truth,
     * shared with the rich text editor, note list, and category seed (see block-style.model.ts).
     */
    readonly colorPalette = NOTE_COLOR_PALETTE;

    /**
     * Computes the list of categories that match the current draft input text.
     * @returns An array of matching categories.
     */
    filteredCategories = computed(() => {
      const currentDraft = this.draft();
      if (!currentDraft || currentDraft.trim() === '') {
        return this.categories();
      }
      
      const lowerDraft = currentDraft.toLowerCase().trim();
      return this.categories().filter(cat => 
        cat.name.toLowerCase().includes(lowerDraft)
      );
    });

    /**
     * Determines if the current draft input matches the name of any available category exactly.
     * @returns True if an exact match exists, false otherwise.
     */
    exactMatch = computed(() => {
      const currentDraft = this.draft();
      if (!currentDraft) return false;
      return this.categories().some(cat => cat.name.trim().toLowerCase() === currentDraft.trim().toLowerCase());
    });

    /**
     * Sets the dropdown to open when the component gains focus.
     */
    onFocus() {
      this.isOpen.set(true);
    }

    /**
     * Handles input events, updating the draft model and emitting the change.
     * @param event The DOM event object from the input field.
     */
    onInput(event: Event) {
      const input = event.target as HTMLInputElement;
      this.draft.set(input.value);
      this.draftChange.emit(input.value);
    }

    /**
     * Handles keyboard events, specifically implementing logic for selection on 'Enter'.
     * If the current draft exactly matches a category name, it simulates a selection.
     * @param event The keyboard event object.
     */
    onKeydown(event: KeyboardEvent) 
    {
      if (event.key === 'Enter') 
      {
        if (this.exactMatch()) 
        {
          const cat = this.categories().find(c => c.name.trim().toLowerCase() === this.draft()?.trim().toLowerCase());
          if (cat) {
            this.onPick(cat);
          }
        }
        event.preventDefault();
      }
    }


    /**
     * Handles the selection of a category. Updates the draft, emits the change,
     * emits the selection, and closes the dropdown.
     * @param category The selected Category object.
     */
    onPick(category : Category) 
    {
      this.draft.set(category.name);
      this.draftChange.emit(category.name);
      this.selected.emit(category);
      this.isOpen.set(false);
    }

    /**
     * Handles blur events, setting a timeout to delay closing the dropdown
     * to allow click events within the dropdown contents to register.
     */
    onBlur() 
    {
      setTimeout(() => {
          this.isOpen.set(false);
        }, 200
      );

    }

    /**
     * Toggles the visibility of the color selection popup.
     */
    toggleColorPopup() 
    {
      this.colorPopupOpen.update(v => !v);
    }

    /**
     * Sets the selected color and closes the color popup.
     * @param color The hexadecimal color string (e.g., '#ff0000').
     */
    pickColor(color: string) 
    {
      this.color.set(color);
      this.colorPopupOpen.set(false);
    }

    /**
     * Closes the color popup if the click target is outside the color palette area.
     * @param event The mouse click event.
     */
    @HostListener('document:click', ['$event'])
    clickOutside(event: MouseEvent) 
    {
      const target = event.target as HTMLElement;
      const isInsidePalette = target.closest('.color-palette') || target.closest('.color-picker-btn');
      if (!isInsidePalette) 
      {
        this.colorPopupOpen.set(false);
      }
    }

}