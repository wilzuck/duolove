import type { BlogCard, BlogPostFull } from './types';

const API = () => (process.env.API_URL ?? 'http://localhost:4000').trim();

/** Articles publiés (rendu serveur, revalidé toutes les 30 s). Une API injoignable donne une liste vide, jamais une page cassée. */
export async function fetchPosts(locale: string): Promise<BlogCard[]> {
  try {
    const res = await fetch(`${API()}/api/blog?locale=${encodeURIComponent(locale)}`, { next: { revalidate: 300, tags: ['blog'] } });
    if (!res.ok) return [];
    return ((await res.json()) as { items: BlogCard[] }).items;
  } catch {
    return [];
  }
}

export async function fetchPost(slug: string, locale: string): Promise<BlogPostFull | null> {
  try {
    const res = await fetch(`${API()}/api/blog/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`, { next: { revalidate: 300, tags: ['blog'] } });
    return res.ok ? ((await res.json()) as BlogPostFull) : null;
  } catch {
    return null;
  }
}
