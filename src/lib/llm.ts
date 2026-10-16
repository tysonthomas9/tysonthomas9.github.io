/**
 * Plain-Markdown versions of the site for LLMs and other tools
 * (https://llmstxt.org): /llms.txt, /llms-full.txt and a `.md` twin of each page.
 */
import type { ImageMetadata } from 'astro';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { getPosts, postUrl, type Post } from './posts';

/** Every image that sits next to a post, keyed by its source path. */
const postImages = import.meta.glob<ImageMetadata>('/src/content/blog/**/*.{png,jpg,jpeg,webp,gif,avif,svg}', {
  eager: true,
  import: 'default',
});

export const absolute = (path: string, site: URL) => new URL(path, site).href;

/** Markdown URL for a page path: `/` → `/index.md`, `/about/` → `/about.md`, `/blog/x/` → `/blog/x.md`. */
export const markdownPath = (pathname: string) =>
  pathname === '/' ? '/index.md' : `${pathname.replace(/\/$/, '')}.md`;

export const postMarkdownUrl = (post: Post) => markdownPath(postUrl(post));

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Point relative image links (`./fig.png`) at the published image URLs. */
function absolutizeImages(post: Post, body: string, site: URL): string {
  const dir = post.filePath ? `/${post.filePath.replace(/^\.?\//, '').replace(/[^/]+$/, '')}` : '';
  return body.replace(/\]\((\.\/[^)\s]+)\)/g, (match, rel: string) => {
    const image = postImages[`${dir}${rel.slice(2)}`];
    return image ? `](${absolute(image.src, site)})` : match;
  });
}

/** A post as standalone Markdown with a short metadata header. */
export function postToMarkdown(post: Post, site: URL): string {
  const { title, description, date, updated, tags, hero, heroAlt } = post.data;
  const lines = [
    `# ${title}`,
    '',
    `> ${description}`,
    '',
    `- URL: ${absolute(postUrl(post), site)}`,
    `- Published: ${isoDate(date)}`,
    ...(updated ? [`- Updated: ${isoDate(updated)}`] : []),
    ...(tags.length ? [`- Tags: ${tags.join(', ')}`] : []),
    `- Author: ${SITE_TITLE}`,
    '',
    ...(hero ? [`![${(heroAlt ?? '').replace(/[[\]]/g, '')}](${absolute(hero.src, site)})`, ''] : []),
    absolutizeImages(post, (post.body ?? '').trim(), site),
    '',
  ];
  return lines.join('\n');
}

const postLine = (post: Post, site: URL) =>
  `- [${post.data.title}](${absolute(postMarkdownUrl(post), site)}): ${post.data.description}`;

/** The llms.txt index. */
export async function llmsTxt(site: URL): Promise<string> {
  const posts = (await getPosts()).filter((p) => !p.data.draft);
  return [
    `# ${SITE_TITLE}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `Every page on ${site.host} has a Markdown version: add \`.md\` to the page path (for example \`/blog/<post>.md\`). All posts in one file: ${absolute('/llms-full.txt', site)}`,
    '',
    '## Posts',
    '',
    ...(posts.length ? posts.map((p) => postLine(p, site)) : ['- No posts yet.']),
    '',
    '## Pages',
    '',
    `- [Home](${absolute('/index.md', site)}): List of posts.`,
    `- [About](${absolute('/about.md', site)}): About Tyson Thomas and the projects he has built.`,
    '',
    '## Optional',
    '',
    `- [RSS feed](${absolute('/rss.xml', site)})`,
    `- [Sitemap](${absolute('/sitemap-index.xml', site)})`,
    '',
  ].join('\n');
}

/** Every published post in full, newest first. */
export async function llmsFullTxt(site: URL): Promise<string> {
  const posts = (await getPosts()).filter((p) => !p.data.draft);
  const header = [`# ${SITE_TITLE}`, '', `> ${SITE_DESCRIPTION}`, ''].join('\n');
  return [header, ...posts.map((p) => postToMarkdown(p, site))].join('\n---\n\n');
}

/** Markdown version of the home page. */
export async function homeMarkdown(site: URL): Promise<string> {
  const posts = (await getPosts()).filter((p) => !p.data.draft);
  return [
    `# ${SITE_TITLE}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    '## Writing',
    '',
    ...(posts.length
      ? posts.map((p) => `${postLine(p, site)} (${isoDate(p.data.date)})`)
      : ['No posts yet.']),
    '',
  ].join('\n');
}

export const markdownResponse = (body: string, type = 'text/markdown') =>
  new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8` } });
