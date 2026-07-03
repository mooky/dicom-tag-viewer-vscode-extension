import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { NoteData } from './common/protocol';

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
  palette: string[];
  contentDrift: boolean;
}

interface StoredNotesFile {
  identityKind: 'sop' | 'hash';
  identityValue: string;
  contentHash: string;
  palette: string[];
  notes: Record<string, NoteData>;
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
    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUriFor(identity));
      const stored = JSON.parse(Buffer.from(bytes).toString('utf8')) as StoredNotesFile;
      return {
        notes: stored.notes ?? {},
        palette: stored.palette && stored.palette.length > 0 ? stored.palette : [...DEFAULT_PALETTE],
        contentDrift: stored.contentHash !== currentContentHash,
      };
    } catch {
      return { notes: {}, palette: [...DEFAULT_PALETTE], contentDrift: false };
    }
  }

  async save(
    identity: FileIdentity,
    currentContentHash: string,
    notes: Record<string, NoteData>,
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
    };
    const bytes = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(this.fileUriFor(identity), bytes);
  }
}
