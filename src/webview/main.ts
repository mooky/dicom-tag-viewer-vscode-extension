import { ExtToWebviewMessage, TreeNode, WebviewToExtMessage } from '../common/protocol';

const ROW_HEIGHT = 22;

const vscode = acquireVsCodeApi();

let elements: TreeNode[] | null = null;
let parseError: string | null = null;
const expanded = new Set<string>();
let selectedPath: string | null = null;
let searchQuery = '';
const hexCache = new Map<string, string>();

interface Row {
  node: TreeNode;
  path: string;
  depth: number;
  hasChildren: boolean;
}

let rows: Row[] = [];

let scrollerEl: HTMLDivElement;
let spacerEl: HTMLDivElement;
let visibleEl: HTMLDivElement;

function postMessage(message: WebviewToExtMessage): void {
  vscode.postMessage(message);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function nodeMatches(node: TreeNode, query: string): boolean {
  const q = query.toLowerCase();
  return (
    node.tag.toLowerCase().includes(q) ||
    node.name.toLowerCase().includes(q) ||
    (node.value !== undefined && node.value.toLowerCase().includes(q))
  );
}

function computeIncluded(nodes: TreeNode[], parentPath: string, query: string, included: Set<string>): boolean {
  let anyIncluded = false;
  nodes.forEach((node, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`;
    let matched = nodeMatches(node, query);
    if (node.items) {
      const childMatch = computeIncluded(node.items, path, query, included);
      matched = matched || childMatch;
    }
    if (matched) {
      included.add(path);
      anyIncluded = true;
    }
  });
  return anyIncluded;
}

function flatten(nodes: TreeNode[], parentPath: string, depth: number, out: Row[]): void {
  nodes.forEach((node, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`;
    const hasChildren = !!node.items && node.items.length > 0;
    out.push({ node, path, depth, hasChildren });
    if (hasChildren && expanded.has(path)) {
      flatten(node.items!, path, depth + 1, out);
    }
  });
}

function flattenFiltered(nodes: TreeNode[], parentPath: string, depth: number, included: Set<string>, out: Row[]): void {
  nodes.forEach((node, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`;
    if (!included.has(path)) {
      return;
    }
    const hasChildren = !!node.items && node.items.length > 0;
    out.push({ node, path, depth, hasChildren });
    if (hasChildren) {
      flattenFiltered(node.items!, path, depth + 1, included, out);
    }
  });
}

function findNodeByPath(nodes: TreeNode[], path: string): TreeNode | undefined {
  const indices = path.split('.').map(Number);
  let current: TreeNode[] | undefined = nodes;
  let node: TreeNode | undefined;
  for (const idx of indices) {
    if (!current) {
      return undefined;
    }
    node = current[idx];
    if (!node) {
      return undefined;
    }
    current = node.items;
  }
  return node;
}

function recomputeRowsAndRender(): void {
  rows = [];
  if (elements) {
    const query = searchQuery.trim();
    if (query.length > 0) {
      const included = new Set<string>();
      computeIncluded(elements, '', query, included);
      flattenFiltered(elements, '', 0, included, rows);
    } else {
      flatten(elements, '', 0, rows);
    }
  }
  renderTree();
}

function renderRow(row: Row): HTMLElement {
  const div = document.createElement('div');
  div.className = 'tree-row' + (row.path === selectedPath ? ' selected' : '');
  div.style.paddingLeft = `${row.depth * 16 + 4}px`;

  if (row.hasChildren) {
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = expanded.has(row.path) ? '▾' : '▸';
    caret.addEventListener('click', (event) => {
      event.stopPropagation();
      if (searchQuery.trim().length === 0) {
        if (expanded.has(row.path)) {
          expanded.delete(row.path);
        } else {
          expanded.add(row.path);
        }
        recomputeRowsAndRender();
      }
    });
    div.appendChild(caret);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'caret-spacer';
    div.appendChild(spacer);
  }

  const label = document.createElement('span');
  label.className = 'row-label';
  const preview = row.node.value !== undefined ? ` = ${truncate(row.node.value, 60)}` : '';
  const vrPart = row.node.vr ? ` [${row.node.vr}]` : '';
  label.textContent = `${row.node.tag} ${row.node.name}${vrPart}${preview}`;
  div.appendChild(label);

  div.addEventListener('click', () => {
    selectedPath = row.path;
    renderDetail();
    renderVisibleSlice();
  });

  return div;
}

function renderVisibleSlice(): void {
  const scrollTop = scrollerEl.scrollTop;
  const viewportHeight = scrollerEl.clientHeight || 400;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 5);
  visibleEl.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
  visibleEl.innerHTML = '';
  for (let i = start; i < end; i++) {
    visibleEl.appendChild(renderRow(rows[i]));
  }
}

function renderTree(): void {
  spacerEl.style.height = `${rows.length * ROW_HEIGHT}px`;
  renderVisibleSlice();
}

function detailField(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'detail-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'detail-value';
  valueEl.textContent = value;
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function formatHexDump(bytes: Uint8Array, baseOffset: number): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.subarray(i, i + 16);
    const hexPart = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const asciiPart = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('');
    const offsetLabel = (baseOffset + i).toString(16).padStart(8, '0');
    lines.push(`${offsetLabel}  ${hexPart.padEnd(47)}  ${asciiPart}`);
  }
  return lines.join('\n');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function renderDetail(): void {
  const detail = document.getElementById('detail')!;
  detail.innerHTML = '';

  if (!elements || !selectedPath) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = 'Select an element to see details.';
    detail.appendChild(empty);
    return;
  }

  const node = findNodeByPath(elements, selectedPath);
  if (!node) {
    return;
  }

  const title = document.createElement('div');
  title.className = 'detail-title';
  title.textContent = `${node.tag} ${node.name}`;
  detail.appendChild(title);

  detail.appendChild(detailField('VR', node.vr || '—'));
  detail.appendChild(detailField('Length', String(node.length)));

  const tagRow = detailField('Tag', node.tag);
  tagRow.appendChild(makeButton('Copy Tag', () => postMessage({ type: 'copy', text: node.tag })));
  detail.appendChild(tagRow);

  if (node.value !== undefined) {
    const valueRow = detailField('Value', node.value);
    valueRow.appendChild(makeButton('Copy Value', () => postMessage({ type: 'copy', text: node.value! })));
    detail.appendChild(valueRow);
  }

  if (node.binary) {
    const cached = hexCache.get(node.binary.id);
    if (cached) {
      const pre = document.createElement('pre');
      pre.className = 'hex-view';
      pre.textContent = cached;
      detail.appendChild(pre);
    } else {
      const binary = node.binary;
      detail.appendChild(
        makeButton('Load Hex', () => {
          postMessage({ type: 'requestHex', id: binary.id, offset: binary.offset, length: node.length });
        }),
      );
    }
  }
}

function renderApp(): void {
  const mainEl = document.getElementById('main')!;
  const errorEl = document.getElementById('error')!;

  if (parseError) {
    mainEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorEl.textContent = `Unable to display this file: ${parseError}`;
    return;
  }

  mainEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  recomputeRowsAndRender();
  renderDetail();
}

function initTree(): void {
  const container = document.getElementById('tree')!;
  scrollerEl = document.createElement('div');
  scrollerEl.className = 'tree-scroller';
  spacerEl = document.createElement('div');
  spacerEl.className = 'tree-spacer';
  visibleEl = document.createElement('div');
  visibleEl.className = 'tree-visible';
  spacerEl.appendChild(visibleEl);
  scrollerEl.appendChild(spacerEl);
  container.appendChild(scrollerEl);
  scrollerEl.addEventListener('scroll', () => requestAnimationFrame(renderVisibleSlice));
  window.addEventListener('resize', () => renderVisibleSlice());
}

function wireSearchInput(): void {
  const input = document.getElementById('search') as HTMLInputElement;
  input.addEventListener('input', () => {
    searchQuery = input.value;
    recomputeRowsAndRender();
  });
}

window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'model':
      elements = message.elements;
      parseError = null;
      renderApp();
      break;
    case 'parseError':
      parseError = message.message;
      elements = null;
      renderApp();
      break;
    case 'hexChunk': {
      const bytes = base64ToBytes(message.bytes);
      hexCache.set(message.id, formatHexDump(bytes, message.offset));
      renderDetail();
      break;
    }
  }
});

window.addEventListener('DOMContentLoaded', () => {
  initTree();
  wireSearchInput();
  renderDetail();
  postMessage({ type: 'ready' });
});
