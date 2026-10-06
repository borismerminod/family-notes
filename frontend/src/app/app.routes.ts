import { Routes } from '@angular/router';
import {NoteList} from './note-list/note-list';
import { NoteEditor } from './note-editor/note-editor';
import { Calendar } from './calendar/calendar';
import { KanbanList } from './kanban-list/kanban-list';

export const routes: Routes = [
  {
    path: 'calendar/:selectedMonthDate',
    component: Calendar
  },
  {
    path: 'notes',
    component: NoteList
  },
  {
    // Création d'une note : pas de paramètre id → NoteEditor démarre vierge (mode création, D1).
    path: 'notes/new',
    component: NoteEditor
  },
  {
    // Édition d'une note existante : le NoteEditor lit :id via paramMap (D1).
    path: 'notes/edit/:id',
    component: NoteEditor
  },
  {
    // Liste des tableaux kanban : pas de route de création, la saisie du nom se fait en popup (D-K2).
    path: 'kanban',
    component: KanbanList
  },
  {
    path: '',
    redirectTo: 'notes',
    pathMatch: 'full'
  },
  // Redirection pour les routes inconnues (404)
  { 
    path: '**', 
    redirectTo: 'notes' 
  }
];
