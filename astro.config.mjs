// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://tysonthomas.me',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap()],
  redirects: {
    // Old Hexo URL.
    '/2015/05/04/google-design-sprint/': '/blog/google-design-sprint/',
  },
  markdown: {
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
