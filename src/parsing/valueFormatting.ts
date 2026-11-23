import type { DicomDataSet } from 'dicom-parser';

const BINARY_VRS = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'OV', 'UN']);

export function isBinaryVR(vr: string): boolean {
  return BINARY_VRS.has(vr);
}

export function isSequenceVR(vr: string): boolean {
  return vr === 'SQ';
}

const KNOWN_UIDS: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline (Process 1)',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (Process 2 & 4)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless, Non-Hierarchical (Process 14)',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless, First-Order Prediction (Process 14 [Selection Value 1])',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Image Compression (Lossless Only)',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000 Image Compression',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
  '1.2.840.10008.5.1.4.1.1.1': 'Computed Radiography Image Storage',
  '1.2.840.10008.5.1.4.1.1.2': 'CT Image Storage',
  '1.2.840.10008.5.1.4.1.1.4': 'MR Image Storage',
  '1.2.840.10008.5.1.4.1.1.6.1': 'Ultrasound Image Storage',
  '1.2.840.10008.5.1.4.1.1.7': 'Secondary Capture Image Storage',
  '1.2.840.10008.5.1.4.1.1.20': 'Nuclear Medicine Image Storage',
  '1.2.840.10008.5.1.4.1.1.128': 'Positron Emission Tomography Image Storage',
};

/** Specific Character Set (0008,0005) defined terms mapped to WHATWG encoding labels. */
const CHARSET_ENCODINGS: Record<string, string> = {
  'ISO_IR 100': 'iso-8859-1',
  'ISO_IR 101': 'iso-8859-2',
  'ISO_IR 109': 'iso-8859-3',
  'ISO_IR 110': 'iso-8859-4',
  'ISO_IR 144': 'iso-8859-5',
  'ISO_IR 127': 'iso-8859-6',
  'ISO_IR 126': 'iso-8859-7',
  'ISO_IR 138': 'iso-8859-8',
  'ISO_IR 148': 'iso-8859-9',
  'ISO_IR 203': 'iso-8859-15',
  'ISO_IR 166': 'windows-874',
  'ISO_IR 13': 'shift_jis',
  'ISO_IR 192': 'utf-8',
  GB18030: 'gb18030',
  GBK: 'gbk',
};

/** VRs whose values use the Specific Character Set; all others are always in the default repertoire. */
const CHARSET_TEXT_VRS = new Set(['SH', 'LO', 'ST', 'LT', 'PN', 'UC', 'UT']);

/**
 * Returns a decoder for a Specific Character Set value, or undefined for the default repertoire and for
 * unsupported values. Multi-valued sets (ISO 2022 code extensions switched by escape sequences) aren't
 * supported and fall back to the default byte-per-character decoding.
 */
export function createTextDecoder(specificCharacterSet: string | undefined): TextDecoder | undefined {
  if (!specificCharacterSet) {
    return undefined;
  }
  const terms = specificCharacterSet.split('\\').map((term) => term.trim());
  if (terms.length !== 1) {
    return undefined;
  }
  // A single-valued "ISO 2022 IR n" without escape sequences is equivalent to "ISO_IR n".
  const encoding = CHARSET_ENCODINGS[terms[0].replace(/^ISO 2022 IR /, 'ISO_IR ')];
  if (!encoding) {
    return undefined;
  }
  try {
    return new TextDecoder(encoding);
  } catch {
    return undefined;
  }
}

/** Decodes an element's bytes like dataSet.string() (stop at NUL, trim), but with the given character set. */
function decodeString(dataSet: DicomDataSet, tag: string, length: number, decoder: TextDecoder): string | undefined {
  const element = dataSet.elements[tag];
  if (!element) {
    return undefined;
  }
  const text = decoder.decode(dataSet.byteArray.subarray(element.dataOffset, element.dataOffset + length));
  const nul = text.indexOf('\0');
  return (nul >= 0 ? text.substring(0, nul) : text).trim();
}

function formatDate(raw: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) {
    return raw;
  }
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function formatTime(raw: string): string {
  const match = /^(\d{2})(\d{2})?(\d{2})?(\.\d+)?$/.exec(raw.trim());
  if (!match) {
    return raw;
  }
  const [, hh, mm, ss, frac] = match;
  let result = hh;
  if (mm) result += `:${mm}`;
  if (ss) result += `:${ss}`;
  if (frac) result += frac;
  return result;
}

function formatDateTime(raw: string): string {
  const trimmed = raw.trim();
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(\.\d+)?(.*)$/.exec(trimmed);
  if (!match) {
    return raw;
  }
  const [, year, month, day, hh, mm, ss, frac, rest] = match;
  let result = `${year}-${month}-${day}`;
  if (hh) {
    result += ` ${hh}`;
    if (mm) result += `:${mm}`;
    if (ss) result += `:${ss}`;
    if (frac) result += frac;
  }
  if (rest) result += rest;
  return result;
}

function formatPersonName(raw: string): string {
  const firstRepresentation = raw.split('=')[0];
  const [family, given, middle, prefix, suffix] = firstRepresentation.split('^');
  const parts = [prefix, given, middle, family].filter((part) => part && part.length > 0);
  let result = parts.join(' ');
  if (suffix) {
    result += `, ${suffix}`;
  }
  return result.length > 0 ? result : raw;
}

function formatUid(raw: string): string {
  const trimmed = raw.replace(/\0+$/, '').trim();
  const known = KNOWN_UIDS[trimmed];
  return known ? `${trimmed} (${known})` : trimmed;
}

function formatGenericString(raw: string): string {
  return raw.includes('\\') ? raw.split('\\').join(', ') : raw;
}

const NUMERIC_VR_READERS: Record<string, { bytes: number; read: (ds: DicomDataSet, tag: string, index: number) => number | undefined }> = {
  US: { bytes: 2, read: (ds, tag, i) => ds.uint16(tag, i) },
  SS: { bytes: 2, read: (ds, tag, i) => ds.int16(tag, i) },
  UL: { bytes: 4, read: (ds, tag, i) => ds.uint32(tag, i) },
  SL: { bytes: 4, read: (ds, tag, i) => ds.int32(tag, i) },
  FL: { bytes: 4, read: (ds, tag, i) => ds.float(tag, i) },
  FD: { bytes: 8, read: (ds, tag, i) => ds.double(tag, i) },
};

function formatNumeric(vr: string, dataSet: DicomDataSet, tag: string, length: number): string | undefined {
  const reader = NUMERIC_VR_READERS[vr];
  if (!reader) {
    return undefined;
  }
  const count = Math.max(1, Math.floor(length / reader.bytes));
  const values: string[] = [];
  for (let i = 0; i < count; i++) {
    const value = reader.read(dataSet, tag, i);
    if (value === undefined) {
      break;
    }
    values.push(String(value));
  }
  return values.length > 0 ? values.join(', ') : undefined;
}

function formatBinaryHex(dataSet: DicomDataSet, tag: string, length: number): string | undefined {
  const element = dataSet.elements[tag];
  if (!element) {
    return undefined;
  }
  const bytes = dataSet.byteArray.subarray(element.dataOffset, element.dataOffset + length);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function formatAttributeTags(dataSet: DicomDataSet, tag: string, length: number): string | undefined {
  const values: string[] = [];
  for (let i = 0; i < Math.floor(length / 4); i++) {
    const group = dataSet.uint16(tag, i * 2);
    const element = dataSet.uint16(tag, i * 2 + 1);
    if (group === undefined || element === undefined) {
      break;
    }
    const hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();
    values.push(`(${hex(group)},${hex(element)})`);
  }
  return values.length > 0 ? values.join(', ') : undefined;
}

export function formatValue(
  vr: string,
  dataSet: DicomDataSet,
  tag: string,
  length: number,
  decoder?: TextDecoder,
): string | undefined {
  if (length === 0) {
    return '';
  }

  if (vr in NUMERIC_VR_READERS) {
    return formatNumeric(vr, dataSet, tag, length);
  }

  if (isBinaryVR(vr)) {
    return formatBinaryHex(dataSet, tag, length);
  }

  if (vr === 'AT') {
    return formatAttributeTags(dataSet, tag, length);
  }

  const raw =
    decoder && CHARSET_TEXT_VRS.has(vr) ? decodeString(dataSet, tag, length, decoder) : dataSet.string(tag);
  if (raw === undefined) {
    return undefined;
  }

  switch (vr) {
    case 'DA':
      return formatDate(raw);
    case 'TM':
      return formatTime(raw);
    case 'DT':
      return formatDateTime(raw);
    case 'PN':
      return formatPersonName(raw);
    case 'UI':
      return formatUid(raw);
    // Single-valued text VRs: a backslash is literal text, not a value delimiter (PS3.5 6.2).
    case 'LT':
    case 'ST':
    case 'UT':
    case 'UR':
      return raw;
    default:
      return formatGenericString(raw);
  }
}
