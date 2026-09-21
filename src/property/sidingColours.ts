/** Finishes offered in the transformation panel, per the reference's swatch row. */
export interface SidingColour {
  id: string;
  name: string;
  hex: string;
  accent: string;
}

export const SIDING_COLORS: SidingColour[] = [
  { id: 'harbor', name: 'Harbor navy', hex: '#31415a', accent: '#3b4d69' },
  { id: 'porcelain', name: 'Porcelain', hex: '#ddd8cd', accent: '#e6e1d7' },
  { id: 'sandstone', name: 'Sandstone', hex: '#b9ab93', accent: '#c4b79f' },
  { id: 'juniper', name: 'Juniper', hex: '#4b5a4c', accent: '#566757' },
  { id: 'graphite', name: 'Graphite', hex: '#41444a', accent: '#4b4e55' },
];
