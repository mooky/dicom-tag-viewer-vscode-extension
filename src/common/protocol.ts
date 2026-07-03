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
}

export type ExtToWebviewMessage =
  | { type: 'model'; elements: TreeNode[] }
  | { type: 'parseError'; message: string }
  | { type: 'hexChunk'; id: string; offset: number; bytes: string };

export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'requestHex'; id: string; offset: number; length: number };
