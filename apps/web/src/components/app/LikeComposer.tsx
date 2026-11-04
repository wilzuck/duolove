'use client';
import { useMutation } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Dialog, Textarea, cn } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { useEngagementConfig } from '@/hooks/useQueries';
import { post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card, LikeKind, SwipeResult } from '@/lib/types';

export interface LikeTarget { kind: LikeKind; ref: string | null }

/** J'aime ciblé (profil, photo, réponse ou centre d'intérêt) avec commentaire facultatif. Rien n'est envoyé sans clic explicite. */
export function LikeComposer({ card, open, initial, onClose, onDone }: { card: Card; open: boolean; initial?: LikeTarget; onClose: () => void; onDone?: (r: SwipeResult) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: cfg } = useEngagementConfig();
  const [target, setTarget] = useState<LikeTarget>(initial ?? { kind: 'PROFILE', ref: null });
  const [comment, setComment] = useState('');
  const max = cfg?.commentMax ?? 200;
  const kinds = (['PROFILE', ...(card.photos.length ? ['PHOTO'] : []), ...(card.prompts?.length ? ['PROMPT'] : []), ...(card.interests.length ? ['INTEREST'] : [])]) as LikeKind[];
  const send = useMutation({
    mutationFn: () => post<SwipeResult>('/swipes', { targetId: card.id, action: 'LIKE', targetKind: target.kind, ...(target.ref ? { targetRef: target.ref } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) }),
    onSuccess: (r) => { toast('success', t('engagement.composer.sent')); setComment(''); onDone?.(r); onClose(); },
    onError: (e) => toast('error', err(e)),
  });
  const ready = target.kind === 'PROFILE' || !!target.ref;
  return (
    <Dialog open={open} onClose={onClose} title={t('engagement.composer.title', { name: card.displayName })} closeLabel={t('common.close')} className="w-[min(94vw,32rem)]">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) send.mutate(); }}>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">{t('engagement.composer.what')}</legend>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => <button key={k} type="button" aria-pressed={target.kind === k} onClick={() => setTarget({ kind: k, ref: null })}
              className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold', target.kind === k ? 'border-brand-strong bg-brand-strong text-white' : 'border-line bg-card hover:bg-soft')}>{t(`engagement.composer.kind.${k}`)}</button>)}
          </div>
        </fieldset>
        {target.kind === 'PHOTO' && (
          <div className="space-y-2"><p className="text-sm font-semibold">{t('engagement.composer.choosePhoto')}</p>
            <ul className="flex gap-2 overflow-x-auto">{card.photos.map((p) => <li key={p.id}><button type="button" aria-pressed={target.ref === p.id} onClick={() => setTarget({ kind: 'PHOTO', ref: p.id })}
              className={cn('block rounded-xl ring-2', target.ref === p.id ? 'ring-brand-strong' : 'ring-transparent')}><img src={p.thumbUrl} alt={`${card.displayName} · ${card.photos.indexOf(p) + 1}`} className="size-20 rounded-xl object-cover" /></button></li>)}</ul></div>
        )}
        {target.kind === 'PROMPT' && (
          <div className="space-y-2"><p className="text-sm font-semibold">{t('engagement.composer.chooseAnswer')}</p>
            <ul className="space-y-2">{(card.prompts ?? []).map((a) => <li key={a.id}><button type="button" aria-pressed={target.ref === a.id} onClick={() => setTarget({ kind: 'PROMPT', ref: a.id })}
              className={cn('w-full rounded-2xl border p-3 text-left text-sm', target.ref === a.id ? 'border-brand-strong bg-soft' : 'border-line hover:bg-soft')}><span className="block font-semibold text-brand-ink">{locale === 'en' ? a.question.en : a.question.fr}</span>{a.answer}</button></li>)}</ul></div>
        )}
        {target.kind === 'INTEREST' && (
          <div className="space-y-2"><p className="text-sm font-semibold">{t('engagement.composer.chooseInterest')}</p>
            <ul className="flex flex-wrap gap-2">{card.interests.map((s) => <li key={s}><button type="button" aria-pressed={target.ref === s} onClick={() => setTarget({ kind: 'INTEREST', ref: s })}
              className={cn('rounded-full border px-3 py-1.5 text-sm', target.ref === s ? 'border-brand-strong bg-brand-strong text-white' : 'border-line hover:bg-soft')}>{t(`interest.${s}` as never)}</button></li>)}</ul></div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="like-comment" className="block text-sm font-semibold">{t('engagement.composer.comment')}</label>
          <Textarea id="like-comment" maxLength={max} className="min-h-24" placeholder={t('engagement.composer.placeholder')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <p className="flex justify-between text-xs text-muted"><span>{t('engagement.composer.hint')}</span><span>{t('engagement.composer.counter', { n: comment.length, max })}</span></p>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={send.isPending} disabled={!ready}><Heart className="size-5 fill-current" aria-hidden />{t('engagement.composer.send')}</Button>
      </form>
    </Dialog>
  );
}
