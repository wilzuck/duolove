'use client';
import { Heart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PromptAnswer } from '@/lib/types';

/** Réponses aux questions de personnalité. `onLike` (facultatif) affiche un bouton pour aimer une réponse précise. */
export function PromptList({ items, onLike }: { items: PromptAnswer[]; onLike?: (a: PromptAnswer) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  if (!items.length) return null;
  return (
    <section aria-labelledby="prm"><h3 id="prm" className="mb-3 text-xl font-bold">{t('engagement.prompts.viewTitle')}</h3>
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-sm font-semibold text-brand-ink">{locale === 'en' ? a.question.en : a.question.fr}</p>
            <p className="mt-1 whitespace-pre-line">{a.answer}</p>
            {onLike && <button type="button" onClick={() => onLike(a)} className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-soft"><Heart className="size-4" aria-hidden />{t('engagement.prompts.likeAnswer')}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
