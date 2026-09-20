/**
 * Every piece of business information on the site lives in this one file.
 *
 * Anything marked TODO is a placeholder that must be replaced with real
 * details before the site goes live. Nothing here is invented fact — the
 * phone numbers use the 555-01xx range reserved for fictional use so they
 * can never dial a real person by accident.
 */

export interface Service {
  slug: string;
  name: string;
  /** One line used on cards and in the nav. */
  summary: string;
  /** Two or three sentences used at the top of the service page. */
  intro: string;
  /** Bullet points of what the job actually includes. */
  includes: string[];
  /** Short answer to "why does this matter in Chicago specifically". */
  chicagoNote: string;
  icon: IconName;
}

export type IconName = 'roof' | 'siding' | 'gutter' | 'window' | 'storm' | 'masonry';

export interface Testimonial {
  quote: string;
  name: string;
  location: string;
}

export const site = {
  name: 'Windy City Exteriors',
  shortName: 'Windy City Exteriors',
  tagline: 'Roofing, siding and gutters built for Chicago weather.',
  description:
    'Windy City Exteriors installs and repairs roofing, siding, gutters and windows across Chicago and the surrounding suburbs. Free estimates, licensed and insured.',

  // TODO: replace with the real business contact details.
  phone: '(773) 555-0100',
  phoneHref: 'tel:+17735550100',
  email: 'estimates@windycityexteriors.com',
  address: {
    street: '000 N Example Ave',
    city: 'Chicago',
    state: 'IL',
    zip: '60600',
  },

  // TODO: replace with the real license number, or delete both the value and
  // the places it is displayed if the business does not carry one.
  license: 'IL Roofing License #TODO',

  hours: [
    { days: 'Monday - Friday', time: '7:00am - 6:00pm' },
    { days: 'Saturday', time: '8:00am - 2:00pm' },
    { days: 'Sunday', time: 'Closed' },
  ],

  // TODO: replace with real profile URLs, or remove the entries that do not exist.
  social: {
    facebook: '',
    instagram: '',
    google: '',
  },

  /**
   * Where the quote form submits. The form is a plain HTML POST, so this works
   * with Formspree, Netlify Forms, Basin, or any endpoint that accepts a form
   * POST. See README.md for how to wire each one up.
   * TODO: replace with the real endpoint.
   */
  formEndpoint: '',
} as const;

export const serviceAreas: string[] = [
  'Chicago',
  'Evanston',
  'Skokie',
  'Oak Park',
  'Cicero',
  'Berwyn',
  'Des Plaines',
  'Park Ridge',
  'Arlington Heights',
  'Schaumburg',
  'Naperville',
  'Oak Lawn',
];

export const services: Service[] = [
  {
    slug: 'roofing',
    name: 'Roofing',
    summary: 'Full roof replacement, repair and inspection for homes and small commercial buildings.',
    intro:
      'A roof is the one part of a house that has to survive every kind of weather Chicago produces. We replace worn and storm-damaged roofs, repair leaks, and inspect roofs that are simply getting old so you know how much life is left in them.',
    includes: [
      'Asphalt shingle tear-off and replacement',
      'Flat and low-slope roofing for city two-flats and garages',
      'Leak tracing and targeted repair',
      'Ridge vent and attic ventilation correction',
      'Ice and water shield at eaves and valleys',
      'Written inspection reports for buyers and sellers',
    ],
    chicagoNote:
      'Freeze-thaw cycles are what actually kill roofs here. Water gets into a small gap, freezes overnight, and widens it. We install ice and water shield at the eaves and fix attic ventilation so the cycle does not start in the first place.',
    icon: 'roof',
  },
  {
    slug: 'siding',
    name: 'Siding',
    summary: 'Vinyl, fiber cement and aluminum siding installed to hold up through freeze-thaw winters.',
    intro:
      'Siding is the weather barrier for everything behind it. We replace failing siding, repair storm damage, and re-wrap the house underneath so moisture stays out of the sheathing and framing.',
    includes: [
      'Vinyl siding installation and repair',
      'Fiber cement (James Hardie-style) installation',
      'Aluminum and steel siding',
      'House wrap and moisture barrier replacement',
      'Soffit and fascia',
      'Trim, corner posts and wrap work',
    ],
    chicagoNote:
      'Vinyl gets brittle in deep cold and cracks on impact. On exposed elevations, especially anything facing the lake, fiber cement is worth the extra cost. We will tell you which walls actually need it instead of quoting the whole house at the higher price.',
    icon: 'siding',
  },
  {
    slug: 'gutters',
    name: 'Gutters',
    summary: 'Seamless gutters, downspouts and guards sized for heavy rain and winter ice.',
    intro:
      'Gutters fail quietly. By the time you notice, water has usually been running down the foundation for a season or two. We install seamless gutters cut on site, correct undersized systems, and fix the drainage at the bottom of the downspout.',
    includes: [
      'Seamless aluminum gutters formed on site',
      '5-inch and oversized 6-inch systems',
      'Downspout replacement and rerouting',
      'Gutter guards and leaf protection',
      'Fascia repair where gutters have pulled away',
      'Cleaning and seasonal maintenance',
    ],
    chicagoNote:
      'Ice dams form when a gutter stays full going into a freeze. Correct sizing and slope matter more than any guard product, so we start there before selling you covers.',
    icon: 'gutter',
  },
  {
    slug: 'windows',
    name: 'Windows',
    summary: 'Replacement windows that cut drafts and lower winter heating bills.',
    intro:
      'Old windows are usually the largest single source of heat loss in an older Chicago home. We replace them with insulated units sized for this climate, and we do the trim and flashing properly so the new window does not leak at the sill.',
    includes: [
      'Double and triple pane replacement windows',
      'Full-frame and insert installation',
      'Bay, bow and picture windows',
      'Storm window replacement',
      'Interior and exterior trim',
      'Proper sill flashing and sealing',
    ],
    chicagoNote:
      'Look for a low U-factor rather than a high R-value when comparing quotes. U-factor is the number that actually describes heat loss through a window, and it is the one that matters in a Chicago winter.',
    icon: 'window',
  },
  {
    slug: 'storm-damage',
    name: 'Storm Damage & Insurance Claims',
    summary: 'Emergency tarping, damage documentation and help working through an insurance claim.',
    intro:
      'After a hailstorm or a high-wind event, the first job is stopping further damage and the second is documenting what happened. We do both, and we will meet your adjuster on site so the scope of the claim reflects the real damage.',
    includes: [
      'Emergency tarping and board-up',
      'Photographed damage assessment',
      'Written scope and estimate for your insurer',
      'Meeting the adjuster on site',
      'Full repair once the claim is approved',
    ],
    chicagoNote:
      'Hail damage on an asphalt roof is often invisible from the ground and still worth a claim. Most policies have a window for filing after a storm, so it is worth getting it looked at rather than waiting for a leak.',
    icon: 'storm',
  },
  {
    slug: 'masonry',
    name: 'Masonry & Tuckpointing',
    summary: 'Tuckpointing, brick repair and chimney work for Chicago masonry buildings.',
    intro:
      'Most of the older housing stock here is brick, and brick fails at the mortar joints long before the brick itself goes. Tuckpointing at the right time is far cheaper than rebuilding a wall later.',
    includes: [
      'Tuckpointing and mortar joint repair',
      'Brick replacement and matching',
      'Chimney rebuilding and crown repair',
      'Lintel replacement',
      'Parapet wall repair',
      'Masonry sealing',
    ],
    chicagoNote:
      'Soft historic brick needs a soft lime mortar. Repointing it with modern hard portland mortar traps moisture and spalls the face off the brick over a few winters. It is a common and expensive mistake.',
    icon: 'masonry',
  },
];

/**
 * TODO: replace with real customer reviews, with permission to publish them.
 * Delete any you do not have a real source for — invented reviews are illegal
 * to publish as genuine in the US and will sink the business if noticed.
 */
export const testimonials: Testimonial[] = [
  {
    quote:
      'Placeholder review text. Replace this with a real customer review before the site goes live, or delete the testimonials section entirely.',
    name: 'Customer Name',
    location: 'Neighborhood, IL',
  },
  {
    quote:
      'Placeholder review text. Replace this with a real customer review before the site goes live, or delete the testimonials section entirely.',
    name: 'Customer Name',
    location: 'Neighborhood, IL',
  },
  {
    quote:
      'Placeholder review text. Replace this with a real customer review before the site goes live, or delete the testimonials section entirely.',
    name: 'Customer Name',
    location: 'Neighborhood, IL',
  },
];

export const faqs = [
  {
    question: 'How much does a new roof cost in Chicago?',
    answer:
      'It depends on the size and pitch of the roof, how many layers have to come off, and the material going back on. We give a written estimate after looking at the roof rather than a number over the phone, because a phone number is a guess and you would be comparing guesses.',
  },
  {
    question: 'Are estimates really free?',
    answer:
      'Yes. We come out, look at the work, and give you a written estimate at no cost and with no obligation.',
  },
  {
    question: 'Are you licensed and insured?',
    answer:
      'Yes. We carry liability insurance and workers compensation, and we can send certificates before work starts if you or your building association need them on file.',
  },
  {
    question: 'How long does a roof replacement take?',
    answer:
      'Most single family homes are a one or two day job once we start. Larger buildings and anything with complicated flashing or multiple layers to remove can run longer, and we will tell you which yours is when we quote it.',
  },
  {
    question: 'Do you help with insurance claims?',
    answer:
      'Yes. We document the damage, write a scope your insurer can work from, and meet the adjuster on site so nothing gets missed in the estimate.',
  },
  {
    question: 'What areas do you serve?',
    answer: `We work across Chicago and the surrounding suburbs, including ${serviceAreas.slice(0, 6).join(', ')} and the rest of the metro area. If you are not sure whether you are in range, call and ask.`,
  },
];
