'use client';
import { ChevronLeft, ChevronRight, Heart, Loader2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, IconButton, buttonVariants, cn } from '@duomatch/ui';
import { ActionButton } from '@/components/app/ActionButton';
import { DuoGauge } from '@/components/app/DuoGauge';
import { countryName } from '@/components/app/ProfileCard';
import type { Card, DailyQuestionState } from '@/lib/types';
import { VerifiedBadge } from './VerifiedBadge';

/** « À la une » : une carte par personne, photo plein cadre avec un léger dégradé en bas, informations et gestes sous la photo. Défilement sans minuteur. */
export function HighlightCarousel({ items, question, busy, likeWithWord, onLike, onPass, onOpen }: {
  items: Card[]; question: DailyQuestionState['question']; busy: string | null; likeWithWord: boolean; onLike: (c: Card) => void; onPass: (c: Card) => void; onOpen: (c: Card) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => { const w = el.firstElementChild?.getBoundingClientRect().width ?? 1; setIndex(Math.round(el.scrollLeft / (w + 16))); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const w = el.firstElementChild?.getBoundingClientRect().width ?? 0;
    el.scrollTo({ left: Math.max(0, Math.min(items.length - 1, i)) * (w + 16), behavior: 'smooth' });
  };

  return (
    <section aria-roledescription="carousel" aria-label={t('engagement.carousel.label')} className="space-y-3">
      <ul ref={track} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none]" tabIndex={0} aria-label={t('engagement.carousel.label')}>
        {items.map((c, i) => {
          const photo = c.photos[0];
          const prompt = c.prompts?.[0];
          return (
            <li key={c.id} aria-roledescription="slide" aria-label={t('engagement.carousel.slide', { n: i + 1, m: items.length })} className="w-[85%] shrink-0 snap-center sm:w-80">
              <article className="overflow-hidden rounded-3xl border border-line bg-card shadow-soft">
                <div className="relative aspect-[4/5] bg-soft">
                  {photo ? <img src={photo.url} alt={t('engagement.carousel.photoOf', { name: c.displayName })} loading={i < 2 ? 'eager' : 'lazy'} className="size-full object-cover" /> : <div className="grid size-full place-items-center text-6xl font-extrabold text-brand/40" aria-hidden>{c.displayName[0]}</div>}
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/30 to-transparent p-4 pt-20 text-white">
                    <h3 className="flex items-center gap-1.5 font-display text-xl font-extrabold">{c.displayName}, {c.age}{c.verified && <VerifiedBadge size="md" />}</h3>
                    <p className="text-sm text-white/90">{c.city}, {countryName(c.country, locale)}</p>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  {prompt && <p className="rounded-2xl bg-soft p-3 text-sm"><span className="block text-xs text-muted">{locale === 'en' ? prompt.question.en : prompt.question.fr}</span><span className="font-display text-base">{prompt.answer}</span></p>}
                  {c.dailyQuestion && question && (() => {
                    const o = question.options.find((x) => x.key === c.dailyQuestion!.optionKey);
                    return o ? (
                      <p className={cn('rounded-2xl px-3 py-2 text-sm', c.dailyQuestion.same ? 'bg-success/15 text-success-ink' : 'bg-soft')} data-testid="daily-answer">
                        <span className="block text-xs text-muted">{locale === 'en' ? question.text.en : question.text.fr}</span>
                        <span className="font-semibold">{locale === 'en' ? o.en : o.fr}</span>
                        {c.dailyQuestion.same && <span className="mt-0.5 block text-xs font-semibold">{t('dailyQuestion.same', { name: c.displayName })}</span>}
                      </p>
                    ) : null;
                  })()}
                  {c.affinity && <DuoGauge affinity={c.affinity} />}
                  <div className="flex flex-wrap items-center gap-2">
                    {c.decision
                      ? <Badge tone="neutral">{t(c.decision === 'PASS' ? 'engagement.daily.passed' : 'engagement.daily.liked')}</Badge>
                      : (<><ActionButton kind="like" reach={80} disabled={busy === c.id} onAct={() => onLike(c)} className={cn(buttonVariants({}), 'flex-1')}>{busy === c.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Heart className="size-4 fill-current" aria-hidden />}{likeWithWord ? t('engagement.carousel.likeWithWord') : t('engagement.daily.like')}</ActionButton>
                          <Button variant="outline" onClick={() => onPass(c)} disabled={busy === c.id}><X className="size-4" aria-hidden />{t('engagement.daily.pass')}</Button></>)}
                    <Button variant="ghost" onClick={() => onOpen(c)}>{t('engagement.daily.details')}</Button>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <IconButton label={t('engagement.carousel.prev')} onClick={() => go(index - 1)} disabled={index <= 0}><ChevronLeft className="size-5" /></IconButton>
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label={t('engagement.carousel.dots')}>
            {items.map((c, i) => <button key={c.id} type="button" onClick={() => go(i)} aria-label={t('engagement.carousel.goTo', { n: i + 1 })} aria-current={i === index ? 'true' : undefined} className={cn('size-2.5 rounded-full transition', i === index ? 'bg-brand-strong' : 'bg-line hover:bg-muted')} />)}
          </div>
          <IconButton label={t('engagement.carousel.next')} onClick={() => go(index + 1)} disabled={index >= items.length - 1}><ChevronRight className="size-5" /></IconButton>
        </div>
      )}
    </section>
  );
}
