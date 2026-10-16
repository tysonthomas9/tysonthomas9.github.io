import { frontmatter, rawContent } from '../content/about.md';

export interface AboutProject {
  name: string;
  kind: string;
  href: string;
  /** Optional second link, e.g. to the code behind a write-up. */
  code?: string;
  /** Optional YouTube video id, embedded in the project card. */
  video?: string;
  /** Optional blog post slug; its hero image is shown in the project card. */
  post?: string;
  summary: string;
  tags: string[];
}

export interface AboutLink {
  label: string;
  href: string;
}

export interface About {
  headline: string;
  projects: AboutProject[];
  earlier: string;
  links: AboutLink[];
}

export const about = frontmatter as About;

/** The About page as Markdown, built from the same source as the HTML page. */
export function aboutMarkdown(origin: string): string {
  const abs = (href: string) => (href.startsWith('/') ? `${origin}${href}` : href);
  const intro = rawContent()
    .trim()
    .replace(/\]\(\/(?!\/)/g, `](${origin}/`);
  const projects = about.projects
    .map((p) => `- **[${p.name}](${abs(p.href)})** (${p.kind}): ${p.summary}` + (p.code ? ` [Technical write-up](${abs(p.code)}).` : ''))
    .join('\n');
  const links = about.links.map((l) => `- [${l.label}](${abs(l.href)})`).join('\n');
  return [
    '# About',
    `**${about.headline}**`,
    intro,
    '## What I build',
    projects,
    '## Earlier work',
    about.earlier,
    '## Find me',
    links,
  ].join('\n\n') + '\n';
}
