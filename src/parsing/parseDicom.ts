import { inflateRawSync } from 'zlib';
import * as dicomParser from 'dicom-parser';
import type { DicomDataSet } from 'dicom-parser';
import { TreeNode } from '../common/protocol';
import { formatTagDisplay, isStandardTag, lookupTag, standardDictKey, toDictKey } from './dictionary';
import { resolveReferenceUrl } from './dicomStandardReference';
import { createTextDecoder, formatValue, isBinaryVR } from './valueFormatting';

const INLINE_BINARY_MAX_LENGTH = 64;
const PIXEL_DATA_TAG = 'x7fe00010';
const ITEM_TAG_DISPLAY = '(FFFE,E000)';
const SOP_INSTANCE_UID_TAG = 'x00080018';
const SOP_CLASS_UID_TAG = 'x00080016';
const SPECIFIC_CHARACTER_SET_TAG = 'x00080005';
const PIXEL_REPRESENTATION_TAG = 'x00280103';
/** Cap on the inflated size of a Deflated Explicit VR Little Endian dataset, so a deflate bomb can't exhaust memory. */
const MAX_INFLATED_BYTES = 512 * 1024 * 1024;
const DEFLATED_TRANSFER_SYNTAX = '1.2.840.10008.1.2.1.99';
/** Placeholder element written over the preamble of an inflated buffer; group 0001 is illegal in DICOM. */
const HEADER_SKIP_GROUP = 0x0001;
const HEADER_SKIP_ELEMENT = 0x0000;
const HEADER_SKIP_TAG = 'x00010000';

export interface ParseResult {
  elements?: TreeNode[];
  error?: string;
  sopInstanceUid?: string;
  sopClassUid?: string;
  /** The bytes element offsets refer to — differs from the file bytes for deflated transfer syntaxes. */
  byteArray?: Uint8Array;
  /** Set when the file could only be partially parsed (e.g. truncated); `elements` holds what was read. */
  warning?: string;
}

export function parseDicomFile(bytes: Uint8Array): ParseResult {
  let dataSet: DicomDataSet;
  let warning: string | undefined;
  try {
    dataSet = dicomParser.parseDicom(bytes, { inflater: boundedInflater });
  } catch (err) {
    // dicom-parser throws { exception, dataSet } when the dataset fails partway (e.g. a truncated file).
    const partial = isPartialParseError(err) ? err.dataSet : undefined;
    if (!partial || Object.keys(partial.elements).length === 0) {
      return { error: `Unable to parse file as DICOM: ${errorMessage(err)}` };
    }
    dataSet = partial;
    mergeMetaHeader(bytes, dataSet);
    warning = `File could only be partially parsed; showing the elements read before the error: ${errorMessage(err)}`;
  }
  if (dataSet.elements.x00020010 && readTrimmedString(dataSet, 'x00020010') === DEFLATED_TRANSFER_SYNTAX) {
    delete dataSet.elements[HEADER_SKIP_TAG];
  }

  try {
    const binaryIdState = { counter: 0 };
    const sopClassUid = readTrimmedString(dataSet, SOP_CLASS_UID_TAG);
    const decoder = createTextDecoder(dataSet.string(SPECIFIC_CHARACTER_SET_TAG));
    const pixelRepresentation = dataSet.uint16(PIXEL_REPRESENTATION_TAG);
    const elements = buildNodes(dataSet, binaryIdState, '', [], sopClassUid, decoder, pixelRepresentation);
    return {
      elements,
      sopInstanceUid: readTrimmedString(dataSet, SOP_INSTANCE_UID_TAG),
      sopClassUid,
      byteArray: dataSet.byteArray,
      warning,
    };
  } catch (err) {
    return { error: `Parsed DICOM meta information but failed to build the tag tree: ${errorMessage(err)}` };
  }
}

/**
 * Replaces dicom-parser's built-in Node inflater, which is unbounded and calls Buffer#copy on the
 * input (failing when it's a plain Uint8Array). Returns the header bytes followed by the inflated dataset.
 */
function boundedInflater(byteArray: Uint8Array, position: number): Uint8Array {
  let inflated: Uint8Array;
  try {
    inflated = inflateRawSync(byteArray.subarray(position), { maxOutputLength: MAX_INFLATED_BYTES });
  } catch (err) {
    if (err instanceof RangeError) {
      throw new Error(`deflated dataset inflates to more than ${MAX_INFLATED_BYTES / (1024 * 1024)} MiB`);
    }
    throw err;
  }
  const full = new Uint8Array(position + inflated.length);
  full.set(byteArray.subarray(0, position), 0);
  full.set(inflated, position);
  writeHeaderSkipElement(full, position);
  return full;
}

/**
 * dicom-parser parses a custom inflater's result from offset 0 rather than from the end of the header,
 * so the preamble, "DICM" prefix and meta group would be parsed again as dataset elements (junk tags
 * like (0000,0000) and (4944,4D43)). Overwrite the preamble with one explicit-VR OB element whose
 * value spans the rest of the header, so the parser skips straight to the dataset. The preamble and
 * prefix bytes aren't needed: meta element values live after them and are left intact.
 */
function writeHeaderSkipElement(full: Uint8Array, position: number): void {
  const view = new DataView(full.buffer, full.byteOffset, full.byteLength);
  view.setUint16(0, HEADER_SKIP_GROUP, true);
  view.setUint16(2, HEADER_SKIP_ELEMENT, true);
  full[4] = 0x4f; // 'O'
  full[5] = 0x42; // 'B'
  view.setUint16(6, 0, true);
  view.setUint32(8, position - 12, true);
}

/**
 * Picks a VR for an implicit-VR element from its dictionary entry. For "US|SS" tags (pixel value ranges,
 * LUT descriptors) the choice follows Pixel Representation (0028,0103): 1 means signed. Other multi-VR
 * entries take the first option.
 */
function implicitVr(tag: string, dictVr: string | undefined, pixelRepresentation: number | undefined): string {
  if (!dictVr) {
    return isPrivateCreator(tag) ? 'LO' : 'UN';
  }
  const options = dictVr.split('|');
  if (pixelRepresentation === 1 && options.includes('US') && options.includes('SS')) {
    return 'SS';
  }
  return options[0];
}

/** Private Creator elements, (gggg,0010)-(gggg,00FF) in an odd group, are LO by definition (PS3.5 7.8.1). */
function isPrivateCreator(tag: string): boolean {
  const key = toDictKey(tag);
  const group = parseInt(key.substring(0, 4), 16);
  const element = parseInt(key.substring(4, 8), 16);
  return (group & 1) === 1 && element >= 0x0010 && element <= 0x00ff;
}

function readTrimmedString(dataSet: DicomDataSet, tag: string): string | undefined {
  const raw = dataSet.string(tag);
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.replace(/\0+$/, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPartialParseError(err: unknown): err is { exception: unknown; dataSet: DicomDataSet } {
  return typeof err === 'object' && err !== null && 'exception' in err && 'dataSet' in err;
}

/** A partial dataset from dicom-parser lacks the file meta group (merged only on success); add it back. */
function mergeMetaHeader(bytes: Uint8Array, dataSet: DicomDataSet): void {
  try {
    const meta = dicomParser.readPart10Header(bytes);
    Object.assign(dataSet.elements, meta.elements);
  } catch {
    // Meta header unreadable; show the partial dataset without it.
  }
}

function errorMessage(err: unknown): string {
  if (isPartialParseError(err)) {
    return errorMessage(err.exception);
  }
  return err instanceof Error ? err.message : String(err);
}

function nextBinaryId(state: { counter: number }): string {
  return `bin${state.counter++}`;
}

function buildNodes(
  dataSet: DicomDataSet,
  binaryIdState: { counter: number },
  parentChain: string,
  hexChainPrefix: string[],
  sopClassUid: string | undefined,
  decoder: TextDecoder | undefined,
  pixelRepresentation: number | undefined,
): TreeNode[] {
  const tags = Object.keys(dataSet.elements).sort();
  return tags.map((tag) =>
    buildNode(dataSet, tag, binaryIdState, parentChain, hexChainPrefix, sopClassUid, decoder, pixelRepresentation),
  );
}

function buildNode(
  dataSet: DicomDataSet,
  tag: string,
  binaryIdState: { counter: number },
  parentChain: string,
  hexChainPrefix: string[],
  sopClassUid: string | undefined,
  decoder: TextDecoder | undefined,
  pixelRepresentation: number | undefined,
): TreeNode {
  const element = dataSet.elements[tag];
  const dictEntry = lookupTag(tag);
  const rawVr = element.vr ?? implicitVr(tag, dictEntry.vr, pixelRepresentation);
  const displayTag = formatTagDisplay(tag);
  const name = dictEntry.name;
  const noteKey = parentChain ? `${parentChain}>${displayTag}` : displayTag;
  // Repeating-group tags (e.g. overlays) are keyed by their "60xx0010"-style pattern in the reference data.
  const hexChain = [...hexChainPrefix, standardDictKey(tag) ?? toDictKey(tag)];
  const referenceUrl = isStandardTag(tag) ? resolveReferenceUrl(sopClassUid, hexChain) : undefined;

  if (rawVr === 'SQ') {
    const items: TreeNode[] = (element.items ?? []).map((item, index) => {
      const itemKey = `${noteKey}>Item ${index}`;
      // An item may declare its own Specific Character Set; otherwise it inherits its parent's.
      const itemDecoder = item.dataSet.elements[SPECIFIC_CHARACTER_SET_TAG]
        ? createTextDecoder(item.dataSet.string(SPECIFIC_CHARACTER_SET_TAG))
        : decoder;
      const itemPixelRepresentation = item.dataSet.uint16(PIXEL_REPRESENTATION_TAG) ?? pixelRepresentation;
      return {
        tag: ITEM_TAG_DISPLAY,
        name: `Item ${index}`,
        vr: '',
        length: item.length,
        items: buildNodes(
          item.dataSet,
          binaryIdState,
          itemKey,
          hexChain,
          sopClassUid,
          itemDecoder,
          itemPixelRepresentation,
        ),
        noteKey: itemKey,
      };
    });
    return { tag: displayTag, name, vr: rawVr, length: element.length, items, noteKey, referenceUrl };
  }

  const isPixelData = tag.toLowerCase() === PIXEL_DATA_TAG;
  const treatAsBinary = isBinaryVR(rawVr) && (isPixelData || element.length > INLINE_BINARY_MAX_LENGTH);

  if (treatAsBinary) {
    return {
      tag: displayTag,
      name,
      vr: rawVr,
      length: element.length,
      binary: { id: nextBinaryId(binaryIdState), offset: element.dataOffset },
      noteKey,
      referenceUrl,
    };
  }

  const value = formatValue(rawVr, dataSet, tag, element.length, decoder);
  return { tag: displayTag, name, vr: rawVr, length: element.length, value, noteKey, referenceUrl };
}
