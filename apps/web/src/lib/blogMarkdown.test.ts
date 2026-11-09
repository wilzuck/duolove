import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToDoc } from './blogMarkdown';

const IMG = '/api/media/blog/0123456789abcdef0123456789abcdef.webp';
describe('blogMarkdown : aller-retour éditeur ↔ Markdown restreint', () => {
  it('conserve les articles existants à l’identique', () => {
    const md = `## Titre\n\n### Sous-titre\n\nUn **gras**, un *italique*, un [lien](https://exemple.fr).\n\n![Photo](${IMG})\n\n> Une citation\n\n- a\n- b\n\n1. un\n2. deux`;
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });
  it('gras + italique et lien contenant du gras restent lisibles par le rendu public', () => {
    const md = 'Du ***gras italique*** et [**lien gras**](https://exemple.fr).';
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });
  it('écarte les images hors blog et les liens dangereux', () => {
    const md = 'A ![x](https://evil.test/a.png) et [clic](javascript:alert(1)) fin';
    const out = docToMarkdown(markdownToDoc(md));
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('javascript:');
  });
  it('protège un paragraphe qui ressemblerait à un autre bloc', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '- pas une liste' }] }] };
    expect(markdownToDoc(docToMarkdown(doc)).content?.[0].type).toBe('paragraph');
  });
});
