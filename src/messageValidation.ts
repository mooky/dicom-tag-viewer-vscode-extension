import { WebviewToExtMessage } from './common/protocol';

/** Colors come from the palette or an <input type="color">, both of which use #rrggbb. */
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Check = (value: unknown) => boolean;

const isString: Check = (v) => typeof v === 'string';
const isColor: Check = (v) => typeof v === 'string' && COLOR_PATTERN.test(v);
const isBoolean: Check = (v) => typeof v === 'boolean';
const isByteCount: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);

const MESSAGE_FIELDS: Record<WebviewToExtMessage['type'], Record<string, Check>> = {
  ready: {},
  copy: { text: isString },
  requestHex: { id: isString, offset: isByteCount, length: isByteCount },
  setNote: { noteKey: isString, color: isColor, text: isString },
  clearNote: { noteKey: isString },
  addPaletteColor: { color: isColor },
  createHighlight: {
    parentNoteKey: isString,
    firstChildNoteKey: isString,
    lastChildNoteKey: isString,
    name: isString,
    note: isString,
    color: isColor,
  },
  updateHighlight: {
    id: isString,
    name: optional(isString),
    note: optional(isString),
    color: optional(isColor),
    firstChildNoteKey: optional(isString),
    lastChildNoteKey: optional(isString),
    collapsed: optional(isBoolean),
  },
  deleteHighlight: { id: isString },
};

/** Checks that a message from the webview has a known type and correctly typed fields before it's acted on or persisted. */
export function isValidWebviewMessage(message: unknown): message is WebviewToExtMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const { type } = message as { type?: unknown };
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(MESSAGE_FIELDS, type)) {
    return false;
  }
  const fields = MESSAGE_FIELDS[type as WebviewToExtMessage['type']];
  return Object.entries(fields).every(([name, check]) => check((message as Record<string, unknown>)[name]));
}
