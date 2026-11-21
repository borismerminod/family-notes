# Implémentation du CRUD Notes - Composant Liste (Version Angular Moderne)

Ce document contient l'implémentation modernisée du composant `NoteListComponent` utilisant les dernières fonctionnalités d'Angular (v17/v18+) : **Signals**, **Control Flow Syntax** (`@if`, `@for`), et **Standalone Components**, en s'appuyant sur le `NotesService` (basé sur SQLite via Capacitor).

## 1. Modèle de données (`core/models/note.model.ts`)

```typescript
export interface Note {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
}
```

## 2. Composant Liste (`note-list.component.ts`)

```typescript
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Note } from '../core/models/note.model';
import { NotesService } from '../core/services/notes-service';

@Component({
  selector: 'app-note-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './note-list.component.html',
  styleUrls: ['./note-list.component.css']
})
export class NoteListComponent implements OnInit {
  // Utilisation de inject() au lieu du constructeur
  private noteService = inject(NotesService);
  private router = inject(Router);

  // Utilisation des Signals pour une réactivité granulaire
  notes = signal<Note[]>([]);
  isLoading = signal<boolean>(false);
  searchQuery = signal<string>('');

  // Computed signal : filtre les notes en fonction de la recherche
  filteredNotes = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allNotes = this.notes();
    
    if (!query) return allNotes;
    return allNotes.filter(note => 
      note.title.toLowerCase().includes(query) ||
      note.category.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.loadNotes();
  }

  async loadNotes(): Promise<void> {
    this.isLoading.set(true);
    try {
      const notes = await this.noteService.getAllNotes();
      this.notes.set(notes);
    } catch (err) {
      console.error('Erreur lors du chargement des notes', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  onAddNote(): void {
    this.router.navigate(['/notes/new']);
  }

  onEditNote(note: Note): void {
    this.router.navigate(['/notes/edit', note.id]);
  }

  async onDeleteNote(note: Note): Promise<void> {
    if (confirm(`Êtes-vous sûr de vouloir supprimer la note "${note.title}" ?`)) {
      try {
        await this.noteService.deleteNote(note.id);
        // Mise à jour de l'état via l'API Signal
        this.notes.update(currentNotes => currentNotes.filter(n => n.id !== note.id));
      } catch (err) {
        alert('Erreur lors de la suppression de la note.');
        console.error(err);
      }
    }
  }
}
```

## 3. Template (`note-list.component.html`)

```html
<div class="note-list-container">
  <header class="list-header">
    <h1 class="list-title">Mes Notes</h1>
    <div class="actions">
      <input 
        type:text 
        [value]="searchQuery()" 
        (input)="searchQuery.set($any($event.target).value)"
        placeholder="Rechercher une note ou catégorie..." 
        class="search-input"
      />
      <button class="btn-primary" (click)="onAddNote()">
        <span class="material-icons">add</span>
        Nouvelle Note
      </button>
    </div>
  </header>

  @if (isLoading()) {
    <div class="loading-overlay">
      <div class="spinner"></div>
    </div>
  } @else {
    <div class="notes-grid">
      @for (note of filteredNotes(); track note.id) {
        <div 
          class="note-card" 
          [routerLink]="['/notes/edit', note.id]"
          routerLinkActive="active-card"
        >
          <div class="card-content">
            <h3 class="note-title">{{ note.title }}</h3>
            <p class="note-category">{{ note.category }}</p>
            <span class="note-date">{{ note.updatedAt | date:'shortDate' }}</span>
          </div>

          <div class="card-actions">
            <button 
              class="btn-icon" 
              (click)="onEditNote(note); $event.stopPropagation()" 
              title="Éditer"
            >
              <span class="material-icons">edit</span>
            </button>
            
            <button 
              class="btn-icon btn-danger" 
              (click)="onDeleteNote(note); $event.stopPropagation()" 
              title="Supprimer"
            >
              <span class="material-icons">delete</span>
            </button>
          </div>
        </div>
      } @empty {
        <div class="no-notes">
          <p>Aucune note ne correspond à votre recherche.</p>
        </div>
      }
    </div>
  }
</div>
```

## 4. Styles (`note-list.component.css`)

```css
.note-list-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.list-header .list-title {
  margin: 0;
}

.list-header .actions {
  display: flex;
  gap: 15px;
  align-items: center;
}

.list-header .search-input {
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid #ddd;
  outline: none;
  width: 250px;
  transition: border-color 0.2s;
}

.list-header .search-input:focus {
  border-color: #007bff;
}

.list-header .btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.list-header .btn-primary:hover {
  background-color: #0056b3;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.note-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  position: relative;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border: 2px solid transparent;
}

.note-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
}

.note-card.active-card {
  border-color: #007bff;
}

.note-card .card-content {
  margin-bottom: 15px;
}

.note-card .card-content .note-title {
  margin: 0 0 10px 0;
  font-size: 1.25rem;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-card .card-content .note-category {
  font-size: 0.85rem;
  color: #666;
  background: #f0f2f5;
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  margin-bottom: 10px;
}

.note-card .card-content .note-date {
  font-size: 0.75rem;
  color: #999;
  display: block;
}

.note-card .card-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 5px;
}

.note-card .card-actions .btn-icon {
  background: white;
  border: none;
  cursor: pointer;
  padding: 6px;
  color: #666;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: color 0.2s, background 0.2s;
}

.note-card .card-actions .btn-icon:hover {
  background: #f8f9fa;
  color: #333;
}

.note-card .card-actions .btn-icon.btn-danger:hover {
  color: #dc3545;
  background: #fff5f5;
}

.note-card .card-actions .material-icons {
  font-size: 18px;
}

.no-notes {
  text-align: center;
  padding: 60px;
  color: #888;
  grid-column: 1 / -1;
}

.loading-overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  grid-column: 1 / -1;
}

.loading-overlay .spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```