'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Star, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { BOOST_MINUTES } from '@duomatch/types';
import { Button, Popover, Switch, buttonVariants, cn } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { keys, useMyProfile } from '@/hooks/useQueries';
import { Link } from '@/i18n/navigation';
import { patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { Me } from '@/lib/types';

const BOOSTS = ['BOOST_30', 'BOOST_120', 'BOOST_1440'] as const;

/** Bouton rond de la barre du haut (ordinateur) avec pastille de solde et petite fenêtre au clic. Un seul style discret : fond rose très pâle, texte rose d'encre. */
function TopAction({ icon, label, badge, active, children }: { icon: ReactNode; label: string; badge?: number | string; active?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label}
        className={cn('relative flex size-10 items-center justify-center rounded-full bg-soft text-brand-ink transition hover:bg-brand/15', active && 'ring-2 ring-brand-strong')}>
        {icon}
        {badge !== undefined && <span aria-hidden className="absolute -top-1 -right-1 flex min-w-4.5 items-center justify-center rounded-full bg-brand-strong px-1 text-[10px] font-bold text-white">{badge}</span>}
      </button>
      <Popover open={open} anchorRef={ref as RefObject<HTMLElement | null>} onClose={() => setOpen(false)} align="end" className="w-72 p-4">{children(() => setOpen(false))}</Popover>
    </div>
  );
}

const shopLink = (hash: string, label: string, onClick: () => void) => (
  <Link href={`/shop#${hash}`} onClick={onClick} className={cn(buttonVariants({ size: 'sm' }), 'mt-3 w-full')}>{label}</Link>
);

/** Super Likes, Boost et Mode privé à portée de clic sur ordinateur (le téléphone garde sa barre du bas). Rien de nouveau côté serveur : soldes, boosts et réglage existent déjà. */
export function TopBarActions({ me }: { me: Me }) {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const profile = useMyProfile().data;
  const c = me.entitlement.credits;
  const superLikes = c.SUPER_LIKE ?? 0;
  const boosts = BOOSTS.reduce((n, k) => n + (c[k] ?? 0), 0);
  const boostedUntil = profile?.boostedUntil && new Date(profile.boostedUntil) > new Date() ? profile.boostedUntil : null;
  const activate = useMutation({
    mutationFn: (creditType: string) => post('/boosts/activate', { creditType }),
    onSuccess: () => { toast('success', t('shop.boostActivated')); void qc.invalidateQueries({ queryKey: ['credits'] }); void qc.invalidateQueries({ queryKey: keys.profile }); void qc.invalidateQueries({ queryKey: keys.me }); },
    onError: (e) => toast('error', err(e)),
  });
  const incognito = useMutation({
    mutationFn: (v: boolean) => patch('/profiles/me/settings', { incognito: v }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: keys.profile }); },
    onError: (e) => toast('error', err(e)),
  });
  const mins = (k: (typeof BOOSTS)[number]) => BOOST_MINUTES[k];
  const dur = (m: number) => (m >= 60 ? t('plans.hoursShort', { n: m / 60 }) : t('plans.minutesShort', { n: m }));

  return (
    <div className="mr-2 hidden items-center gap-2 lg:flex" role="group" aria-label={t('topbar.group')}>
      <TopAction icon={<Star className="size-5" aria-hidden />} label={t('topbar.superLike.title')} badge={superLikes}>
        {(close) => (
          <div>
            <h3 className="font-bold">{t('topbar.superLike.title')}</h3>
            <p className="mt-1 text-sm text-muted">{t('topbar.superLike.text')}</p>
            <p className="mt-2 text-sm font-semibold">{t('topbar.superLike.balance', { n: superLikes })}</p>
            {shopLink('prod-SUPER_LIKE_PACK', t('topbar.buy'), close)}
          </div>
        )}
      </TopAction>
      <TopAction icon={<Zap className="size-5" aria-hidden />} label={t('topbar.boost.title')} badge={boosts > 0 ? boosts : undefined} active={!!boostedUntil}>
        {(close) => (
          <div>
            <h3 className="font-bold">{t('topbar.boost.title')}</h3>
            <p className="mt-1 text-sm text-muted">{t('topbar.boost.text')}</p>
            {boostedUntil && <p role="status" className="mt-2 rounded-xl bg-soft p-2 text-sm font-medium text-brand-ink">{t('shop.boostActive', { date: formatDate(boostedUntil, locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) })}</p>}
            {boosts > 0 && !boostedUntil && (
              <div className="mt-3 space-y-2">
                {BOOSTS.filter((k) => (c[k] ?? 0) > 0).map((k) => (
                  <Button key={k} size="sm" variant="outline" className="w-full" loading={activate.isPending && activate.variables === k} onClick={() => activate.mutate(k, { onSuccess: close })}>{t('topbar.boost.activate', { duration: dur(mins(k)), n: c[k] ?? 0 })}</Button>
                ))}
              </div>
            )}
            {shopLink('prod-BOOST', t('topbar.buy'), close)}
          </div>
        )}
      </TopAction>
      <TopAction icon={<EyeOff className="size-5" aria-hidden />} label={t('topbar.private.title')} active={!!profile?.incognito}>
        {(close) => (
          <div>
            <h3 className="font-bold">{t('topbar.private.title')}</h3>
            <p className="mt-1 text-sm text-muted">{t(me.entitlement.limits.incognito ? 'topbar.private.text' : 'topbar.private.locked')}</p>
            {me.entitlement.limits.incognito
              ? <label className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold">{t('topbar.private.switch')}<Switch checked={!!profile?.incognito} disabled={!profile || incognito.isPending} label={t('topbar.private.switch')} onChange={(v) => incognito.mutate(v)} /></label>
              : <Link href="/premium" onClick={close} className={cn(buttonVariants({ size: 'sm' }), 'mt-3 w-full')}>{t('topbar.private.upgrade')}</Link>}
          </div>
        )}
      </TopAction>
    </div>
  );
}
