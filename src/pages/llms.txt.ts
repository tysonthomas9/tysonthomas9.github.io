import type { APIRoute } from 'astro';
import { llmsTxt, markdownResponse } from '../lib/llm';

export const GET: APIRoute = async ({ site }) => markdownResponse(await llmsTxt(site!), 'text/plain');
