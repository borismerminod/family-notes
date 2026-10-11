import { Routes } from '@angular/router';
import {NoteList} from './note-list/note-list';
import { NoteEditor } from './note-editor/note-editor';
import { Calendar } from './calendar/calendar';
import { KanbanList } from './kanban-list/kanban-list';
import { KanbanEditor } from './kanban-editor/kanban-editor';

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
    // Liste des tableaux kanban : la saisie du nom se fait dans l'écran d'édition, que « + » et
    // le clic sur une carte ouvrent par les deux routes ci-dessous (D-K3 et D-K9 révisées).
    path: 'kanban',
    component: KanbanList
  },
  {
    // Création d'un tableau : pas de paramètre id → KanbanEditor démarre vierge (D-E8).
    path: 'kanban/new',
    component: KanbanEditor
  },
  {
    // Édition d'un tableau existant : le KanbanEditor lit :id via paramMap (D-E8).
    path: 'kanban/edit/:id',
    component: KanbanEditor
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
