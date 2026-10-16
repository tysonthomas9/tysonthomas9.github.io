import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Dek / subtitle, also used as the meta description. */
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      hero: image().optional(),
      heroAlt: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };
