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

export interface NotesState {
  notes: Record<string, NoteData>;
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
  | { type: 'addPaletteColor'; color: string };
