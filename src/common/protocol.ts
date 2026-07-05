export interface BinaryHandle {
  id: string;
  offset: number;
}

export interface TreeNode {
  tag: string;
  name: string;
  vr: string;
  length: number;
  value?: string;
  binary?: BinaryHandle;
  items?: TreeNode[];
  /** Stable tag-id chain (e.g. "(0008,1140)>Item 1>(0008,1150)") used as the note key. */
  noteKey: string;
  /** Link to this tag's DICOM standard reference page, when one could be resolved. */
  referenceUrl?: string;
}

export interface NoteData {
  color: string;
  text: string;
}

/**
 * A named, colored span over a contiguous range of sibling tags (or sequence
 * items). `parentNoteKey` is `''` for a span of top-level elements; otherwise
 * it is the noteKey of the sequence (spanning its Items) or of an Item
 * (spanning its own child tags). `firstChildNoteKey`/`lastChildNoteKey` are
 * the noteKeys of the boundary siblings, resolved to an index range at
 * render time so the span survives re-parses (same drift model as notes).
 */
export interface HighlightData {
  id: string;
  name: string;
  /** Optional free-text note describing the highlight, shown alongside its name. */
  note: string;
  color: string;
  parentNoteKey: string;
  firstChildNoteKey: string;
  lastChildNoteKey: string;
  collapsed: boolean;
}

export interface NotesState {
  notes: Record<string, NoteData>;
  highlights: HighlightData[];
  palette: string[];
  contentDrift: boolean;
}

export type ExtToWebviewMessage =
  | { type: 'model'; elements: TreeNode[]; notes: NotesState }
  | { type: 'parseError'; message: string }
  | { type: 'hexChunk'; id: string; offset: number; bytes: string }
  | { type: 'notesUpdate'; notes: NotesState };

export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'requestHex'; id: string; offset: number; length: number }
  | { type: 'setNote'; noteKey: string; color: string; text: string }
  | { type: 'clearNote'; noteKey: string }
  | { type: 'addPaletteColor'; color: string }
  | {
      type: 'createHighlight';
      parentNoteKey: string;
      firstChildNoteKey: string;
      lastChildNoteKey: string;
      name: string;
      note: string;
      color: string;
    }
  | {
      type: 'updateHighlight';
      id: string;
      name?: string;
      note?: string;
      color?: string;
      firstChildNoteKey?: string;
      lastChildNoteKey?: string;
      collapsed?: boolean;
    }
  | { type: 'deleteHighlight'; id: string };
