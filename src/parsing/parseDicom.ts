import * as dicomParser from 'dicom-parser';
import type { DicomDataSet } from 'dicom-parser';
import { TreeNode } from '../common/protocol';
import { formatTagDisplay, lookupTag } from './dictionary';
import { formatValue, isBinaryVR } from './valueFormatting';

const INLINE_BINARY_MAX_LENGTH = 64;
const PIXEL_DATA_TAG = 'x7fe00010';
const ITEM_TAG_DISPLAY = '(FFFE,E000)';
const SOP_INSTANCE_UID_TAG = 'x00080018';

export interface ParseResult {
  elements?: TreeNode[];
  error?: string;
  sopInstanceUid?: string;
}

export function parseDicomFile(bytes: Uint8Array): ParseResult {
  let dataSet: DicomDataSet;
  try {
    dataSet = dicomParser.parseDicom(bytes);
  } catch (err) {
    return { error: `Unable to parse file as DICOM: ${errorMessage(err)}` };
  }

  try {
    const binaryIdState = { counter: 0 };
    const elements = buildNodes(dataSet, binaryIdState, '');
    return { elements, sopInstanceUid: readSopInstanceUid(dataSet) };
  } catch (err) {
    return { error: `Parsed DICOM meta information but failed to build the tag tree: ${errorMessage(err)}` };
  }
}

function readSopInstanceUid(dataSet: DicomDataSet): string | undefined {
  const raw = dataSet.string(SOP_INSTANCE_UID_TAG);
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.replace(/\0+$/, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function nextBinaryId(state: { counter: number }): string {
  return `bin${state.counter++}`;
}

function buildNodes(dataSet: DicomDataSet, binaryIdState: { counter: number }, parentChain: string): TreeNode[] {
  const tags = Object.keys(dataSet.elements).sort();
  return tags.map((tag) => buildNode(dataSet, tag, binaryIdState, parentChain));
}

function buildNode(dataSet: DicomDataSet, tag: string, binaryIdState: { counter: number }, parentChain: string): TreeNode {
  const element = dataSet.elements[tag];
  const dictEntry = lookupTag(tag);
  const rawVr = element.vr ?? dictEntry.vr?.split('|')[0] ?? 'UN';
  const displayTag = formatTagDisplay(tag);
  const name = dictEntry.name;
  const noteKey = parentChain ? `${parentChain}>${displayTag}` : displayTag;

  if (rawVr === 'SQ') {
    const items: TreeNode[] = (element.items ?? []).map((item, index) => {
      const itemKey = `${noteKey}>Item ${index}`;
      return {
        tag: ITEM_TAG_DISPLAY,
        name: `Item ${index}`,
        vr: '',
        length: item.length,
        items: buildNodes(item.dataSet, binaryIdState, itemKey),
        noteKey: itemKey,
      };
    });
    return { tag: displayTag, name, vr: rawVr, length: element.length, items, noteKey };
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
    };
  }

  const value = formatValue(rawVr, dataSet, tag, element.length);
  return { tag: displayTag, name, vr: rawVr, length: element.length, value, noteKey };
}
