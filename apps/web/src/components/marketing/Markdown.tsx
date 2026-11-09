import type { ReactNode } from 'react';

/** Rendu d'un Markdown restreint SANS HTML brut : titres, listes, gras, italique, citations, liens http(s) et images du blog. */
const INLINE = /(!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*(?:[^*]|\*[^*\n]+\*)+\*\*|\*[^*\n]+\*)/g;
const IMG_OK = /^\/api\/media\/blog\/[a-f0-9]{32}(_t)?\.webp$/;
const LINK_OK = /^(https?:\/\/|\/(?!\/))/;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    let m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(part);
    if (m) return IMG_OK.test(m[2]) ? <img key={key} src={m[2]} alt={m[1]} loading="lazy" className="my-6 w-full rounded-2xl" /> : null;
    m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (m) return LINK_OK.test(m[2]) ? <a key={key} href={m[2]} rel="noopener noreferrer nofollow" className="font-semibold text-brand-ink underline">{inline(m[1], key)}</a> : inline(m[1], key);
    m = /^\*\*((?:[^*]|\*[^*\n]+\*)+)\*\*$/.exec(part);
    if (m) return <strong key={key}>{inline(m[1], key)}</strong>;
    m = /^\*([^*\n]+)\*$/.exec(part);
    if (m) return <em key={key}>{m[1]}</em>;
    return part;
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-5 text-lg leading-relaxed">
      {blocks.map((block, i) => {
        const k = `b${i}`;
        const lines = block.split('\n');
        const head = /^(#{2,3}) (.+)$/.exec(block);
        if (head) return head[1].length === 2
          ? <h2 key={k} className="pt-4 text-2xl font-bold md:text-3xl">{inline(head[2], k)}</h2>
          : <h3 key={k} className="pt-2 text-xl font-bold">{inline(head[2], k)}</h3>;
        if (lines.every((l) => l.startsWith('> '))) return <blockquote key={k} className="rounded-r-2xl border-l-4 border-brand bg-soft px-5 py-4 font-medium">{inline(lines.map((l) => l.slice(2)).join(' '), k)}</blockquote>;
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={k} className="list-disc space-y-2 pl-6 marker:text-brand-ink">{lines.map((l, j) => <li key={j}>{inline(l.slice(2), `${k}-${j}`)}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={k} className="list-decimal space-y-2 pl-6 marker:font-bold marker:text-brand-ink">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ''), `${k}-${j}`)}</li>)}</ol>;
        return <p key={k}>{inline(lines.join(' '), k)}</p>;
      })}
    </div>
  );
}
