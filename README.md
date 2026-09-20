# Windy City Exteriors

Marketing site for Windy City Exteriors, a Chicago-area exteriors contractor.
It is a static site: every page is plain HTML by the time a visitor loads it,
so it is fast on a phone and can be hosted almost anywhere for free.

**The site is scaffolded and working, but it is not ready to go live.** It
contains placeholder business details, placeholder photos and placeholder
reviews. See [Before launch](#before-launch) for the full list.

## Stack

| Piece | What it is |
| --- | --- |
| [Astro 7](https://astro.build) | Builds the pages. Ships zero JavaScript by default. |
| [Tailwind CSS 4](https://tailwindcss.com) | Styling, via the Vite plugin. |
| `@astrojs/sitemap` | Generates `sitemap-index.xml` for search engines. |
| TypeScript | Type checking, in strict mode. |

No database, no backend, no accounts. The quote form posts to a third-party
form service (see [The quote form](#the-quote-form)).

## Running it locally

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install      # once
npm run dev      # http://localhost:4321
```

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with live reload. |
| `npm run build` | Type checks, then builds to `dist/`. |
| `npm run preview` | Serves the built `dist/` locally. |
| `npm run check` | Type checks only. |

## Editing the content

**Almost everything lives in one file: [`src/data/site.ts`](src/data/site.ts).**
Phone number, email, address, hours, license number, the full list of services
with their descriptions, the service area, the reviews and the FAQ are all
there. Change it there and every page updates.

Longer prose that only appears in one place is in the page itself:

| Page | File |
| --- | --- |
| Home | `src/pages/index.astro` |
| Services list | `src/pages/services/index.astro` |
| Each service | `src/pages/services/[slug].astro` (one template, six pages) |
| Our Work | `src/pages/gallery.astro` |
| About | `src/pages/about.astro` |
| Free Estimate | `src/pages/contact.astro` |
| 404 | `src/pages/404.astro` |

Adding a service to the `services` array in `site.ts` automatically creates its
page, its nav entry, its footer link and its card on the home page.

Brand colors are defined once at the top of `src/styles/global.css`.

## The quote form

The form is a plain HTML POST, so it works with any form service without
writing backend code. Pick one and put its endpoint in `site.formEndpoint` in
`src/data/site.ts`.

- **[Formspree](https://formspree.io)** — sign up, create a form, paste the
  endpoint (`https://formspree.io/f/xxxxxxx`). Free tier covers a small
  contractor's volume.
- **[Basin](https://usebasin.com)** — same idea, similar pricing.
- **Netlify Forms** — only if hosting on Netlify. Leave `formEndpoint` empty,
  set `action="/"` and add `data-netlify="true"` to the `<form>` tag in
  `src/components/QuoteForm.astro`.

**Until an endpoint is set, the form falls back to opening the visitor's own
email client.** That works, but many people will abandon it, so wire up a real
service before running any ads. The build prints a warning while it is unset.

The form already includes a honeypot field that catches most spam bots.

## Deploying

The build output in `dist/` is static files. Any of these work, all have free
tiers, and all can auto-deploy on every push to GitHub:

- **[Netlify](https://netlify.com)** or **[Vercel](https://vercel.com)** —
  connect the repo, build command `npm run build`, publish directory `dist`.
- **[Cloudflare Pages](https://pages.cloudflare.com)** — same settings.

After connecting a custom domain, update `site` in `astro.config.mjs` and the
`Sitemap:` line in `public/robots.txt` to the real domain. Those two values
drive canonical URLs and the sitemap, and search engines use both.

## Before launch

Everything below is a placeholder. Search the codebase for `TODO` to find them.

- [ ] **Phone, email and address** in `src/data/site.ts`. The phone number is
      currently `(773) 555-0100`, in the range reserved for fiction so it
      cannot dial a real person by accident.
- [ ] **License number** in `src/data/site.ts` (`site.license`), or remove it
      from the footer and hero if the business does not carry one.
- [ ] **Business hours** in `src/data/site.ts`.
- [ ] **Social profile URLs** in `src/data/site.ts`. Empty ones are hidden
      automatically, so delete rather than guess.
- [ ] **Reviews** in `src/data/site.ts` (`testimonials`). These are visibly
      fake placeholder text. Replace them with real reviews you have
      permission to publish, or delete the section from
      `src/pages/index.astro`. Publishing invented reviews as genuine is
      illegal in the US under the FTC's rules on fake consumer reviews.
- [ ] **Photos.** Every image is a dashed grey placeholder. See
      [`public/images/README.md`](public/images/README.md). Use your own job
      photos, not stock images of other people's roofs.
- [ ] **The About page story** in `src/pages/about.astro` — currently generic.
- [ ] **Service area** in `src/data/site.ts` — trim it to where you actually go.
- [ ] **Form endpoint** — see [The quote form](#the-quote-form).
- [ ] **Domain** in `astro.config.mjs` and `public/robots.txt`.
- [ ] **Service copy** in `src/data/site.ts`. The descriptions are written to
      be accurate about Chicago building conditions, but check every claim
      about what your crews actually do before it goes out under your name.

## Accessibility and SEO

Both are already set up and worth not breaking:

- Semantic headings, a skip link, visible focus rings, labelled form fields,
  and `aria-current` on the active nav item.
- Per-page titles, descriptions, canonical URLs and Open Graph tags.
- `RoofingContractor` structured data in `src/layouts/BaseLayout.astro`, built
  from `site.ts`. This is what lets Google show hours, phone and service area
  directly in local results, which is where most contractor leads come from.
- A generated sitemap and a `robots.txt`.

When adding photos, write real alt text describing the photo. When adding
pages, give them a real `title` and `description`.
