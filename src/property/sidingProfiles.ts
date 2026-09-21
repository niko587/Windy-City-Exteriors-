/** Cladding profiles offered in the studio. Kept free of Three.js so the
 *  interface can list them without loading the renderer. */
export interface SidingProfileOption {
  id: 'lap' | 'dutch' | 'shake' | 'board';
  name: string;
  /** What a homeowner would recognise it by. */
  note: string;
}

export const SIDING_PROFILES: SidingProfileOption[] = [
  { id: 'lap', name: 'Lap', note: 'The Chicagoland default' },
  { id: 'dutch', name: 'Dutch lap', note: 'A cove along each course' },
  { id: 'shake', name: 'Shake', note: 'Gables and accent walls' },
  { id: 'board', name: 'Board and batten', note: 'Vertical, farmhouse' },
];
