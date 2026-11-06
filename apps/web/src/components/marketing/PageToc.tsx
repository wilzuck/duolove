import { getTranslations } from 'next-intl/server';
import { TocBar } from './TocBar';

/** « Sur cette page » : barre collante qui indique la section en cours de lecture. */
export async function PageToc({ items }: { items: readonly { id: string; label: string }[] }) {
  const t = await getTranslations();
  return <TocBar label={t('toc.onPage')} items={items} />;
}
