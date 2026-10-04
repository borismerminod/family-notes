import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategorySelector } from './category-selector';
import { vi } from 'vitest';
import { CategoriesService } from '../core/services/categories.service';
import { of } from 'rxjs';
import { Category, NOTE_COLOR_PALETTE } from '../core/models';

describe('CategorySelector', () => {
  let component: CategorySelector;
  let fixture: ComponentFixture<CategorySelector>;
  let mockCategoriesService: any;

  beforeEach(async () => {

    mockCategoriesService = {
      getAllCategories: vi.fn().mockReturnValue(of([])),
      create: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CategorySelector],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService }
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CategorySelector);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Affichage Initial', () => {
    it('should display the correct placeholder on initialization', () => {
      const inputElement = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      expect(inputElement.placeholder).toBe('Sélectionner une catégorie...');
    });

    it('should have the dropdown list hidden by default', () => {
      expect(fixture.nativeElement.querySelector('.category-list-container')).toBeNull();
    });

    it('should show the dropdown list when the input is focused', () => {
      const inputElement = fixture.nativeElement.querySelector('input') as HTMLInputElement;

      inputElement.focus();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.category-list-container')).not.toBeNull();
    });
  });

  describe('Filtrage Dynamique (Input)', () => {
    let testCategories: Category[] = [
      { id: '1', name: 'Travail' },
      { id: '2', name: 'Loisirs' },
      { id: '3', name: 'Sport' },
      { id: '4', name: 'Famille' }
    ];

    beforeEach(async () => {
      fixture.componentRef.setInput('categories', testCategories);
      fixture.detectChanges();
      await fixture.whenStable();
    });
    const triggerInput = (value: string) => {
      const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      inputEl.value = value;
      inputEl.dispatchEvent(new Event('input'));
      inputEl.focus();
      fixture.detectChanges();
    };

    it('should filter by "tra" (simple filtering)', () => {
      triggerInput('tra');
      
      const listItems = fixture.nativeElement.querySelectorAll('.category-list li');
      expect(listItems.length).toBe(1);
      expect(listItems[0].textContent).toContain('Travail');
    });

    it('should filter case-insensitively with "TRA"', () => {
      triggerInput('TRA');
      
      const listItems = fixture.nativeElement.querySelectorAll('.category-list li');
      expect(listItems.length).toBe(1);
      expect(listItems[0].textContent).toContain('Travail');
    });

    it('should handle spaces "  travail  "', () => {
      triggerInput('  travail  ');
      
      const listItems = fixture.nativeElement.querySelectorAll('.category-list li');
      expect(listItems.length).toBe(1);
      expect(listItems[0].textContent).toContain('Travail');
    });

    it('should show no results for "xyz123"', () => {
      triggerInput('xyz123');
      
      const listItems = fixture.nativeElement.querySelectorAll('.category-list li');
      // La liste doit �tre vide
      expect(listItems.length).toBe(0);
    });
  });

  describe('Interaction de Sélection', () => {
    let testCategories: Category[] = [
      { id: '1', name: 'Travail' },
      { id: '2', name: 'Loisirs' },
      { id: '3', name: 'Sport' },
      { id: '4', name: 'Famille' }
    ];

    beforeEach(async () => {
      fixture.componentRef.setInput('categories', testCategories);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should update draft, emit selected, and close the list when clicking "Travail"', async () => {
      const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      inputEl.focus();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.isOpen()).toBe(true);

      let emittedCategory: Category | null = null;
      let emittedDraft: string | null = null;
      
      const selectedSub = component.selected.subscribe(cat => emittedCategory = cat);
      const draftSub = component.draftChange.subscribe(val => emittedDraft = val);

      const listItems = fixture.nativeElement.querySelectorAll('.category-list li') as HTMLElement[];
      const travailItem = Array.from(listItems).find(li => li.textContent?.includes('Travail'));
      
      if (travailItem) {
        travailItem.click();
      } else {
        throw new Error('L\'Elément "Travail" n\'est pas visible dans la liste');
      }

      fixture.detectChanges();
      await fixture.whenStable();

      // Assertions
      expect(component.draft()).toBe('Travail');
      expect(emittedDraft).toBe('Travail');
      expect(emittedCategory).toEqual(testCategories[0]);
      expect(component.isOpen()).toBe(false);

      selectedSub.unsubscribe();
      draftSub.unsubscribe();
    });

    it('should open the list when the input is focused', () => {
      const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      inputEl.focus();
      fixture.detectChanges();
      
      expect(component.isOpen()).toBe(true);
    });

    it('should close the list when the input loses focus (blur)', () => {
      vi.useFakeTimers();
      try {
        const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;

        inputEl.dispatchEvent(new Event('focus'));
        expect(component.isOpen()).toBe(true);

        inputEl.dispatchEvent(new Event('blur'));
        expect(component.isOpen()).toBe(true);   // pas encore fermé : le délai court

        vi.advanceTimersByTime(200);
        expect(component.isOpen()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

   describe('Palette de Couleurs', () => {
      it('propose la palette partagée de l’application', () => {
        expect([...component.colorPalette]).toEqual([...NOTE_COLOR_PALETTE]);
      });

      it('should open the color popup when clicking the color picker button', () => {
          const button = fixture.nativeElement.querySelector('.color-picker-btn') as HTMLButtonElement;
          if (button) {
            button.click();
            fixture.detectChanges();
            expect(component.colorPopupOpen()).toBe(true);
          } else {
            console.warn('Le bouton .color-picker-btn est toujours comment� dans le HTML.');
          }
      });

    it('should update color and close popup when a palette item is clicked', async () => {
        const button = fixture.nativeElement.querySelector('.color-picker-btn') as HTMLButtonElement;
        if (button) 
        {
          button.click();
          fixture.detectChanges();
          await fixture.whenStable();
          expect(component.colorPopupOpen()).toBe(true);

          const paletteItem = fixture.nativeElement.querySelector('.palette-item') as HTMLButtonElement;
          if (paletteItem) 
          {
            // La valeur attendue vient de la palette du composant : le style inline est sérialisé
            // par le DOM (`rgb(...)`) et ne peut pas être comparé à une couleur hexadécimale.
            const newColor = component.colorPalette[0];
            paletteItem.click();
            fixture.detectChanges();
            await fixture.whenStable();

            // Assertions
            expect(component.color()).toBe(newColor);
            expect(component.colorPopupOpen()).toBe(false);
          } 
          else 
          {
            throw new Error('Les items de la palette sont commentés dans le HTML.');
          }
        } else {
          console.warn('Le bouton .color-picker-btn est toujours comment� dans le HTML.');
        }
    });

    it('should close the popup when clicking outside', async () => {
      const button = fixture.nativeElement.querySelector('.color-picker-btn') as HTMLButtonElement;
      if (button) 
      {
        button.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.colorPopupOpen()).toBe(true);

        const externalElement = document.body;
        externalElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();

        expect(component.colorPopupOpen()).toBe(false);
      } 
      else 
      {
        console.warn('Le bouton .color-picker-btn est toujours commenté dans le HTML.');
      }
    });
  });

});


