/**
 * @file note-block.model.ts
 * @description Modèle des blocs composant le contenu d'une note (architecture par blocs).
 *
 * Chaque note est un tableau de blocs indépendants et réordonnables. Chaque bloc porte
 * un `id` (UUID) unique, prérequis de la synchronisation CRDT (cf. PLAN_NOTES.md).
 * L'union discriminée `NoteBlock` reflète le JSON réellement stocké en base
 * (colonne `notes.content`, exemples dans scripts/seed_notes.sql).
 */

import { TextBlockStyle } from './block-style.model';

/** Types de blocs supportés par l'éditeur. */
export type BlockType = 'heading' | 'text' | 'image' | 'video';

/** Champs communs à tous les blocs. */
export interface BaseBlock {
  /** Identifiant unique du bloc (UUID) — utilisé pour la synchronisation CRDT. */
  id: string;
  type: BlockType;
}

/** Bloc titre (h1/h2…). Le `content` peut contenir du HTML de formatage inline. */
export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  content: string;
  style: TextBlockStyle;
}

/** Bloc paragraphe. Le `content` peut contenir du HTML de formatage inline. */
export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  style: TextBlockStyle;
}

/** Bloc image. `src` est le chemin local du fichier (Capacitor Filesystem). */
export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
}

/**
 * Bloc vidéo : soit un lien externe (`url`, YouTube/Vimeo → embed),
 * soit un fichier local (`src`, chemin Capacitor Filesystem).
 */
export interface VideoBlock extends BaseBlock {
  type: 'video';
  url?: string;
  src?: string;
}

/** Union discriminée (sur `type`) de tous les blocs d'une note. */
export type NoteBlock = HeadingBlock | TextBlock | ImageBlock | VideoBlock;

// --- Type guards (utiles pour le rendu dynamique, ex. BlockRenderer) -----------

export function isHeadingBlock(block: NoteBlock): block is HeadingBlock {
  return block.type === 'heading';
}

export function isTextBlock(block: NoteBlock): block is TextBlock {
  return block.type === 'text';
}

export function isImageBlock(block: NoteBlock): block is ImageBlock {
  return block.type === 'image';
}

export function isVideoBlock(block: NoteBlock): block is VideoBlock {
  return block.type === 'video';
}
