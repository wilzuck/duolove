'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Clock, Coins, Crown, MessageCircle, Radio, Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { COUNTRIES, LIVING, SEEKING, type LiveCriteria } from '@duomatch/types';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, Switch } from '@duomatch/ui';
import { countryName } from '@/components/app/ProfileCard';
import { useApiError } from '@/hooks/useApiError';
import { keys, useLive, useLiveInvites } from '@/hooks/useQueries';
import { Link, useRouter } from '@/i18n/navigation';
import { del, post, put } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { Card as ProfileCardT, LiveState } from '@/lib/types';

type Draft = { seeking: LiveCriteria['seeking']; ageMin: number; ageMax: number; country: string; hasChildren: LiveCriteria['hasChildren']; likesPets: LiveCriteria['likesPets']; living: LiveCriteria['living']; heightMin: string; heightMax: string; originCountry: string };

const draftFrom = (d: LiveState['defaults'], c?: LiveCriteria): Draft => ({
  seeking: c?.seeking ?? d.seeking, ageMin: c?.ageMin ?? d.ageMin, ageMax: c?.ageMax ?? d.ageMax, country: c?.country ?? d.country ?? '',
  hasChildren: c?.hasChildren ?? 'ANY', likesPets: c?.likesPets ?? 'ANY', living: c?.living ?? 'ANY',
  heightMin: c?.heightMin ? String(c.heightMin) : '', heightMax: c?.heightMax ? String(c.heightMax) : '', originCountry: c?.originCountry ?? '',
});
const toCriteria = (d: Draft): LiveCriteria => ({
  seeking: d.seeking, ageMin: d.ageMin, ageMax: d.ageMax, country: d.country || null, hasChildren: d.hasChildren, likesPets: d.likesPets, living: d.living,
  heightMin: d.heightMin ? Number(d.heightMin) : null, heightMax: d.heightMax ? Number(d.heightMax) : null, originCountry: d.originCountry || null,
});

/** Horloge d'une seconde pour les comptes à rebours (valeur d'état : jamais d'appel impur pendant le rendu). */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

function CriteriaForm({ value, onChange }: { value: Draft; onChange: (d: Draft) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...value, [k]: v });
  const tri = (label: string, k: 'hasChildren' | 'likesPets') => (
    <Field label={label}>{(p) => <Select {...p} value={value[k]} onChange={(e) => set(k, e.target.value as Draft[typeof k])}><option value="ANY">{t('live.any')}</option><option value="YES">{t('life.yes')}</option><option value="NO">{t('life.no')}</option></Select>}</Field>
  );
  const countries = COUNTRIES.map((c) => <option key={c.code} value={c.code}>{locale === 'en' ? c.en : c.fr}</option>);
  return (
    <div className="space-y-5">
      <Field label={t('prefs.seeking')}>{(p) => <Select {...p} value={value.seeking} onChange={(e) => set('seeking', e.target.value as Draft['seeking'])}>{SEEKING.map((s) => <option key={s} value={s}>{t(`seeking.${s}`)}</option>)}</Select>}</Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('prefs.ageMin')}>{(p) => <Input {...p} type="number" min={18} max={99} value={value.ageMin} onChange={(e) => set('ageMin', Math.min(99, Math.max(18, Number(e.target.value) || 18)))} />}</Field>
        <Field label={t('prefs.ageMax')}>{(p) => <Input {...p} type="number" min={18} max={99} value={value.ageMax} onChange={(e) => set('ageMax', Math.min(99, Math.max(18, Number(e.target.value) || 18)))} />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('prefs.country')}>{(p) => <Select {...p} value={value.country} onChange={(e) => set('country', e.target.value)}><option value="">{t('prefs.anyCountry')}</option>{countries}</Select>}</Field>
        <Field label={t('life.origin')}>{(p) => <Select {...p} value={value.originCountry} onChange={(e) => set('originCountry', e.target.value)}><option value="">{t('live.any')}</option>{countries}</Select>}</Field>
        {tri(t('life.hasChildren'), 'hasChildren')}
        {tri(t('life.likesPets'), 'likesPets')}
        <Field label={t('life.living')}>{(p) => <Select {...p} value={value.living} onChange={(e) => set('living', e.target.value as Draft['living'])}><option value="ANY">{t('live.any')}</option>{LIVING.map((l) => <option key={l} value={l}>{t(`life.livingOpt.${l}`)}</option>)}</Select>}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('live.heightMin')}>{(p) => <Input {...p} type="number" inputMode="numeric" min={120} max={230} value={value.heightMin} onChange={(e) => set('heightMin', e.target.value)} />}</Field>
          <Field label={t('live.heightMax')}>{(p) => <Input {...p} type="number" inputMode="numeric" min={120} max={230} value={value.heightMax} onChange={(e) => set('heightMax', e.target.value)} />}</Field>
        </div>
      </div>
      <p className="text-xs text-muted">{t('live.strictNote')}</p>
    </div>
  );
}

function PersonCard({ c, locale, children }: { c: ProfileCardT; locale: string; children: React.ReactNode }) {
  const t = useTranslations();
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <Avatar src={c.photos[0]?.thumbUrl} name={c.displayName} size={64} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-bold">{c.displayName}, {c.age}{c.verified && <BadgeCheck className="size-4 text-sky-500" aria-label={t('profile.verified')} />}</p>
        <p className="text-sm text-muted">{c.city}, {countryName(c.country, locale)}</p>
        {c.bio && <p className="mt-1 line-clamp-2 text-sm">{c.bio}</p>}
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </Card>
  );
}

export default function MatchPage() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: live, isLoading, isError } = useLive();
  const { data: incoming } = useLiveInvites();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const now = useNow();

  const refresh = () => { void qc.invalidateQueries({ queryKey: keys.live }); void qc.invalidateQueries({ queryKey: keys.me }); void qc.invalidateQueries({ queryKey: ['credits'] }); };
  const start = useMutation({
    mutationFn: (c: LiveCriteria) => post<LiveState & { invited: number }>('/live/searches', c),
    onSuccess: (r) => { setEditing(false); setDraft(null); refresh(); toast(r.invited > 0 ? 'success' : 'info', r.invited > 0 ? t('live.started', { n: r.invited }) : t('live.startedNobody')); },
    onError: (e) => toast('error', err(e)),
  });
  const cancel = useMutation({ mutationFn: () => del('/live/searches/active'), onSuccess: refresh, onError: (e) => toast('error', err(e)) });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => post(`/live/invites/${id}/${accept ? 'accept' : 'decline'}`),
    onSuccess: (_r, v) => { void qc.invalidateQueries({ queryKey: keys.liveInvites }); refresh(); if (v.accept) toast('success', t('live.accepted')); },
    onError: (e) => { toast('error', err(e)); void qc.invalidateQueries({ queryKey: keys.liveInvites }); },
  });
  const choose = useMutation({
    mutationFn: (id: string) => post<{ conversationId: string; charged: number }>(`/live/invites/${id}/choose`),
    onSuccess: (r) => { refresh(); toast('success', r.charged ? t('live.chosen', { n: r.charged }) : t('live.chosenFree')); router.push(`/messages/${r.conversationId}`); },
    onError: (e) => { toast('error', err(e)); refresh(); },
  });
  const optIn = useMutation({ mutationFn: (enabled: boolean) => put('/live/opt-in', { enabled }), onSuccess: refresh, onError: (e) => toast('error', err(e)) });

  if (isError) return <div className="mx-auto max-w-2xl p-4"><EmptyState icon={<Radio className="size-8" />} title={t('live.unavailable')}>{t('live.unavailableText')}</EmptyState></div>;
  if (isLoading || !live) return <div className="mx-auto max-w-2xl space-y-4 p-4"><Skeleton className="h-28" /><Skeleton className="h-72" /></div>;

  const search = live.search;
  const waitMs = live.nextLaunchAt ? Math.max(0, new Date(live.nextLaunchAt).getTime() - now) : 0;
  const waitLabel = `${Math.floor(waitMs / 60_000)}:${String(Math.floor((waitMs % 60_000) / 1000)).padStart(2, '0')}`;
  const form = draft ?? draftFrom(live.defaults, search?.criteria);
  const showForm = !search || editing;
  const hasTokens = live.tokens >= live.rules.tokensPerChat;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-extrabold"><Radio className="size-6 text-brand-strong" aria-hidden />{t('live.title')}</h1><p className="mt-1 text-muted">{t('live.subtitle')}</p></div>
        <Link href="/shop" className="flex items-center gap-2 rounded-2xl bg-soft px-4 py-2 font-semibold text-brand-ink hover:bg-brand/15" aria-label={t('live.tokensAria', { n: live.tokens })}>
          <Coins className="size-5" aria-hidden /><span>{live.tokens}</span><span className="text-sm font-medium">{t('shop.tokens')}</span>
        </Link>
      </header>

      {live.tokens === 0 && live.gift.completeness < 100 && (
        <Card className="flex items-start gap-3 border-brand/30 bg-soft p-4">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
          <p className="text-sm"><strong>{t('live.giftTitle', { n: live.gift.tokens })}</strong> {t('live.giftText', { pct: live.gift.completeness })} <Link href="/profile" className="font-semibold text-brand-ink underline">{t('live.giftCta')}</Link></p>
        </Card>
      )}

      {(incoming?.items.length ?? 0) > 0 && (
        <section aria-labelledby="inv" className="space-y-3">
          <h2 id="inv" className="font-bold">{t('live.incoming', { n: incoming!.items.length })}</h2>
          <p className="text-sm text-muted">{t('live.incomingText')}</p>
          {incoming!.items.map((c) => (
            <PersonCard key={c.inviteId} c={c} locale={locale}>
              <Button size="sm" onClick={() => respond.mutate({ id: c.inviteId, accept: true })} disabled={respond.isPending}>{t('live.accept')}</Button>
              <Button size="sm" variant="outline" onClick={() => respond.mutate({ id: c.inviteId, accept: false })} disabled={respond.isPending} aria-label={t('live.decline')}><X className="size-4" aria-hidden /></Button>
            </PersonCard>
          ))}
        </section>
      )}

      {!live.access.canStart && !search ? (
        <Card className="space-y-3 border-brand/30 bg-linear-to-br from-soft to-card p-6 text-center">
          <Crown className="mx-auto size-8 text-brand-strong" aria-hidden />
          <h2 className="text-lg font-bold">{t('live.paywallTitle')}</h2>
          <p className="text-sm text-muted">{t('live.paywallText')}</p>
          <Link href="/premium"><Button>{t('app.goPremium')}</Button></Link>
        </Card>
      ) : showForm ? (
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{search ? t('live.editTitle') : t('live.criteriaTitle')}</h2>
            {live.access.trialsLeft !== null && <Badge tone="brand">{t('live.trialsLeft', { n: live.access.trialsLeft })}</Badge>}
          </div>
          <CriteriaForm value={form} onChange={setDraft} />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => start.mutate(toCriteria(form))} loading={start.isPending} disabled={waitMs > 0 || form.ageMin > form.ageMax}>{search ? t('live.relaunch') : t('live.launch')}</Button>
            {search && <Button variant="outline" onClick={() => { setEditing(false); setDraft(null); }}>{t('common.cancel')}</Button>}
            {waitMs > 0 && <span className="flex items-center gap-1.5 text-sm text-muted" role="status"><Clock className="size-4" aria-hidden />{t('live.wait', { time: waitLabel })}</span>}
          </div>
          <p className="text-xs text-muted">{t('live.rulesNote', { chats: live.rules.maxChoices, tokens: live.rules.tokensPerChat, hours: live.rules.searchHours, minutes: live.rules.cooldownMinutes })}</p>
        </Card>
      ) : search && (
        <section aria-labelledby="srch" className="space-y-4">
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="srch" className="flex items-center gap-2 font-bold"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex size-2.5 rounded-full bg-success" /></span>{t('live.searching')}</h2>
              <Badge tone="neutral">{t('live.until', { time: formatTime(search.expiresAt, locale) })}</Badge>
            </div>
            <p className="text-sm text-muted" role="status">{t('live.progress', { pending: search.pending, accepted: live.accepted.filter((a) => a.status === 'ACCEPTED').length })}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { setDraft(null); setEditing(true); }}>{t('live.editCriteria')}</Button>
              <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} loading={cancel.isPending}>{t('live.stop')}</Button>
              {waitMs > 0 && <span className="flex items-center gap-1.5 text-xs text-muted"><Clock className="size-3.5" aria-hidden />{t('live.wait', { time: waitLabel })}</span>}
            </div>
          </Card>

          <h2 className="font-bold">{t('live.acceptedTitle')}</h2>
          {live.accepted.length === 0 ? (
            <EmptyState icon={<Radio className="size-8" />} title={t('live.noneYet')}>{t('live.noneYetText')}</EmptyState>
          ) : (
            <>
              <p className="text-sm text-muted">{t('live.choicesLeft', { n: search.choicesLeft, max: live.rules.maxChoices })}</p>
              {live.accepted.map((c) => (
                <PersonCard key={c.inviteId} c={c} locale={locale}>
                  {c.status === 'CHOSEN' && c.conversationId ? (
                    <Link href={`/messages/${c.conversationId}`}><Button size="sm" variant="outline"><MessageCircle className="size-4" aria-hidden />{t('live.openChat')}</Button></Link>
                  ) : !hasTokens ? (
                    <Link href="/shop"><Button size="sm" variant="secondary"><Coins className="size-4" aria-hidden />{t('live.buyTokens')}</Button></Link>
                  ) : (
                    <Button size="sm" onClick={() => choose.mutate(c.inviteId)} loading={choose.isPending && choose.variables === c.inviteId} disabled={search.choicesLeft < 1 || choose.isPending}>
                      <MessageCircle className="size-4" aria-hidden />{t('live.talk', { n: live.rules.tokensPerChat })}
                    </Button>
                  )}
                </PersonCard>
              ))}
            </>
          )}
        </section>
      )}

      <Card className="flex items-center justify-between gap-4 p-4">
        <div><p className="font-semibold">{t('live.optInTitle')}</p><p className="text-sm text-muted">{t('live.optInText')}</p></div>
        <Switch checked={live.optIn} onChange={(v) => optIn.mutate(v)} label={t('live.optInTitle')} disabled={optIn.isPending} />
      </Card>
    </div>
  );
}
