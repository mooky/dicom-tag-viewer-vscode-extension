// Generates small, synthetic DICOM Part 10 files for manual/E2E verification.
// Not part of the extension build; run with `node sample-files/generate-samples.js`.
const fs = require('fs');
const path = require('path');

const LONG_VRS = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN', 'OD', 'OL', 'OV', 'UC', 'UR']);

function tagBytes(group, element) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16LE(group, 0);
  buf.writeUInt16LE(element, 2);
  return buf;
}

function padEven(buf, padByte) {
  if (buf.length % 2 === 0) return buf;
  return Buffer.concat([buf, Buffer.from([padByte])]);
}

function strValue(str, padByte = 0x20) {
  return padEven(Buffer.from(str, 'ascii'), padByte);
}

function element(group, elementNum, vr, valueBuffer) {
  const tag = tagBytes(group, elementNum);
  const vrBuf = Buffer.from(vr, 'ascii');
  let header;
  if (LONG_VRS.has(vr)) {
    header = Buffer.alloc(8);
    vrBuf.copy(header, 0);
    header.writeUInt32LE(valueBuffer.length, 4);
  } else {
    header = Buffer.alloc(4);
    vrBuf.copy(header, 0);
    header.writeUInt16LE(valueBuffer.length, 2);
  }
  return Buffer.concat([tag, header, valueBuffer]);
}

function item(elementsBuf) {
  const tag = Buffer.alloc(4);
  tag.writeUInt16LE(0xfffe, 0);
  tag.writeUInt16LE(0xe000, 2);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(elementsBuf.length, 0);
  return Buffer.concat([tag, lenBuf, elementsBuf]);
}

function fileMetaGroup(sopClassUid, sopInstanceUid, transferSyntaxUid) {
  const version = element(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01]));
  const sopClass = element(0x0002, 0x0002, 'UI', strValue(sopClassUid, 0x00));
  const sopInstance = element(0x0002, 0x0003, 'UI', strValue(sopInstanceUid, 0x00));
  const transferSyntax = element(0x0002, 0x0010, 'UI', strValue(transferSyntaxUid, 0x00));
  const implementationClass = element(0x0002, 0x0012, 'UI', strValue('1.2.3.4.5.6', 0x00));
  const body = Buffer.concat([version, sopClass, sopInstance, transferSyntax, implementationClass]);
  const groupLength = element(0x0002, 0x0000, 'UL', (() => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(body.length, 0);
    return b;
  })());
  return Buffer.concat([groupLength, body]);
}

function buildDataset({ pixelDataLength, sopInstanceUid }) {
  const parts = [];
  parts.push(element(0x0008, 0x0016, 'UI', strValue('1.2.840.10008.5.1.4.1.1.2', 0x00))); // SOP Class UID: CT Image Storage
  parts.push(element(0x0008, 0x0018, 'UI', strValue(sopInstanceUid, 0x00)));
  parts.push(element(0x0008, 0x0060, 'CS', strValue('CT')));
  parts.push(element(0x0008, 0x0020, 'DA', strValue('20240115')));
  parts.push(element(0x0008, 0x0030, 'TM', strValue('153045')));
  parts.push(element(0x0010, 0x0010, 'PN', strValue('Doe^John^^Dr.^Jr.')));
  parts.push(element(0x0010, 0x0020, 'LO', strValue('12345')));

  // Private tag (odd group) to exercise the "Private Tag" dictionary fallback.
  parts.push(element(0x0009, 0x0010, 'LO', strValue('ACME Private Creator')));
  parts.push(element(0x0009, 0x1001, 'SH', strValue('PRIV1')));

  // Sequence with two items, to exercise recursive nesting.
  // item1 also nests a sequence of its own, to exercise a tag path two sequence levels deep.
  const nestedCodeItem = item(Buffer.concat([element(0x0008, 0x0100, 'SH', strValue('CODE1'))]));
  const nestedProtocolCodeSequence = element(0x0040, 0x0008, 'SQ', nestedCodeItem);
  const item1 = item(
    Buffer.concat([
      element(0x0040, 0x0007, 'LO', strValue('CHEST XRAY')),
      element(0x0040, 0x0009, 'SH', strValue('SPS1')),
      nestedProtocolCodeSequence,
    ]),
  );
  const item2 = item(
    Buffer.concat([
      element(0x0040, 0x0007, 'LO', strValue('ABDOMEN CT')),
      element(0x0040, 0x0009, 'SH', strValue('SPS2')),
    ]),
  );
  parts.push(element(0x0040, 0x0275, 'SQ', Buffer.concat([item1, item2])));

  parts.push(element(0x0028, 0x0002, 'US', (() => { const b = Buffer.alloc(2); b.writeUInt16LE(1, 0); return b; })()));
  parts.push(element(0x0028, 0x0100, 'US', (() => { const b = Buffer.alloc(2); b.writeUInt16LE(16, 0); return b; })()));

  if (pixelDataLength > 0) {
    const pixelData = Buffer.alloc(pixelDataLength);
    for (let i = 0; i < pixelData.length; i++) pixelData[i] = i % 256;
    parts.push(element(0x7fe0, 0x0010, 'OW', pixelData));
  }

  return Buffer.concat(parts);
}

function buildFile({ pixelDataLength, sopInstanceUid }) {
  const preamble = Buffer.alloc(128, 0);
  const magic = Buffer.from('DICM', 'ascii');
  // Media Storage SOP Instance UID (0002,0003) SHALL match the dataset's SOP Instance UID (0008,0018).
  const meta = fileMetaGroup('1.2.840.10008.5.1.4.1.1.2', sopInstanceUid, '1.2.840.10008.1.2.1');
  const dataset = buildDataset({ pixelDataLength, sopInstanceUid });
  return Buffer.concat([preamble, magic, meta, dataset]);
}

const outDir = __dirname;

fs.writeFileSync(
  path.join(outDir, 'valid-sample.dcm'),
  buildFile({ pixelDataLength: 2048, sopInstanceUid: '1.2.3.4.5.6.7.8.9.1' }),
);
fs.writeFileSync(
  path.join(outDir, 'large-pixeldata.dcm'),
  buildFile({ pixelDataLength: 8 * 1024 * 1024, sopInstanceUid: '1.2.3.4.5.6.7.8.9.2' }),
);
fs.writeFileSync(path.join(outDir, 'not-dicom.dcm'), Buffer.from('this is not a dicom file, just plain text bytes\n'.repeat(20)));

console.log('Generated sample-files/valid-sample.dcm, large-pixeldata.dcm, not-dicom.dcm');
