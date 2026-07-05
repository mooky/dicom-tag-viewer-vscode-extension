import { ExtToWebviewMessage, HighlightData, NoteData, TreeNode, WebviewToExtMessage } from '../common/protocol';

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
let noteKeyToPath = new Map<string, string>();

let highlights: HighlightData[] = [];
let highlightsListVisible = false;
let resolvedHighlights: ResolvedHighlight[] = [];
let highlightLaneOf = new Map<string, number>();
let highlightLaneCount = 0;

/** Anchor for shift-click range selection; the last row clicked without shift. */
let highlightAnchorPath: string | null = null;
/** The current (possibly clamped) candidate range for "Create Highlight...". */
let highlightSelection: RawRange | null = null;
let pendingHighlightCreation: RawRange | null = null;
let selectedHighlightId: string | null = null;

interface RawRange {
  parentNoteKey: string;
  startIndex: number;
  endIndex: number;
}

interface ResolvedHighlight {
  data: HighlightData;
  /** Structural path of the parent node; '' for the document root. */
  parentPath: string;
  startIndex: number;
  endIndex: number;
  siblingCount: number;
}

type Row =
  | { kind: 'tag'; node: TreeNode; path: string; depth: number; hasChildren: boolean }
  | { kind: 'highlightHeader'; depth: number; highlight: ResolvedHighlight }
  | { kind: 'spacer'; depth: number };

type TagRow = Extract<Row, { kind: 'tag' }>;

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

function computeIncludedSet(): Set<string> | null {
  const query = searchQuery.trim();
  if (query.length === 0 || !elements) {
    return null;
  }
  const included = new Set<string>();
  computeIncluded(elements, '', query, included);
  return included;
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

function expandAncestorsOfPath(path: string): void {
  const segs = path.split('.');
  for (let i = 1; i < segs.length; i++) {
    expanded.add(segs.slice(0, i).join('.'));
  }
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

function computePaths(nodes: TreeNode[], parentPath: string): void {
  nodes.forEach((node, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`;
    noteKeyToPath.set(node.noteKey, path);
    if (node.items) {
      computePaths(node.items, path);
    }
  });
}

function recomputeNoteIndexes(): void {
  descendantColorsByNoteKey = new Map();
  noteKeyToNode = new Map();
  noteKeyToPath = new Map();
  if (elements) {
    computeSubtreeColors(elements);
    computePaths(elements, '');
  }
  recomputeHighlightResolution();
}

// --- Structural helpers shared by selection, legality, and rendering ---

function childrenForParentNoteKey(parentNoteKey: string): TreeNode[] {
  if (parentNoteKey === '') {
    return elements ?? [];
  }
  return noteKeyToNode.get(parentNoteKey)?.items ?? [];
}

function indexInParentOfPath(path: string): number {
  const idx = path.lastIndexOf('.');
  return Number(idx === -1 ? path : path.slice(idx + 1));
}

function parentNoteKeyOfPath(path: string): string {
  const idx = path.lastIndexOf('.');
  if (idx === -1 || !elements) {
    return '';
  }
  const parentNode = findNodeByPath(elements, path.slice(0, idx));
  return parentNode ? parentNode.noteKey : '';
}

function parentKeyOfNoteKey(noteKey: string): string {
  const idx = noteKey.lastIndexOf('>');
  return idx === -1 ? '' : noteKey.slice(0, idx);
}

/** Walks up from a highlight's parent scope to find the sequence (SQ node) whose terminal-ness gates it. */
function nearestEnclosingSequenceNode(parentNoteKey: string): TreeNode | undefined {
  if (parentNoteKey === '') {
    return undefined;
  }
  const node = noteKeyToNode.get(parentNoteKey);
  if (!node) {
    return undefined;
  }
  if (node.vr === 'SQ') {
    return node;
  }
  const grandKey = parentKeyOfNoteKey(parentNoteKey);
  return grandKey === '' ? undefined : noteKeyToNode.get(grandKey);
}

function hasNestedSQDescendant(node: TreeNode): boolean {
  if (!node.items) {
    return false;
  }
  return node.items.some((child) => child.vr === 'SQ' || hasNestedSQDescendant(child));
}

function isTerminalSequence(sqNode: TreeNode | undefined): boolean {
  if (!sqNode) {
    return true;
  }
  return !hasNestedSQDescendant(sqNode);
}

function applyNonTerminalForceFull(parentNoteKey: string, start: number, end: number, siblingCount: number): [number, number] {
  const enclosing = nearestEnclosingSequenceNode(parentNoteKey);
  if (!isTerminalSequence(enclosing)) {
    return [0, siblingCount - 1];
  }
  return [start, end];
}

function compareDocOrder(a: string, b: string): number {
  const as = a.split('.').map(Number);
  const bs = b.split('.').map(Number);
  const len = Math.min(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    if (as[i] !== bs[i]) {
      return as[i] - bs[i];
    }
  }
  return as.length - bs.length;
}

/** If `path` descends from `parentPath`, returns the index of `path`'s ancestor that is a direct
 * child of `parentPath` (i.e. the "sibling" through which `path` hangs off that parent). */
function childIndexUnderParent(path: string, parentPath: string): number | undefined {
  const pDepth = parentPath === '' ? 0 : parentPath.split('.').length;
  const segs = path.split('.');
  if (segs.length <= pDepth) {
    return undefined;
  }
  const prefix = segs.slice(0, pDepth).join('.');
  if (prefix !== parentPath) {
    return undefined;
  }
  return Number(segs[pDepth]);
}

function computeSelectionRange(anchorPath: string, targetPath: string): RawRange {
  const anchorParent = parentNoteKeyOfPath(anchorPath);
  const targetParent = parentNoteKeyOfPath(targetPath);
  const anchorIndex = indexInParentOfPath(anchorPath);

  let parentNoteKey: string;
  let start: number;
  let end: number;

  if (anchorParent === targetParent) {
    parentNoteKey = anchorParent;
    const targetIndex = indexInParentOfPath(targetPath);
    start = Math.min(anchorIndex, targetIndex);
    end = Math.max(anchorIndex, targetIndex);
  } else {
    parentNoteKey = anchorParent;
    const siblingCount = childrenForParentNoteKey(anchorParent).length;
    // Prefer clamping to the anchor-level sibling the target is actually nested under, rather than
    // blowing past it to the first/last sibling — e.g. shift-clicking deep inside a later sequence
    // should stop at that sequence, not run all the way to the end of the document.
    const targetSiblingIndex = childIndexUnderParent(targetPath, anchorParent);
    if (targetSiblingIndex !== undefined) {
      start = Math.min(anchorIndex, targetSiblingIndex);
      end = Math.max(anchorIndex, targetSiblingIndex);
    } else if (compareDocOrder(targetPath, anchorPath) > 0) {
      start = anchorIndex;
      end = siblingCount - 1;
    } else {
      start = 0;
      end = anchorIndex;
    }
  }

  const siblingCount = childrenForParentNoteKey(parentNoteKey).length;
  [start, end] = applyNonTerminalForceFull(parentNoteKey, start, end, siblingCount);
  return { parentNoteKey, startIndex: start, endIndex: end };
}

function resolveHighlightData(h: HighlightData): ResolvedHighlight | undefined {
  const siblings = childrenForParentNoteKey(h.parentNoteKey);
  const startIndex = siblings.findIndex((n) => n.noteKey === h.firstChildNoteKey);
  const endIndex = siblings.findIndex((n) => n.noteKey === h.lastChildNoteKey);
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return undefined;
  }
  const parentPath = h.parentNoteKey === '' ? '' : noteKeyToPath.get(h.parentNoteKey);
  if (parentPath === undefined) {
    return undefined;
  }
  return { data: h, parentPath, startIndex, endIndex, siblingCount: siblings.length };
}

function recomputeHighlightResolution(): void {
  resolvedHighlights = highlights
    .map((h) => resolveHighlightData(h))
    .filter((rh): rh is ResolvedHighlight => rh !== undefined);
}

function rowCoveredByHighlight(path: string, rh: ResolvedHighlight): boolean {
  const pDepth = rh.parentPath === '' ? 0 : rh.parentPath.split('.').length;
  const segs = path.split('.');
  if (segs.length <= pDepth) {
    return false;
  }
  const prefix = segs.slice(0, pDepth).join('.');
  if (prefix !== rh.parentPath) {
    return false;
  }
  const childIdx = Number(segs[pDepth]);
  return childIdx >= rh.startIndex && childIdx <= rh.endIndex;
}

function pathForHighlightStart(rh: ResolvedHighlight): string {
  return rh.parentPath === '' ? String(rh.startIndex) : `${rh.parentPath}.${rh.startIndex}`;
}

/** Highlights actually rendered on this row: for a tag row, those structurally covering it; for a
 * header row, those covering the position where it was inserted (so an outer highlight's lane
 * still shows through an inner highlight's header). */
function directlyActiveHighlightsAtRow(row: Row): ResolvedHighlight[] {
  if (row.kind === 'tag') {
    return resolvedHighlights.filter((rh) => rowCoveredByHighlight(row.path, rh));
  }
  if (row.kind === 'highlightHeader') {
    const headerPath = pathForHighlightStart(row.highlight);
    return resolvedHighlights.filter((rh) => rowCoveredByHighlight(headerPath, rh));
  }
  return [];
}

/**
 * Assigns each highlight a fixed gutter column ("lane"), stable across every row it spans, so bars
 * read as solid continuous columns (like a git graph) instead of compacting/staggering based on
 * whatever else happens to be active on a given row.
 */
function recomputeHighlightLanes(): void {
  const spans = new Map<string, { first: number; last: number }>();
  rows.forEach((row, index) => {
    directlyActiveHighlightsAtRow(row).forEach((rh) => {
      const span = spans.get(rh.data.id);
      if (span) {
        span.last = index;
      } else {
        spans.set(rh.data.id, { first: index, last: index });
      }
    });
  });

  const ordered = resolvedHighlights
    .map((rh) => ({ id: rh.data.id, span: spans.get(rh.data.id) }))
    .filter((entry): entry is { id: string; span: { first: number; last: number } } => entry.span !== undefined)
    .sort((a, b) => a.span.first - b.span.first);

  const laneFreeAt: number[] = [];
  highlightLaneOf = new Map();
  ordered.forEach(({ id, span }) => {
    let lane = laneFreeAt.findIndex((freeAt) => freeAt <= span.first);
    if (lane === -1) {
      lane = laneFreeAt.length;
      laneFreeAt.push(0);
    }
    laneFreeAt[lane] = span.last + 1;
    highlightLaneOf.set(id, lane);
  });
  highlightLaneCount = laneFreeAt.length;
}

function highlightMatchesFilter(rh: ResolvedHighlight, included: Set<string> | null): boolean {
  if (!included) {
    return true;
  }
  for (let idx = rh.startIndex; idx <= rh.endIndex; idx++) {
    const path = rh.parentPath === '' ? String(idx) : `${rh.parentPath}.${idx}`;
    if (included.has(path)) {
      return true;
    }
  }
  return false;
}

function extendHighlight(rh: ResolvedHighlight, newIndex: number): void {
  const siblings = childrenForParentNoteKey(rh.data.parentNoteKey);
  let start = Math.min(rh.startIndex, newIndex);
  let end = Math.max(rh.endIndex, newIndex);
  [start, end] = applyNonTerminalForceFull(rh.data.parentNoteKey, start, end, siblings.length);
  postMessage({
    type: 'updateHighlight',
    id: rh.data.id,
    firstChildNoteKey: siblings[start].noteKey,
    lastChildNoteKey: siblings[end].noteKey,
  });
}

function shrinkHighlight(rh: ResolvedHighlight, removedIndex: number): void {
  const siblings = childrenForParentNoteKey(rh.data.parentNoteKey);
  let start = rh.startIndex;
  let end = rh.endIndex;
  if (removedIndex === start) {
    start += 1;
  } else if (removedIndex === end) {
    end -= 1;
  }
  if (start > end) {
    return;
  }
  postMessage({
    type: 'updateHighlight',
    id: rh.data.id,
    firstChildNoteKey: siblings[start].noteKey,
    lastChildNoteKey: siblings[end].noteKey,
  });
}

// --- Row flattening (tag rows + synthetic highlight header/spacer rows) ---

function flattenLevel(nodes: TreeNode[], parentPath: string, depth: number, included: Set<string> | null, out: Row[]): void {
  const levelHighlights = resolvedHighlights.filter((rh) => rh.parentPath === parentPath && highlightMatchesFilter(rh, included));
  let prevWasHighlightEnd = false;

  for (let index = 0; index < nodes.length; index++) {
    const startingHere = levelHighlights.filter((rh) => rh.startIndex === index);
    if (startingHere.length > 0) {
      if (prevWasHighlightEnd) {
        out.push({ kind: 'spacer', depth });
      }
      startingHere.forEach((rh) => out.push({ kind: 'highlightHeader', depth, highlight: rh }));
    }

    const collapsedCovering = levelHighlights.find((rh) => rh.data.collapsed && index >= rh.startIndex && index <= rh.endIndex);
    if (collapsedCovering) {
      prevWasHighlightEnd = index === collapsedCovering.endIndex;
      continue;
    }

    const node = nodes[index];
    const path = parentPath ? `${parentPath}.${index}` : `${index}`;
    if (included && !included.has(path)) {
      prevWasHighlightEnd = false;
      continue;
    }

    const hasChildren = !!node.items && node.items.length > 0;
    out.push({ kind: 'tag', node, path, depth, hasChildren });
    if (hasChildren && expanded.has(path)) {
      flattenLevel(node.items!, path, depth + 1, included, out);
    }

    prevWasHighlightEnd = levelHighlights.some((rh) => rh.endIndex === index);
  }
}

function recomputeRowsAndRender(): void {
  rows = [];
  if (elements) {
    flattenLevel(elements, '', 0, computeIncludedSet(), rows);
  }
  recomputeHighlightLanes();
  renderTree();
}

// --- Gutter rendering ---

function renderGutter(row: TagRow): HTMLElement {
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

function renderHighlightGutter(active: ResolvedHighlight[]): HTMLElement {
  const gutter = document.createElement('span');
  gutter.className = 'highlight-gutter';

  const byLane = new Map<number, ResolvedHighlight>();
  active.forEach((rh) => {
    const lane = highlightLaneOf.get(rh.data.id);
    if (lane !== undefined) {
      byLane.set(lane, rh);
    }
  });

  for (let lane = 0; lane < highlightLaneCount; lane++) {
    const cell = document.createElement('span');
    cell.className = 'highlight-lane';
    const rh = byLane.get(lane);
    if (rh) {
      cell.classList.add('highlight-bar');
      cell.style.backgroundColor = rh.data.color;
      cell.title = rh.data.name;
    }
    gutter.appendChild(cell);
  }
  return gutter;
}

// --- Context menu ---

function closeContextMenu(): void {
  document.getElementById('treeContextMenu')?.remove();
  document.removeEventListener('click', closeContextMenu);
}

function addMenuItem(menu: HTMLElement, label: string, onClick: () => void): void {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.textContent = label;
  item.addEventListener('click', () => {
    onClick();
    closeContextMenu();
  });
  menu.appendChild(item);
}

function showTreeContextMenu(event: MouseEvent, row: TagRow): void {
  closeContextMenu();
  const index = indexInParentOfPath(row.path);
  const parentKey = parentNoteKeyOfPath(row.path);

  const menu = document.createElement('div');
  menu.id = 'treeContextMenu';
  menu.className = 'context-menu';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  if (highlightSelection) {
    addMenuItem(menu, 'Create Highlight…', () => {
      pendingHighlightCreation = highlightSelection;
      selectedHighlightId = null;
      renderDetail();
    });
  }

  resolvedHighlights.forEach((rh) => {
    if (rh.data.parentNoteKey !== parentKey) {
      return;
    }
    const terminal = isTerminalSequence(nearestEnclosingSequenceNode(rh.data.parentNoteKey));
    if (!terminal) {
      return;
    }
    if (index === rh.endIndex + 1 || index === rh.startIndex - 1) {
      addMenuItem(menu, `Add to "${rh.data.name}"`, () => extendHighlight(rh, index));
    }
    if ((index === rh.startIndex || index === rh.endIndex) && rh.endIndex > rh.startIndex) {
      addMenuItem(menu, `Remove from "${rh.data.name}"`, () => shrinkHighlight(rh, index));
    }
  });

  if (menu.childElementCount === 0) {
    addMenuItem(menu, 'No highlight actions here', () => {});
  }

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeContextMenu), 0);
}

// --- Row rendering ---

function renderTagRow(row: TagRow): HTMLElement {
  const div = document.createElement('div');
  const active = directlyActiveHighlightsAtRow(row);
  const inPendingSelection =
    highlightSelection !== null &&
    parentNoteKeyOfPath(row.path) === highlightSelection.parentNoteKey &&
    indexInParentOfPath(row.path) >= highlightSelection.startIndex &&
    indexInParentOfPath(row.path) <= highlightSelection.endIndex;

  div.className =
    'tree-row' +
    (row.path === selectedPath ? ' selected' : '') +
    (inPendingSelection ? ' pending-selection' : '') +
    (active.length > 0 ? ' highlight-wash' : '');
  if (active.length > 0) {
    // Most specific (narrowest span) wins the background wash, so a small highlight nested inside
    // a broad one is the one that visually reads on its rows.
    const mostSpecific = active.reduce((best, rh) =>
      rh.endIndex - rh.startIndex < best.endIndex - best.startIndex ? rh : best,
    );
    div.style.setProperty('--row-wash', mostSpecific.data.color);
  }

  div.appendChild(renderGutter(row));
  div.appendChild(renderHighlightGutter(active));

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

  div.addEventListener('click', (event: MouseEvent) => {
    if (event.shiftKey && highlightAnchorPath) {
      highlightSelection = computeSelectionRange(highlightAnchorPath, row.path);
    } else {
      highlightAnchorPath = row.path;
      highlightSelection = {
        parentNoteKey: parentNoteKeyOfPath(row.path),
        startIndex: indexInParentOfPath(row.path),
        endIndex: indexInParentOfPath(row.path),
      };
      selectedPath = row.path;
      selectedHighlightId = null;
      pendingHighlightCreation = null;
      renderDetail();
    }
    renderVisibleSlice();
  });

  div.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showTreeContextMenu(event, row);
  });

  return div;
}

function renderHighlightHeaderRow(row: Extract<Row, { kind: 'highlightHeader' }>): HTMLElement {
  const rh = row.highlight;
  const div = document.createElement('div');
  div.className = 'tree-row highlight-header-row' + (rh.data.id === selectedHighlightId ? ' selected' : '');

  const emptyGutter = document.createElement('span');
  emptyGutter.className = 'gutter';
  div.appendChild(emptyGutter);
  div.appendChild(renderHighlightGutter(directlyActiveHighlightsAtRow(row)));

  const indent = document.createElement('span');
  indent.className = 'indent';
  indent.style.width = `${row.depth * 16 + 4}px`;
  div.appendChild(indent);

  const collapseToggle = document.createElement('span');
  collapseToggle.className = 'caret';
  collapseToggle.textContent = rh.data.collapsed ? '▸' : '▾';
  collapseToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    postMessage({ type: 'updateHighlight', id: rh.data.id, collapsed: !rh.data.collapsed });
  });
  div.appendChild(collapseToggle);

  const chip = document.createElement('span');
  chip.className = 'highlight-chip';
  chip.style.backgroundColor = rh.data.color;
  div.appendChild(chip);

  const count = rh.endIndex - rh.startIndex + 1;
  const label = document.createElement('span');
  label.className = 'highlight-header-label';
  label.textContent = rh.data.collapsed ? `${rh.data.name} (${count} tag${count === 1 ? '' : 's'})` : rh.data.name;
  if (rh.data.note) {
    label.title = rh.data.note;
  }
  div.appendChild(label);

  const deleteBtn = document.createElement('span');
  deleteBtn.className = 'highlight-delete';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Delete highlight';
  deleteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    postMessage({ type: 'deleteHighlight', id: rh.data.id });
  });
  div.appendChild(deleteBtn);

  div.addEventListener('click', () => {
    selectedHighlightId = rh.data.id;
    selectedPath = null;
    pendingHighlightCreation = null;
    renderDetail();
    renderVisibleSlice();
  });

  return div;
}

function renderSpacerRow(_row: Extract<Row, { kind: 'spacer' }>): HTMLElement {
  const div = document.createElement('div');
  div.className = 'tree-row-spacer';
  return div;
}

function renderRow(row: Row): HTMLElement {
  if (row.kind === 'spacer') {
    return renderSpacerRow(row);
  }
  if (row.kind === 'highlightHeader') {
    return renderHighlightHeaderRow(row);
  }
  return renderTagRow(row);
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

/** Reused by the note editor and the highlight create/edit forms (shared per-file palette). */
function renderSwatchPicker(initialColor: string, onSelect: (color: string) => void): HTMLElement {
  const swatchRow = document.createElement('div');
  swatchRow.className = 'note-swatches';
  let selectedColor = initialColor;

  const render = (): void => {
    swatchRow.innerHTML = '';
    palette.forEach((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'note-swatch' + (color === selectedColor ? ' selected' : '');
      swatch.style.backgroundColor = color;
      swatch.title = color;
      swatch.addEventListener('click', () => {
        selectedColor = color;
        onSelect(color);
        render();
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
      onSelect(selectedColor);
      render();
    });
    swatchRow.appendChild(customInput);
  };
  render();
  return swatchRow;
}

function renderNoteEditor(node: TreeNode, detail: HTMLElement): void {
  const existing = notes[node.noteKey];

  const section = document.createElement('div');
  section.className = 'note-section';

  const title = document.createElement('div');
  title.className = 'detail-label';
  title.textContent = 'Note';
  section.appendChild(title);

  let selectedColor = existing?.color ?? palette[0] ?? FALLBACK_COLOR;
  section.appendChild(
    renderSwatchPicker(selectedColor, (color) => {
      selectedColor = color;
    }),
  );

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

function renderHighlightCreateForm(range: RawRange, detail: HTMLElement): void {
  const siblings = childrenForParentNoteKey(range.parentNoteKey);
  const count = range.endIndex - range.startIndex + 1;

  const section = document.createElement('div');
  section.className = 'note-section';

  const title = document.createElement('div');
  title.className = 'detail-title';
  title.textContent = `Create Highlight (${count} tag${count === 1 ? '' : 's'})`;
  section.appendChild(title);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'note-text highlight-name-input';
  nameInput.placeholder = 'Highlight name';
  section.appendChild(nameInput);

  let selectedColor = palette[0] ?? FALLBACK_COLOR;
  section.appendChild(
    renderSwatchPicker(selectedColor, (color) => {
      selectedColor = color;
    }),
  );

  const noteInput = document.createElement('textarea');
  noteInput.className = 'note-text';
  noteInput.placeholder = 'Add a note for this highlight…';
  section.appendChild(noteInput);

  const buttons = document.createElement('div');
  buttons.className = 'note-buttons';
  buttons.appendChild(
    makeButton('Create Highlight', () => {
      const name = nameInput.value.trim() || 'Highlight';
      postMessage({
        type: 'createHighlight',
        parentNoteKey: range.parentNoteKey,
        firstChildNoteKey: siblings[range.startIndex].noteKey,
        lastChildNoteKey: siblings[range.endIndex].noteKey,
        name,
        note: noteInput.value,
        color: selectedColor,
      });
      pendingHighlightCreation = null;
      renderDetail();
    }),
  );
  buttons.appendChild(
    makeButton('Cancel', () => {
      pendingHighlightCreation = null;
      renderDetail();
    }),
  );
  section.appendChild(buttons);

  detail.appendChild(section);
}

function renderHighlightEditor(rh: ResolvedHighlight, detail: HTMLElement): void {
  const section = document.createElement('div');
  section.className = 'note-section';

  const title = document.createElement('div');
  title.className = 'detail-title';
  title.textContent = 'Edit Highlight';
  section.appendChild(title);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'note-text highlight-name-input';
  nameInput.value = rh.data.name;
  section.appendChild(nameInput);

  let selectedColor = rh.data.color;
  section.appendChild(
    renderSwatchPicker(selectedColor, (color) => {
      selectedColor = color;
    }),
  );

  const noteInput = document.createElement('textarea');
  noteInput.className = 'note-text';
  noteInput.placeholder = 'Add a note for this highlight…';
  noteInput.value = rh.data.note;
  section.appendChild(noteInput);

  const buttons = document.createElement('div');
  buttons.className = 'note-buttons';
  buttons.appendChild(
    makeButton('Save', () => {
      postMessage({
        type: 'updateHighlight',
        id: rh.data.id,
        name: nameInput.value.trim() || rh.data.name,
        note: noteInput.value,
        color: selectedColor,
      });
    }),
  );
  buttons.appendChild(
    makeButton('Delete Highlight', () => {
      postMessage({ type: 'deleteHighlight', id: rh.data.id });
      selectedHighlightId = null;
      renderDetail();
    }),
  );
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

  if (pendingHighlightCreation) {
    renderHighlightCreateForm(pendingHighlightCreation, detail);
    return;
  }

  if (selectedHighlightId) {
    const rh = resolvedHighlights.find((r) => r.data.id === selectedHighlightId);
    if (rh) {
      renderHighlightEditor(rh, detail);
      return;
    }
  }

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

  if (node.referenceUrl) {
    const referenceRow = document.createElement('div');
    referenceRow.className = 'detail-field';
    const link = document.createElement('a');
    link.href = node.referenceUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'View in DICOM Standard';
    referenceRow.appendChild(link);
    detail.appendChild(referenceRow);
  }

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

function renderHighlightsList(): void {
  const container = document.getElementById('highlightsList')!;
  container.innerHTML = '';

  if (highlights.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notes-list-empty';
    empty.textContent = 'No highlights yet.';
    container.appendChild(empty);
    return;
  }

  highlights.forEach((h) => {
    const item = document.createElement('div');
    item.className = 'notes-list-item';

    const swatch = document.createElement('span');
    swatch.className = 'notes-list-swatch';
    swatch.style.backgroundColor = h.color;
    item.appendChild(swatch);

    const label = document.createElement('span');
    label.className = 'notes-list-label';
    label.textContent = h.name;
    item.appendChild(label);

    item.addEventListener('click', () => jumpToHighlight(h.id));
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
  selectedHighlightId = null;
  recomputeRowsAndRender();
  renderDetail();

  const index = rows.findIndex((row) => row.kind === 'tag' && row.path === targetPath);
  if (index >= 0) {
    scrollerEl.scrollTop = Math.max(0, index * ROW_HEIGHT - scrollerEl.clientHeight / 2);
    renderVisibleSlice();
  }
}

function jumpToHighlight(id: string): void {
  const rh = resolvedHighlights.find((r) => r.data.id === id);
  if (!rh) {
    return;
  }
  const memberPath = rh.parentPath === '' ? String(rh.startIndex) : `${rh.parentPath}.${rh.startIndex}`;
  expandAncestorsOfPath(memberPath);
  if (searchQuery.trim().length > 0) {
    searchQuery = '';
    (document.getElementById('search') as HTMLInputElement).value = '';
  }
  selectedHighlightId = id;
  selectedPath = null;
  recomputeRowsAndRender();
  renderDetail();

  let index = rows.findIndex((row) => row.kind === 'highlightHeader' && row.highlight.data.id === id);
  if (index === -1) {
    index = rows.findIndex((row) => row.kind === 'tag' && row.path === memberPath);
  }
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

function wireHighlightsToggle(): void {
  const button = document.getElementById('highlightsToggle') as HTMLButtonElement;
  const panel = document.getElementById('highlightsList')!;
  button.addEventListener('click', () => {
    highlightsListVisible = !highlightsListVisible;
    panel.classList.toggle('hidden', !highlightsListVisible);
  });
}

window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'model':
      elements = message.elements;
      parseError = null;
      notes = message.notes.notes;
      highlights = message.notes.highlights;
      palette = message.notes.palette;
      contentDrift = message.notes.contentDrift;
      recomputeNoteIndexes();
      renderApp();
      renderDriftBanner();
      renderNotesList();
      renderHighlightsList();
      break;
    case 'parseError':
      parseError = message.message;
      elements = null;
      renderApp();
      break;
    case 'notesUpdate':
      notes = message.notes.notes;
      highlights = message.notes.highlights;
      palette = message.notes.palette;
      contentDrift = message.notes.contentDrift;
      recomputeNoteIndexes();
      recomputeRowsAndRender();
      renderDetail();
      renderDriftBanner();
      renderNotesList();
      renderHighlightsList();
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
  wireHighlightsToggle();
  renderDetail();
  renderNotesList();
  renderHighlightsList();
  postMessage({ type: 'ready' });
});
