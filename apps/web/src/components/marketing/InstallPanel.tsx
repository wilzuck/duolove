'use client';
import { AccordionItem } from './AccordionItem';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, EllipsisVertical, Maximize, Monitor, Share, Smartphone, SquarePlus, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Badge, Button, cn } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { useInstall } from '@/hooks/useInstall';
import { api } from '@/lib/api';
import type { InstallPlatform } from '@/lib/install';

function Step({ n, children, icon }: { n: number; children: ReactNode; icon?: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-strong text-sm font-bold text-white" aria-hidden>{n}</span>
      <span className="min-w-0 flex-1 pt-1">{children}</span>
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-soft text-brand-ink" aria-hidden>{icon}</span>}
    </li>
  );
}

/** Page « Installer l'application » : bouton d'installation quand le navigateur le permet, sinon pas-à-pas pour Android, iPhone/iPad et ordinateur. */
export function InstallPanel() {
  const t = useTranslations();
  const { canPrompt, installed, platform, install } = useInstall();
  const count = useQuery({ queryKey: ['installs', 'public'], queryFn: () => api<{ count: number | null }>('/installs/public'), staleTime: 5 * 60_000 }).data?.count ?? null; // null : sous le seuil, rien à afficher
  const [picked, setPicked] = useState<InstallPlatform | null>(null);
  const [refused, setRefused] = useState(false);
  const active = picked ?? platform; // l'onglet du système détecté s'ouvre en premier
  const tabs: { key: InstallPlatform; label: string; icon: ReactNode }[] = [
    { key: 'android', label: t('install.tabAndroid'), icon: <Smartphone className="size-4" aria-hidden /> },
    { key: 'ios', label: t('install.tabIos'), icon: <Smartphone className="size-4" aria-hidden /> },
    { key: 'desktop', label: t('install.tabDesktop'), icon: <Monitor className="size-4" aria-hidden /> },
  ];
  return (
    <div className="space-y-10">
      <section aria-labelledby="install-now" className="rounded-[2rem] border border-line bg-card p-6 text-center shadow-soft md:p-8">
        <img src="/icon-192.png?v=3" alt="" width={96} height={96} className="mx-auto size-24 rounded-[1.4rem] shadow-pop" />
        {count !== null && <p className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full bg-soft px-4 py-1.5 text-sm font-semibold text-brand-ink"><Users className="size-4" aria-hidden />{t('install.count', { n: count })}</p>}
        <h2 id="install-now" className="mt-5 text-2xl font-extrabold">{installed ? t('install.installedTitle') : t('install.ready')}</h2>
        {installed ? (
          <>
            <p className="mx-auto mt-2 flex max-w-md items-center justify-center gap-2 text-muted"><Check className="size-5 text-success" aria-hidden />{t('install.installedText')}</p>
            <Link href="/discover" className="mt-6 inline-block"><Button size="lg">{t('install.open')}</Button></Link>
          </>
        ) : canPrompt ? (
          <>
            <p className="mx-auto mt-2 max-w-md text-muted">{t('install.readyText')}</p>
            <Button size="lg" className="mt-6" onClick={() => void install().then((r) => setRefused(r === 'dismissed'))}><Download className="size-5" aria-hidden />{t('install.cta')}</Button>
            {refused && <p role="status" className="mx-auto mt-3 max-w-md text-sm text-muted">{t('install.refused')}</p>}
          </>
        ) : (
          <p className="mx-auto mt-2 max-w-md text-muted">{t('install.manualText')}</p>
        )}
      </section>

      <section aria-labelledby="install-benefits">
        <h2 id="install-benefits" className="sr-only">{t('install.benefitsTitle')}</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {([
            [Zap, t('install.b1Title'), t('install.b1Text')],
            [Maximize, t('install.b2Title'), t('install.b2Text')],
            [Smartphone, t('install.b3Title'), t('install.b3Text')],
          ] as const).map(([Icon, title, text]) => (
            <li key={title} className="rounded-3xl border border-line bg-card p-5 shadow-soft">
              <span className="grid size-11 place-items-center rounded-2xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span>
              <p className="mt-3 font-bold">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="install-how">
        <h2 id="install-how" className="text-2xl font-bold">{t('install.howTitle')}</h2>
        {/* Onglets : trois colonnes égales sur téléphone (jamais empilés), icône au-dessus du nom ; en ligne dès `sm`. */}
        <div role="tablist" aria-label={t('install.howTitle')} className="mt-4 grid w-full grid-cols-3 gap-1 rounded-2xl border border-field-line bg-field p-1 sm:inline-grid sm:w-auto">
          {tabs.map((x) => (
            <button key={x.key} type="button" role="tab" id={`tab-${x.key}`} aria-selected={active === x.key} aria-controls={`panel-${x.key}`} onClick={() => setPicked(x.key)}
              className={cn('relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-sm font-semibold transition sm:flex-row sm:gap-2 sm:px-4', active === x.key ? 'bg-brand-strong text-white' : 'text-muted hover:bg-soft hover:text-fg')}>
              {x.icon}<span className="truncate">{x.label}</span>
              {x.key === platform && (
                <>
                  <span aria-hidden className={cn('absolute top-1.5 right-1.5 size-2 rounded-full sm:hidden', active === x.key ? 'bg-white' : 'bg-brand')} />
                  <span className="sr-only sm:hidden">{t('install.yours')}</span>
                  <Badge tone={active === x.key ? 'neutral' : 'brand'} className="hidden sm:inline-flex">{t('install.yours')}</Badge>
                </>
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="mt-5 rounded-3xl border border-line bg-card p-6 shadow-soft">
          {active === 'android' && (
            <ol className="space-y-4">
              <Step n={1}>{t('install.androidS1')}</Step>
              <Step n={2} icon={<EllipsisVertical className="size-5" />}>{t('install.androidS2')}</Step>
              <Step n={3} icon={<SquarePlus className="size-5" />}>{t('install.androidS3')}</Step>
              <Step n={4}>{t('install.androidS4')}</Step>
            </ol>
          )}
          {active === 'ios' && (
            <>
              <ol className="space-y-4">
                <Step n={1}>{t('install.iosS1')}</Step>
                <Step n={2} icon={<Share className="size-5" />}>{t('install.iosS2')}</Step>
                <Step n={3} icon={<SquarePlus className="size-5" />}>{t('install.iosS3')}</Step>
                <Step n={4}>{t('install.iosS4')}</Step>
              </ol>
              <p className="mt-5 rounded-2xl bg-soft p-3 text-sm text-muted">{t('install.iosNote')}</p>
            </>
          )}
          {active === 'desktop' && (
            <>
              <ol className="space-y-4">
                <Step n={1}>{t('install.desktopS1')}</Step>
                <Step n={2} icon={<Download className="size-5" />}>{t('install.desktopS2')}</Step>
                <Step n={3}>{t('install.desktopS3')}</Step>
              </ol>
              <p className="mt-5 rounded-2xl bg-soft p-3 text-sm text-muted">{t('install.desktopNote')}</p>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="install-faq" className="space-y-3">
        <h2 id="install-faq" className="text-2xl font-bold">{t('install.faqTitle')}</h2>
        {([['f1q', 'f1a'], ['f2q', 'f2a'], ['f3q', 'f3a']] as const).map(([q, a]) => (
          <AccordionItem key={q} question={t(`install.${q}`)} className="shadow-soft">{t(`install.${a}`)}</AccordionItem>
        ))}
      </section>
    </div>
  );
}
