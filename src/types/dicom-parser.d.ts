declare module 'dicom-parser' {
  export interface DicomDataSetItem {
    tag: string;
    length: number;
    dataOffset: number;
    dataSet: DicomDataSet;
  }

  export interface DicomElement {
    tag: string;
    vr?: string;
    length: number;
    dataOffset: number;
    items?: DicomDataSetItem[];
  }

  export interface DicomDataSet {
    byteArray: Uint8Array;
    elements: { [tag: string]: DicomElement };
    string(tag: string, index?: number): string | undefined;
    uint16(tag: string, index?: number): number | undefined;
    int16(tag: string, index?: number): number | undefined;
    uint32(tag: string, index?: number): number | undefined;
    int32(tag: string, index?: number): number | undefined;
    float(tag: string, index?: number): number | undefined;
    double(tag: string, index?: number): number | undefined;
  }

  export function parseDicom(byteArray: Uint8Array): DicomDataSet;
}
