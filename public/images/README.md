# Images

Everything in `public/` is served from the root of the site. A file at
`public/images/projects/roof-logan-square.jpg` is reachable at
`/images/projects/roof-logan-square.jpg`.

## Replacing the photo placeholders

The site currently ships with dashed grey boxes instead of photos. They are
deliberately obvious so nothing goes live implying work that was not done.

To swap one out, replace the `<PhotoPlaceholder />` component with an `img`:

```astro
<!-- before -->
<PhotoPlaceholder label="Completed roof" icon="roof" />

<!-- after -->
<img
  src="/images/projects/roof-logan-square.jpg"
  alt="Replacement asphalt shingle roof on a Logan Square two-flat"
  width="1200"
  height="900"
  loading="lazy"
  class="aspect-[4/3] w-full rounded-xl object-cover"
/>
```

Placeholders appear in `src/pages/index.astro`, `src/pages/about.astro`,
`src/pages/gallery.astro` and `src/pages/services/[slug].astro`.

## Practical notes

- **Write real alt text.** Describe what is in the photo. It is what screen
  readers announce and it helps the page rank.
- **Resize before uploading.** Nothing needs to be wider than about 1600px.
  A 6MB phone photo will make the page slow on mobile, which is where most
  visitors will be.
- **Keep `loading="lazy"`** on anything below the fold.
- **Only use your own photos.** Stock photos of other people's roofs are
  common on contractor sites and they are both legally risky and easy to spot.

## Social preview image

For link previews, add `public/images/og-image.jpg` at 1200x630, then add this
to the `head` in `src/layouts/BaseLayout.astro`:

```astro
<meta property="og:image" content={new URL('/images/og-image.jpg', Astro.site).href} />
```
