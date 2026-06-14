/**
 * Drawing sheet formats — layout printable area must match engine/sheet.py.
 * A1 landscape (GB/T 14689): 841×594 mm sheet.
 */

export const SHEET_A3 = {
  id: "A3",
  width: 360,
  height: 220,
  margin: 20,
  symbolHalfW: 24,
  symbolHalfH: 28,
  layerGap: 140,
  nodeGap: 85,
  viewCenter: { x: 148.5, y: 105.0 },
  template: "GB_A3_Landscape.svg",
};

export const SHEET_A1 = {
  id: "A1",
  width: 720,
  height: 450,
  margin: 35,
  symbolHalfW: 28,
  symbolHalfH: 32,
  layerGap: 200,
  nodeGap: 120,
  viewCenter: { x: 420.0, y: 280.0 },
  template: "ISO/A1_Landscape_ISO5457_minimal.svg",
};

export const SHEET_FORMATS = { A3: SHEET_A3, A1: SHEET_A1 };

/** @deprecated use getSheetFormat('A3') */
export const DRAWING_AREA = SHEET_A3;

export function getSheetFormat(size = "A1") {
  const key = String(size || "A1").toUpperCase();
  return SHEET_FORMATS[key] || SHEET_A1;
}

export function layoutOptionsForSheet(sheet) {
  return {
    xStart: sheet.margin + 40,
    yCenter: sheet.height / 2,
    layerGap: sheet.layerGap,
    nodeGap: sheet.nodeGap,
    symbolHalfW: sheet.symbolHalfW,
    symbolHalfH: sheet.symbolHalfH,
    padding: 14,
  };
}
