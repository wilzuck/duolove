/**
 * Passerelle entre l'éditeur riche (arbre Tiptap/ProseMirror) et le Markdown restreint stocké en base.
 * La grammaire est EXACTEMENT celle de `components/marketing/Markdown.tsx` (titres ##/###, listes, citations, gras, italique, liens, images du blog) :
 * ce que l'éditeur écrit est donc toujours rendu à l'identique sur le site, sans HTML brut.
 */
export interface PMNode { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }

const INLINE = /(!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*(?:[^*]|\*[^*\n]+\*)+\*\*|\*[^*\n]+\*)/g;
export const IMG_OK = /^\/api\/media\/blog\/[a-f0-9]{32}(_t)?\.webp$/;
const LINK_OK = /^(https?:\/\/|\/(?!\/))/;

type Mark = NonNullable<PMNode['marks']>[number];

function parseInline(text: string, marks: Mark[] = []): PMNode[] {
  const out: PMNode[] = [];
  const push = (t: string, m: Mark[]) => { if (t) out.push({ type: 'text', text: t, ...(m.length ? { marks: m } : {}) }); };
  for (const part of text.split(INLINE)) {
    let m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(part);
    if (m) { if (IMG_OK.test(m[2])) out.push({ type: 'image', attrs: { src: m[2], alt: m[1] } }); continue; }
    m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (m) { if (LINK_OK.test(m[2])) out.push(...parseInline(m[1], [...marks, { type: 'link', attrs: { href: m[2] } }])); else push(m[1], marks); continue; }
    m = /^\*\*((?:[^*]|\*[^*\n]+\*)+)\*\*$/.exec(part);
    if (m) { out.push(...parseInline(m[1], [...marks, { type: 'bold' }])); continue; }
    m = /^\*([^*\n]+)\*$/.exec(part);
    if (m) { push(m[1], [...marks, { type: 'italic' }]); continue; }
    push(part, marks);
  }
  return out;
}

const para = (text: string): PMNode => { const c = parseInline(text); return c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' }; };

export function markdownToDoc(source: string): PMNode {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const content: PMNode[] = blocks.map((block) => {
    const lines = block.split('\n');
    const head = /^(#{2,3}) (.+)$/.exec(block);
    if (head) return { type: 'heading', attrs: { level: head[1].length }, content: parseInline(head[2]) };
    if (lines.every((l) => l.startsWith('> '))) return { type: 'blockquote', content: [para(lines.map((l) => l.slice(2)).join(' '))] };
    if (lines.every((l) => /^[-*] /.test(l))) return { type: 'bulletList', content: lines.map((l) => ({ type: 'listItem', content: [para(l.slice(2))] })) };
    if (lines.every((l) => /^\d+\. /.test(l))) return { type: 'orderedList', content: lines.map((l) => ({ type: 'listItem', content: [para(l.replace(/^\d+\. /, ''))] })) };
    return para(lines.join(' '));
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

const esc = (s: string) => s.replace(/\*/g, '∗').replace(/\n/g, ' ');

function inlineToMd(nodes: PMNode[] = []): string {
  return nodes.map((n) => {
    if (n.type === 'image') return IMG_OK.test(String(n.attrs?.src)) ? `![${esc(String(n.attrs?.alt ?? '')).replace(/[\]]/g, '')}](${n.attrs?.src})` : '';
    if (n.type !== 'text' || !n.text) return '';
    let s = esc(n.text);
    const has = (t: string) => n.marks?.find((m) => m.type === t);
    // L'italique reste à l'intérieur du gras (« ***x*** » est lu comme **…*x*…**) ; le lien enveloppe le tout.
    if (has('italic') && s.trim()) s = `*${s}*`;
    if (has('bold') && s.trim()) s = `**${s}**`;
    const link = has('link');
    if (link && s.trim()) { const href = String(link.attrs?.href ?? ''); if (LINK_OK.test(href) && !/\s|\)/.test(href)) s = `[${s.replace(/[\][]/g, '')}](${href})`; }
    return s;
  }).join('');
}

const flat = (n: PMNode): string => (n.content ?? []).map((c) => (c.type === 'paragraph' || c.type === 'heading' ? inlineToMd(c.content) : c.type === 'text' || c.type === 'image' ? inlineToMd([c]) : flat(c))).filter(Boolean).join(' ');
// Un paragraphe qui commencerait comme un autre bloc ("## ", "> ", "- ", "1. ") serait mal relu : on le protège d'un espace insécable de largeur nulle.
const guard = (s: string) => (/^(#{2,3} |> |[-*] |\d+\. )/.test(s) ? `​${s}` : s);

export function docToMarkdown(doc: PMNode): string {
  const out: string[] = [];
  for (const n of doc.content ?? []) {
    if (n.type === 'heading') { const t = inlineToMd(n.content).trim(); if (t) out.push(`${'#'.repeat(Number(n.attrs?.level) === 3 ? 3 : 2)} ${t}`); }
    else if (n.type === 'paragraph') { const t = inlineToMd(n.content).trim(); if (t) out.push(guard(t)); }
    else if (n.type === 'blockquote') { const t = flat(n).trim(); if (t) out.push(`> ${t}`); }
    else if (n.type === 'bulletList' || n.type === 'orderedList') {
      const items = (n.content ?? []).map((li) => flat(li).trim()).filter(Boolean);
      if (items.length) out.push(items.map((t, i) => (n.type === 'bulletList' ? `- ${t}` : `${i + 1}. ${t}`)).join('\n'));
    }
  }
  return out.join('\n\n');
}
