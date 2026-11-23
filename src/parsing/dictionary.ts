import { standardDataElements } from 'dicom-data-dictionary';

export interface DictionaryEntry {
  name: string;
  vr?: string;
}

/** Dictionary keys for repeating-group tags (e.g. "60xx0010" for overlays), where "x" matches any hex digit. */
const REPEATING_GROUP_KEYS = Object.keys(standardDataElements).filter((key) => key.includes('x'));

export function toDictKey(tag: string): string {
  return tag.replace(/^x/i, '').toUpperCase();
}

/** The standard dictionary key for a tag — itself, or its repeating-group pattern — or undefined if not standard. */
export function standardDictKey(tag: string): string | undefined {
  const key = toDictKey(tag);
  if (standardDataElements[key]) {
    return key;
  }
  // Odd groups are private; repeating groups like 60xx only cover even groups (6000-601E).
  if ((parseInt(key.substring(0, 4), 16) & 1) === 1) {
    return undefined;
  }
  return REPEATING_GROUP_KEYS.find(
    (pattern) => pattern.length === key.length && [...pattern].every((c, i) => c === 'x' || c === key[i]),
  );
}

export function formatTagDisplay(tag: string): string {
  const key = toDictKey(tag);
  return `(${key.substring(0, 4)},${key.substring(4, 8)})`;
}

export function lookupTag(tag: string): DictionaryEntry {
  const dictKey = standardDictKey(tag);
  if (dictKey) {
    const entry = standardDataElements[dictKey];
    return { name: entry.name, vr: entry.vr };
  }
  const group = parseInt(toDictKey(tag).substring(0, 4), 16);
  const isPrivate = (group & 1) === 1;
  return { name: isPrivate ? 'Private Tag' : 'Unknown Tag' };
}

/** True only for tags in the standard public dictionary — excludes private and unrecognized tags. */
export function isStandardTag(tag: string): boolean {
  return standardDictKey(tag) !== undefined;
}
