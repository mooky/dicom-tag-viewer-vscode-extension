import * as vscode from 'vscode';
import { TreeNode } from './common/protocol';
import { parseDicomFile } from './parsing/parseDicom';

export class DicomDocument implements vscode.CustomDocument {
  private constructor(
    public readonly uri: vscode.Uri,
    private readonly bytes: Uint8Array,
    public readonly elements: TreeNode[] | undefined,
    public readonly error: string | undefined,
  ) {}

  static async open(uri: vscode.Uri): Promise<DicomDocument> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const result = parseDicomFile(bytes);
    return new DicomDocument(uri, bytes, result.elements, result.error);
  }

  readBytes(offset: number, length: number): Uint8Array | undefined {
    if (offset < 0 || length < 0 || offset + length > this.bytes.length) {
      return undefined;
    }
    return this.bytes.subarray(offset, offset + length);
  }

  dispose(): void {
    // No resources to release; bytes are garbage collected with the document.
  }
}
