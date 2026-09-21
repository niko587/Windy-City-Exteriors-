/** Finishes offered in the transformation panel, per the reference's swatch row. */
export interface SidingColour {
  id: string;
  name: string;
  hex: string;
  accent: string;
}

/**
 * Each finish has to separate from what it sits against, or the choice does
 * not read on the model: porcelain from the trim, graphite from the roof,
 * juniper from the planting. The values below are set against those
 * neighbours rather than picked as swatches on their own.
 */
export const SIDING_COLORS: SidingColour[] = [
  { id: 'harbor', name: 'Harbor navy', hex: '#31415a', accent: '#3b4d69' },
  // Six per cent off the trim left the corner boards with nothing to show
  // against; this is still clearly a pale finish, just not the trim's colour.
  { id: 'porcelain', name: 'Porcelain', hex: '#cdc8bd', accent: '#d8d3c8' },
  { id: 'sandstone', name: 'Sandstone', hex: '#b9ab93', accent: '#c4b79f' },
  // Sage-teal rather than olive, so the shrubs in front of it stay separate.
  { id: 'juniper', name: 'Juniper', hex: '#42544e', accent: '#4c5f59' },
  // The shingles land around #4a4b4f, which was lighter than the wall was.
  { id: 'graphite', name: 'Graphite', hex: '#343a45', accent: '#3e4551' },
];
