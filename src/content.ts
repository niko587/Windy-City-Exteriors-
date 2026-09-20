/**
 * Single source of truth for company facts and site copy.
 * Everything here comes from docs/prototype-brief.md. Do not add licenses,
 * warranties, awards, review text, project locations or roofing claims
 * without confirmation from the owner.
 */

export const company = {
  name: 'Windy City Exteriors',
  short: 'WCE',
  base: 'Lake Villa, Illinois',
  phoneDisplay: '224-629-8926',
  phoneHref: 'tel:+12246298926',
  smsHref: 'sms:+12246298926',
  email: 'windycityexteriors@gmail.com',
  emailHref: 'mailto:windycityexteriors@gmail.com',
  googleUrl: 'https://share.google/Mjg5asmAbPIcsEh5E',
  facebookUrl: 'https://www.facebook.com/people/Windy-City-Exteriors/61587267356958/',
  serviceArea:
    'Roughly 30 miles around Lake Villa, and broader Chicagoland depending on the project.',
  estimatePromise: 'Free, accurate, same-day estimates.',
} as const;

export const values = [
  {
    title: 'Family owned, owner operated',
    body: 'You deal with the people whose name is on the work. The owner stays hands-on while building a crew that works to the same standard.',
  },
  {
    title: 'Pricing you can trust',
    body: 'A free, accurate estimate the same day we see the job, written plainly so you know what is included before anything starts.',
  },
  {
    title: 'Workmanship that holds up',
    body: 'Exterior work lives outside in Chicagoland weather. The details behind the finish are treated as seriously as the finish itself.',
  },
  {
    title: 'Relationships, not one-offs',
    body: 'Homeowners, property managers and commercial clients call back for the next project. That is the business plan.',
  },
] as const;

export const customers = [
  { id: 'home', label: 'Homeowners', note: 'Single-family homes and townhomes' },
  { id: 'managed', label: 'Property managers', note: 'Rentals, associations and multi-unit buildings' },
  { id: 'commercial', label: 'Commercial', note: 'Storefronts, offices and light commercial' },
] as const;

export type PropertyTypeId = (typeof customers)[number]['id'];
export type FocusId = 'siding' | 'windows' | 'doors' | 'decks' | 'gutters' | 'interior';

export type ServiceId =
  | 'siding'
  | 'windows'
  | 'doors'
  | 'decks'
  | 'gutters'
  | 'flooring'
  | 'drywall'
  | 'repairs';

export interface Service {
  id: ServiceId;
  name: string;
  focus: FocusId;
  category: 'Exterior' | 'Interior';
  summary: string;
  lead: string;
  scope: string[];
  approach: { title: string; body: string }[];
}

export const services: Service[] = [
  {
    id: 'siding',
    name: 'Siding',
    focus: 'siding',
    category: 'Exterior',
    summary: 'Full replacement and repair, with the trim, corners and flashing details that make it last.',
    lead: 'New siding changes how a house looks from the street and how it handles a Chicagoland winter. We replace tired, faded or damaged cladding and finish the corners, trim and transitions so the whole elevation reads as one piece of work.',
    scope: [
      'Full siding replacement and section repairs',
      'Corner posts, window and door trim, frieze and fascia wrap',
      'Weather barrier and flashing checked while the wall is open',
      'Storm, impact and wind damage repair',
    ],
    approach: [
      { title: 'See it', body: 'We walk the exterior with you, measure, and note what is behind the problem areas, not just what shows.' },
      { title: 'Price it', body: 'A free, accurate estimate the same day, with the scope spelled out.' },
      { title: 'Build it', body: 'Careful tear-off, clean site, straight courses and tight trim.' },
    ],
  },
  {
    id: 'windows',
    name: 'Windows',
    focus: 'windows',
    category: 'Exterior',
    summary: 'Replacement windows, installed square, sealed properly and trimmed to match the house.',
    lead: 'A window is only as good as its installation. We measure each opening, set the new unit plumb and square, insulate and seal the perimeter, and finish the exterior trim so it looks like it was always there.',
    scope: [
      'Replacement and new-opening installation',
      'Exterior casing, sills and capping',
      'Perimeter insulation, flashing and sealing',
      'Repairs to rotted or damaged frames and trim',
    ],
    approach: [
      { title: 'Measure', body: 'Every opening is measured individually. Older homes are rarely square.' },
      { title: 'Install', body: 'Set, shimmed, insulated and sealed, one opening at a time so the house is never left open.' },
      { title: 'Finish', body: 'Interior and exterior trim completed and cleaned up the same visit where possible.' },
    ],
  },
  {
    id: 'doors',
    name: 'Doors',
    focus: 'doors',
    category: 'Exterior',
    summary: 'Entry, patio and service doors that close properly, seal tight and suit the front of the house.',
    lead: 'The front door is the first thing a visitor touches. We install entry, patio and service doors that swing true, latch cleanly and keep the weather out, with trim and thresholds finished properly.',
    scope: [
      'Entry doors with sidelights and surrounds',
      'Sliding and hinged patio doors',
      'Storm doors and service doors',
      'Threshold, jamb and trim repair',
    ],
    approach: [
      { title: 'Choose', body: 'We help you pick a door that suits the house and how you use it.' },
      { title: 'Fit', body: 'Opening prepared, unit set level and plumb, fastened and sealed.' },
      { title: 'Detail', body: 'Hardware, weatherstripping, trim and paint-ready finish.' },
    ],
  },
  {
    id: 'decks',
    name: 'Decks',
    focus: 'decks',
    category: 'Exterior',
    summary: 'New decks, rebuilds and repairs: solid framing, clean lines, safe stairs and rails.',
    lead: 'A deck should feel solid underfoot for years. We build and rebuild decks with proper footings and framing, straight board lines, and stairs and railings you can trust.',
    scope: [
      'New deck construction and full rebuilds',
      'Board, stair and railing replacement',
      'Structural repairs to framing, posts and ledgers',
      'Wood and composite decking options',
    ],
    approach: [
      { title: 'Plan', body: 'Size, height, stairs and materials settled before the first post goes in.' },
      { title: 'Frame', body: 'The part you do not see gets the most attention.' },
      { title: 'Finish', body: 'Boards, rails, stairs and skirting installed clean and consistent.' },
    ],
  },
  {
    id: 'gutters',
    name: 'Gutters',
    focus: 'gutters',
    category: 'Exterior',
    summary: 'Gutters and downspouts sized, pitched and placed to move water away from the house.',
    lead: 'Gutters protect siding, foundations and landscaping. We install and repair gutters and downspouts with the right pitch and outlets so water goes where it should.',
    scope: [
      'New gutter and downspout installation',
      'Re-pitching, re-hanging and leak repair',
      'Fascia and soffit repair behind the gutter line',
      'Downspout extensions and drainage corrections',
    ],
    approach: [
      { title: 'Assess', body: 'We look at roof areas, runs and where the water ends up.' },
      { title: 'Install', body: 'Properly pitched runs, secure hangers and sealed corners.' },
      { title: 'Test', body: 'Outlets and downspouts checked before we leave.' },
    ],
  },
  {
    id: 'flooring',
    name: 'Flooring',
    focus: 'interior',
    category: 'Interior',
    summary: 'Selected interior flooring work, prepared properly from the subfloor up.',
    lead: 'Good floors start with what is underneath. We take on selected flooring projects, with subfloor prep, transitions and trim handled with the same care as the visible surface.',
    scope: [
      'Flooring installation in selected rooms and units',
      'Subfloor repair and levelling',
      'Transitions, base and shoe moulding',
      'Turnover work for rental and managed properties',
    ],
    approach: [
      { title: 'Prep', body: 'Subfloor checked, repaired and levelled first.' },
      { title: 'Lay', body: 'Layout planned so cuts and seams land where they look right.' },
      { title: 'Trim', body: 'Transitions and mouldings finished to match the room.' },
    ],
  },
  {
    id: 'drywall',
    name: 'Walls & drywall',
    focus: 'interior',
    category: 'Interior',
    summary: 'Drywall hanging, patching and finishing that disappears once it is painted.',
    lead: 'From a single patch to full rooms, we hang, tape and finish drywall so repairs disappear and new walls are flat and ready for paint.',
    scope: [
      'New drywall hanging and finishing',
      'Patches, cracks and water-damage repair',
      'Wall changes as part of remodeling work',
      'Paint-ready finishing',
    ],
    approach: [
      { title: 'Open', body: 'Find and fix the cause before closing the wall.' },
      { title: 'Hang', body: 'Tight seams and proper fastening.' },
      { title: 'Finish', body: 'Taped, coated and sanded flat.' },
    ],
  },
  {
    id: 'repairs',
    name: 'Repairs & remodeling',
    focus: 'interior',
    category: 'Interior',
    summary: 'General repairs and remodeling for the jobs that do not fit one trade.',
    lead: 'Many projects touch more than one trade. We handle general repairs and remodeling so you have one accountable contractor instead of several.',
    scope: [
      'General exterior and interior repairs',
      'Remodeling projects, scoped case by case',
      'Punch lists for property managers',
      'Combined projects across several services',
    ],
    approach: [
      { title: 'Listen', body: 'Tell us what is bothering you about the property.' },
      { title: 'Scope', body: 'We say clearly what we will take on and what we will not.' },
      { title: 'Deliver', body: 'One point of contact from estimate to final walkthrough.' },
    ],
  },
];

export const serviceById = (id: string): Service | undefined => services.find((s) => s.id === id);

export const gallerySlots: { id: string; service: ServiceId; title: string; view: FocusId | 'overview'; size: 'wide' | 'tall' | 'std' }[] = [
  { id: 'g1', service: 'siding', title: 'Whole-elevation siding', view: 'overview', size: 'wide' },
  { id: 'g2', service: 'windows', title: 'Window replacement and trim', view: 'windows', size: 'std' },
  { id: 'g3', service: 'doors', title: 'Entry door and porch', view: 'doors', size: 'tall' },
  { id: 'g4', service: 'decks', title: 'Rear deck and stairs', view: 'decks', size: 'std' },
  { id: 'g5', service: 'gutters', title: 'Gutters and downspouts', view: 'gutters', size: 'std' },
  { id: 'g6', service: 'siding', title: 'Siding, corners and trim detail', view: 'siding', size: 'wide' },
];

export const navLinks = [
  { to: '/#property', label: 'The property' },
  { to: '/#services', label: 'Services' },
  { to: '/projects', label: 'Projects' },
  { to: '/#reviews', label: 'Reviews' },
  { to: '/about', label: 'About' },
] as const;
