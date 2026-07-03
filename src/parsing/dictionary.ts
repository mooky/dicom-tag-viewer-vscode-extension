import { standardDataElements } from 'dicom-data-dictionary';

export interface DictionaryEntry {
  name: string;
  vr?: string;
}

function toDictKey(tag: string): string {
  return tag.replace(/^x/i, '').toUpperCase();
}

export function formatTagDisplay(tag: string): string {
  const key = toDictKey(tag);
  return `(${key.substring(0, 4)},${key.substring(4, 8)})`;
}

export function lookupTag(tag: string): DictionaryEntry {
  const key = toDictKey(tag);
  const entry = standardDataElements[key];
  if (entry) {
    return { name: entry.name, vr: entry.vr };
  }
  const group = parseInt(key.substring(0, 4), 16);
  const isPrivate = (group & 1) === 1;
  return { name: isPrivate ? 'Private Tag' : 'Unknown Tag' };
}
