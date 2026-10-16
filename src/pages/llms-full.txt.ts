import type { APIRoute } from 'astro';
import { llmsFullTxt, markdownResponse } from '../lib/llm';

export const GET: APIRoute = async ({ site }) => markdownResponse(await llmsFullTxt(site!), 'text/plain');
