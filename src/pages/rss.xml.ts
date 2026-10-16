import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { getPosts, postUrl } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site ?? 'https://tysonthomas.me',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      categories: post.data.tags,
      link: postUrl(post),
    })),
    customData: '<language>en</language>',
  });
}
