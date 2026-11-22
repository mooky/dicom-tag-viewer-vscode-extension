import * as vscode from 'vscode';
import { TreeNode } from './common/protocol';
import { parseDicomFile } from './parsing/parseDicom';

export class DicomDocument implements vscode.CustomDocument {
  private constructor(
    public readonly uri: vscode.Uri,
    public readonly bytes: Uint8Array,
    public readonly elements: TreeNode[] | undefined,
    public readonly error: string | undefined,
    public readonly sopInstanceUid: string | undefined,
    /** Bytes that element offsets index into (the inflated stream for deflated files). */
    private readonly parsedBytes: Uint8Array,
    /** Non-fatal parse problem (e.g. truncated file) to surface to the user. */
    public readonly warning: string | undefined,
  ) {}

  static async open(uri: vscode.Uri): Promise<DicomDocument> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const result = parseDicomFile(bytes);
    return new DicomDocument(
      uri,
      bytes,
      result.elements,
      result.error,
      result.sopInstanceUid,
      result.byteArray ?? bytes,
      result.warning,
    );
  }

  readBytes(offset: number, length: number): Uint8Array | undefined {
    if (offset < 0 || length < 0 || offset + length > this.parsedBytes.length) {
      return undefined;
    }
    return this.parsedBytes.subarray(offset, offset + length);
  }

  dispose(): void {
    // No resources to release; bytes are garbage collected with the document.
  }
}
