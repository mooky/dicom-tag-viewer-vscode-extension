#!/usr/bin/env node
/**
 * Fetches the upstream innolitics/dicom-standard tables and compiles them into
 * a small runtime lookup used to link tags to dicom.innolitics.com pages.
 *
 * The upstream module_to_attributes.json is ~77MB (denormalized per-CIOD, with
 * HTML descriptions and cross-references we don't need). We only need, for a
 * given CIOD + tag chain, which module(s) declare that chain — so we reduce
 * each dataset down to that shape before writing it out.
 *
 * Usage: node scripts/compile-dicom-standard-data.js
 */

const fs = require('fs');
const path = require('path');

const RAW_BASE = 'https://raw.githubusercontent.com/innolitics/dicom-standard/master/standard';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'parsing', 'generated', 'dicomStandardReference.json');

async function fetchJson(file) {
  const res = await fetch(`${RAW_BASE}/${file}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${file}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  console.log('Fetching upstream DICOM standard tables...');
  const [sops, ciods, ciodToModulesRaw, moduleToAttributes] = await Promise.all([
    fetchJson('sops.json'),
    fetchJson('ciods.json'),
    fetchJson('ciod_to_modules.json'),
    fetchJson('module_to_attributes.json'),
  ]);

  console.log(`  sops.json: ${sops.length} records`);
  console.log(`  ciods.json: ${ciods.length} records`);
  console.log(`  ciod_to_modules.json: ${ciodToModulesRaw.length} records`);
  console.log(`  module_to_attributes.json: ${moduleToAttributes.length} records`);

  const ciodNameToSlug = new Map(ciods.map((c) => [c.name, c.id]));

  const sopClassUidToCiod = {};
  let unresolvedCiodNames = 0;
  for (const sop of sops) {
    const slug = ciodNameToSlug.get(sop.ciod);
    if (!slug) {
      unresolvedCiodNames++;
      continue;
    }
    sopClassUidToCiod[sop.id] = slug;
  }
  if (unresolvedCiodNames > 0) {
    console.warn(`  Warning: ${unresolvedCiodNames} sops.json entries reference a CIOD name not found in ciods.json`);
  }

  const ciodToModules = {};
  for (const entry of ciodToModulesRaw) {
    (ciodToModules[entry.ciodId] ??= []).push(entry.moduleId);
  }

  const chainToModuleSet = new Map();
  for (const attr of moduleToAttributes) {
    const [moduleId, ...tagParts] = attr.path.split(':');
    const chain = tagParts.join(':');
    if (!chainToModuleSet.has(chain)) {
      chainToModuleSet.set(chain, new Set());
    }
    chainToModuleSet.get(chain).add(moduleId);
  }
  const chainToModules = {};
  for (const [chain, moduleIds] of chainToModuleSet) {
    chainToModules[chain] = [...moduleIds].sort();
  }

  const compiled = { sopClassUidToCiod, ciodToModules, chainToModules };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const json = JSON.stringify(compiled);
  fs.writeFileSync(OUTPUT_PATH, json);

  const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`  SOP Class UIDs mapped: ${Object.keys(sopClassUidToCiod).length}`);
  console.log(`  CIODs: ${Object.keys(ciodToModules).length}`);
  console.log(`  Unique tag chains: ${Object.keys(chainToModules).length}`);
  console.log(`  Compiled size: ${sizeMb} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
