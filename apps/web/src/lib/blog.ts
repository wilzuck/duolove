export const BLOG_SLUGS = ['avoid-romance-scams', 'first-message', 'meet-safely'] as const;
export type BlogSlug = (typeof BLOG_SLUGS)[number];
