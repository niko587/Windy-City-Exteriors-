// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// `site` is used to build canonical URLs, the sitemap and social share tags.
// Change it to the real domain once the site is live, and update the Sitemap
// line in public/robots.txt to match.
export default defineConfig({
  site: 'https://www.windycityexteriors.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
