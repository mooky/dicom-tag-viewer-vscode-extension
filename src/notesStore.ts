import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { HighlightData, NoteData } from './common/protocol';

export const DEFAULT_PALETTE: readonly string[] = [
  '#e06c75',
  '#e5c07b',
  '#98c379',
  '#56b6c2',
  '#61afef',
  '#c678dd',
];

export interface FileIdentity {
  kind: 'sop' | 'hash';
  value: string;
}

export interface LoadedNotes {
  notes: Record<string, NoteData>;
  highlights: HighlightData[];
  palette: string[];
  contentDrift: boolean;
  /** Content hash recorded with the stored notes, if a notes file existed. */
  storedContentHash?: string;
  /** Set when an existing notes file couldn't be loaded; the caller should surface it to the user. */
  warning?: string;
  /** True when saving would overwrite notes that exist but couldn't be read; the caller must not save. */
  saveBlocked?: boolean;
}

interface StoredNotesFile {
  identityKind: 'sop' | 'hash';
  identityValue: string;
  contentHash: string;
  palette: string[];
  notes: Record<string, NoteData>;
  highlights?: HighlightData[];
}

function parseStoredNotes(text: string): StoredNotesFile {
  const stored: unknown = JSON.parse(text);
  const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const s = stored as Partial<StoredNotesFile>;
  if (
    !isObject(stored) ||
    (s.notes !== undefined && !isObject(s.notes)) ||
    (s.highlights !== undefined && !Array.isArray(s.highlights)) ||
    (s.palette !== undefined && !Array.isArray(s.palette))
  ) {
    throw new Error('notes file has an unexpected structure');
  }
  return stored as StoredNotesFile;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function computeContentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function resolveIdentity(sopInstanceUid: string | undefined, contentHash: string): FileIdentity {
  return sopInstanceUid ? { kind: 'sop', value: sopInstanceUid } : { kind: 'hash', value: contentHash };
}

export class NotesStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private fileUriFor(identity: FileIdentity): vscode.Uri {
    const safeValue = identity.value.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return vscode.Uri.joinPath(this.context.globalStorageUri, 'notes', `${identity.kind}-${safeValue}.json`);
  }

  async load(identity: FileIdentity, currentContentHash: string): Promise<LoadedNotes> {
    const uri = this.fileUriFor(identity);
    const empty: LoadedNotes = { notes: {}, highlights: [], palette: [...DEFAULT_PALETTE], contentDrift: false };
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch (err) {
      if ((err as { code?: unknown } | undefined)?.code === 'FileNotFound') {
        return empty;
      }
      // Possibly transient (e.g. the file is locked by antivirus or sync); don't treat it as corrupt.
      return {
        ...empty,
        saveBlocked: true,
        warning: `Saved notes for this file couldn't be read (${errorMessage(err)}). Changes won't be saved until the file is reopened, so the existing notes aren't overwritten.`,
      };
    }
    try {
      const stored = parseStoredNotes(Buffer.from(bytes).toString('utf8'));
      return {
        notes: stored.notes ?? {},
        highlights: (stored.highlights ?? []).map((h) => ({ ...h, note: h.note ?? '' })),
        palette: stored.palette && stored.palette.length > 0 ? stored.palette : [...DEFAULT_PALETTE],
        contentDrift: stored.contentHash !== currentContentHash,
        storedContentHash: stored.contentHash,
      };
    } catch (err) {
      // Corrupt or malformed: move it aside so the next save doesn't overwrite the user's notes.
      const reason = errorMessage(err);
      const backupUri = uri.with({ path: uri.path.replace(/\.json$/, `.corrupt-${Date.now()}.json`) });
      try {
        await vscode.workspace.fs.rename(uri, backupUri);
        return { ...empty, warning: `Saved notes for this file couldn't be loaded (${reason}); the file was moved to ${backupUri.fsPath}.` };
      } catch (renameErr) {
        return {
          ...empty,
          saveBlocked: true,
          warning: `Saved notes for this file couldn't be loaded (${reason}) or moved aside (${errorMessage(renameErr)}). Changes won't be saved, so ${uri.fsPath} isn't overwritten.`,
        };
      }
    }
  }

  async save(
    identity: FileIdentity,
    currentContentHash: string,
    notes: Record<string, NoteData>,
    highlights: HighlightData[],
    palette: string[],
  ): Promise<void> {
    const dir = vscode.Uri.joinPath(this.context.globalStorageUri, 'notes');
    await vscode.workspace.fs.createDirectory(dir);
    const payload: StoredNotesFile = {
      identityKind: identity.kind,
      identityValue: identity.value,
      contentHash: currentContentHash,
      palette,
      notes,
      highlights,
    };
    const bytes = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(this.fileUriFor(identity), bytes);
  }
}
