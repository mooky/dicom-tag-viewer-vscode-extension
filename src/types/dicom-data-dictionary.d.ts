declare module 'dicom-data-dictionary' {
  export interface StandardDataElement {
    vr: string;
    name: string;
  }

  export const standardDataElements: { [tag: string]: StandardDataElement };
}
