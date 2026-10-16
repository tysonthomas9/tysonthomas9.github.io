import type { APIRoute } from 'astro';
import { aboutMarkdown } from '../lib/about';
import { markdownResponse } from '../lib/llm';

export const GET: APIRoute = ({ site }) => markdownResponse(aboutMarkdown(site!.origin));
