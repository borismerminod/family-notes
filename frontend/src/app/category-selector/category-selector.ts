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
    categories = input<Category[]>([]);
    draft = model<string>('');
    color = model<string | undefined>();
    placeholder = input<string>('Sélectionner une catégorie...');

    draftChange = output<string>();
    selected = output<Category>();

    isOpen = signal(false);
    colorPopupOpen = signal(false);

    /**
     * Couleurs proposées dans la popup. Source unique partagée avec l'éditeur de texte riche, la
     * liste des notes et le seed des catégories (cf. block-style.model.ts).
     */
    readonly colorPalette = NOTE_COLOR_PALETTE;

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

    exactMatch = computed(() => {
      const currentDraft = this.draft();
      if (!currentDraft) return false;
      return this.categories().some(cat => cat.name.trim().toLowerCase() === currentDraft.trim().toLowerCase());
    });

    onFocus() {
      this.isOpen.set(true);
    }

    onInput(event: Event) {
      const input = event.target as HTMLInputElement;
      this.draft.set(input.value);
      this.draftChange.emit(input.value);
    }

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


    onPick(category : Category) 
    {
      this.draft.set(category.name);
      this.draftChange.emit(category.name);
      this.selected.emit(category);
      this.isOpen.set(false);
    }

    onBlur() 
    {
      setTimeout(() => {
          this.isOpen.set(false);
        }, 200
      );

    }

    toggleColorPopup() 
    {
      this.colorPopupOpen.update(v => !v);
    }

    pickColor(color: string) 
    {
      this.color.set(color);
      this.colorPopupOpen.set(false);
    }

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
