import { ArrowDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/** « Sur cette page » : accès direct aux sections d'une longue page (ancres, sans JavaScript). */
export async function PageToc({ items }: { items: readonly { id: string; label: string }[] }) {
  const t = await getTranslations();
  return (
    <nav aria-label={t('toc.onPage')} className="mx-auto max-w-6xl px-4 pt-10">
      <p className="mb-3 text-sm font-semibold text-muted">{t('toc.onPage')}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold shadow-soft transition hover:border-brand-ink hover:text-brand-ink">
              {i.label}<ArrowDown className="size-4 shrink-0" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
