import compiledData from './generated/dicomStandardReference.json';

interface CompiledReferenceData {
  sopClassUidToCiod: Record<string, string>;
  ciodToModules: Record<string, string[]>;
  chainToModules: Record<string, string[]>;
}

const data = compiledData as CompiledReferenceData;

/**
 * PS3.6 anchors are opaque, build-generated UUIDs unrelated to the tag value
 * (verified against the live standard) — there's no way to deep-link to a
 * specific tag without scraping and shipping a second large lookup just for
 * this fallback path. Link to the dictionary chapter itself instead.
 */
const PS36_DICTIONARY_URL = 'https://dicom.nema.org/medical/dicom/current/output/chtml/part06/chapter_6.html';

export function resolveCiod(sopClassUid: string | undefined): string | undefined {
  if (!sopClassUid) {
    return undefined;
  }
  return data.sopClassUidToCiod[sopClassUid];
}

function pickModule(ciod: string, candidates: string[]): string {
  const eponymous = candidates.find((moduleId) => moduleId === ciod);
  if (eponymous) {
    return eponymous;
  }
  return [...candidates].sort()[0];
}

export function resolveReferenceUrl(sopClassUid: string | undefined, hexChain: string[]): string | undefined {
  if (hexChain.length === 0) {
    return undefined;
  }

  const ciod = resolveCiod(sopClassUid);
  if (!ciod) {
    return PS36_DICTIONARY_URL;
  }

  // The upstream dataset stores tag hex with lowercase letters (e.g. "7fe00010"); normalize to match.
  const lowerChain = hexChain.map((tag) => tag.toLowerCase());
  const chainKey = lowerChain.join(':');
  const owningModules = data.chainToModules[chainKey];
  if (!owningModules || owningModules.length === 0) {
    return undefined;
  }

  const candidateModules = data.ciodToModules[ciod] ?? [];
  const matches = owningModules.filter((moduleId) => candidateModules.includes(moduleId));
  if (matches.length === 0) {
    return undefined;
  }

  const moduleId = matches.length === 1 ? matches[0] : pickModule(ciod, matches);
  return `https://dicom.innolitics.com/ciods/${ciod}/${moduleId}/${lowerChain.join('/')}`;
}
