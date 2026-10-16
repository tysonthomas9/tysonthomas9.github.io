import type { APIRoute } from 'astro';
import { homeMarkdown, markdownResponse } from '../lib/llm';

export const GET: APIRoute = async ({ site }) => markdownResponse(await homeMarkdown(site!));
