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

  /**
   * Returns up to `length` bytes at `offset`, clamped to the end of the data (a truncated file's last
   * element can claim more bytes than exist). Undefined if the offset itself is out of range.
   */
  readBytes(offset: number, length: number): Uint8Array | undefined {
    if (offset < 0 || length < 0 || offset >= this.parsedBytes.length) {
      return undefined;
    }
    return this.parsedBytes.subarray(offset, Math.min(offset + length, this.parsedBytes.length));
  }

  dispose(): void {
    // No resources to release; bytes are garbage collected with the document.
  }
}
