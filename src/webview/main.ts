import { ExtToWebviewMessage, NoteData, TreeNode, WebviewToExtMessage } from '../common/protocol';

const ROW_HEIGHT = 22;
const GUTTER_TICK_LIMIT = 3;
const FALLBACK_COLOR = '#e06c75';

const vscode = acquireVsCodeApi();

let elements: TreeNode[] | null = null;
let parseError: string | null = null;
const expanded = new Set<string>();
let selectedPath: string | null = null;
let searchQuery = '';
const hexCache = new Map<string, string>();

let notes: Record<string, NoteData> = {};
let palette: string[] = [];
let contentDrift = false;
let notesListVisible = false;
let descendantColorsByNoteKey = new Map<string, string[]>();
let noteKeyToNode = new Map<string, TreeNode>();

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

function locatePathByNoteKey(nodes: TreeNode[], targetKey: string, parentPath: string, ancestorAcc: string[]): string | undefined {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const path = parentPath ? `${parentPath}.${i}` : `${i}`;
    if (node.noteKey === targetKey) {
      return path;
    }
    if (node.items) {
      const found = locatePathByNoteKey(node.items, targetKey, path, ancestorAcc);
      if (found !== undefined) {
        ancestorAcc.push(path);
        return found;
      }
    }
  }
  return undefined;
}

function computeSubtreeColors(nodes: TreeNode[]): Set<string> {
  const union = new Set<string>();
  nodes.forEach((node) => {
    noteKeyToNode.set(node.noteKey, node);
    const childColors = node.items ? computeSubtreeColors(node.items) : new Set<string>();
    descendantColorsByNoteKey.set(node.noteKey, Array.from(childColors));
    const ownColor = notes[node.noteKey]?.color;
    const subtree = new Set(childColors);
    if (ownColor) {
      subtree.add(ownColor);
    }
    subtree.forEach((c) => union.add(c));
  });
  return union;
}

function recomputeNoteIndexes(): void {
  descendantColorsByNoteKey = new Map();
  noteKeyToNode = new Map();
  if (elements) {
    computeSubtreeColors(elements);
  }
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

function renderGutter(row: Row): HTMLElement {
  const gutter = document.createElement('span');
  gutter.className = 'gutter';

  const note = notes[row.node.noteKey];
  if (note) {
    const mark = document.createElement('span');
    mark.className = 'gutter-mark';
    mark.style.backgroundColor = note.color;
    mark.title = note.text;
    gutter.appendChild(mark);
  }

  if (row.hasChildren && !expanded.has(row.path)) {
    const colors = descendantColorsByNoteKey.get(row.node.noteKey) ?? [];
    if (colors.length > 0) {
      colors.slice(0, GUTTER_TICK_LIMIT).forEach((color) => {
        const tick = document.createElement('span');
        tick.className = 'gutter-tick';
        tick.style.backgroundColor = color;
        gutter.appendChild(tick);
      });
      if (colors.length > GUTTER_TICK_LIMIT) {
        const overflow = document.createElement('span');
        overflow.className = 'gutter-overflow';
        overflow.textContent = `+${colors.length - GUTTER_TICK_LIMIT}`;
        gutter.appendChild(overflow);
      }
    }
  }

  return gutter;
}

function renderRow(row: Row): HTMLElement {
  const div = document.createElement('div');
  div.className = 'tree-row' + (row.path === selectedPath ? ' selected' : '');

  div.appendChild(renderGutter(row));

  const indent = document.createElement('span');
  indent.className = 'indent';
  indent.style.width = `${row.depth * 16 + 4}px`;
  div.appendChild(indent);

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

function renderNoteEditor(node: TreeNode, detail: HTMLElement): void {
  const existing = notes[node.noteKey];

  const section = document.createElement('div');
  section.className = 'note-section';

  const title = document.createElement('div');
  title.className = 'detail-label';
  title.textContent = 'Note';
  section.appendChild(title);

  const swatchRow = document.createElement('div');
  swatchRow.className = 'note-swatches';
  let selectedColor = existing?.color ?? palette[0] ?? FALLBACK_COLOR;

  const renderSwatches = (): void => {
    swatchRow.innerHTML = '';
    palette.forEach((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'note-swatch' + (color === selectedColor ? ' selected' : '');
      swatch.style.backgroundColor = color;
      swatch.title = color;
      swatch.addEventListener('click', () => {
        selectedColor = color;
        renderSwatches();
      });
      swatchRow.appendChild(swatch);
    });

    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'note-custom-color';
    customInput.title = 'Add a custom color';
    customInput.value = selectedColor;
    customInput.addEventListener('change', () => {
      selectedColor = customInput.value;
      if (!palette.includes(selectedColor)) {
        postMessage({ type: 'addPaletteColor', color: selectedColor });
      }
      renderSwatches();
    });
    swatchRow.appendChild(customInput);
  };
  renderSwatches();
  section.appendChild(swatchRow);

  const textarea = document.createElement('textarea');
  textarea.className = 'note-text';
  textarea.placeholder = 'Add a note for this tag…';
  textarea.value = existing?.text ?? '';
  section.appendChild(textarea);

  const buttons = document.createElement('div');
  buttons.className = 'note-buttons';
  buttons.appendChild(
    makeButton('Save Note', () => {
      postMessage({ type: 'setNote', noteKey: node.noteKey, color: selectedColor, text: textarea.value });
    }),
  );
  if (existing) {
    buttons.appendChild(
      makeButton('Delete Note', () => {
        postMessage({ type: 'clearNote', noteKey: node.noteKey });
      }),
    );
  }
  section.appendChild(buttons);

  detail.appendChild(section);
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

  renderNoteEditor(node, detail);
}

function renderDriftBanner(): void {
  const banner = document.getElementById('driftBanner')!;
  if (contentDrift) {
    banner.classList.remove('hidden');
    banner.textContent = "This file's content differs from when its notes were saved.";
  } else {
    banner.classList.add('hidden');
  }
}

function renderNotesList(): void {
  const container = document.getElementById('notesList')!;
  container.innerHTML = '';

  const noteKeys = Object.keys(notes);
  if (noteKeys.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notes-list-empty';
    empty.textContent = 'No notes yet.';
    container.appendChild(empty);
    return;
  }

  noteKeys.forEach((noteKey) => {
    const note = notes[noteKey];
    const node = noteKeyToNode.get(noteKey);

    const item = document.createElement('div');
    item.className = 'notes-list-item';

    const swatch = document.createElement('span');
    swatch.className = 'notes-list-swatch';
    swatch.style.backgroundColor = note.color;
    item.appendChild(swatch);

    const label = document.createElement('span');
    label.className = 'notes-list-label';
    const tagLabel = node ? `${node.tag} ${node.name}` : noteKey;
    const excerpt = note.text.split('\n')[0]?.trim();
    label.textContent = excerpt ? `${tagLabel} — ${truncate(excerpt, 60)}` : tagLabel;
    item.appendChild(label);

    item.addEventListener('click', () => jumpToNote(noteKey));
    container.appendChild(item);
  });
}

function jumpToNote(noteKey: string): void {
  if (!elements) {
    return;
  }
  const ancestors: string[] = [];
  const targetPath = locatePathByNoteKey(elements, noteKey, '', ancestors);
  if (targetPath === undefined) {
    return;
  }

  ancestors.forEach((path) => expanded.add(path));
  if (searchQuery.trim().length > 0) {
    searchQuery = '';
    (document.getElementById('search') as HTMLInputElement).value = '';
  }
  selectedPath = targetPath;
  recomputeRowsAndRender();
  renderDetail();

  const index = rows.findIndex((row) => row.path === targetPath);
  if (index >= 0) {
    scrollerEl.scrollTop = Math.max(0, index * ROW_HEIGHT - scrollerEl.clientHeight / 2);
    renderVisibleSlice();
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

function wireNotesToggle(): void {
  const button = document.getElementById('notesToggle') as HTMLButtonElement;
  const panel = document.getElementById('notesList')!;
  button.addEventListener('click', () => {
    notesListVisible = !notesListVisible;
    panel.classList.toggle('hidden', !notesListVisible);
  });
}

window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'model':
      elements = message.elements;
      parseError = null;
      notes = message.notes.notes;
      palette = message.notes.palette;
      contentDrift = message.notes.contentDrift;
      recomputeNoteIndexes();
      renderApp();
      renderDriftBanner();
      renderNotesList();
      break;
    case 'parseError':
      parseError = message.message;
      elements = null;
      renderApp();
      break;
    case 'notesUpdate':
      notes = message.notes.notes;
      palette = message.notes.palette;
      contentDrift = message.notes.contentDrift;
      recomputeNoteIndexes();
      renderTree();
      renderDetail();
      renderDriftBanner();
      renderNotesList();
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
  wireNotesToggle();
  renderDetail();
  renderNotesList();
  postMessage({ type: 'ready' });
});
