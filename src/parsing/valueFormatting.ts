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

export function formatValue(vr: string, dataSet: DicomDataSet, tag: string, length: number): string | undefined {
  if (length === 0) {
    return '';
  }

  if (vr in NUMERIC_VR_READERS) {
    return formatNumeric(vr, dataSet, tag, length);
  }

  const raw = dataSet.string(tag);
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
    default:
      return formatGenericString(raw);
  }
}
