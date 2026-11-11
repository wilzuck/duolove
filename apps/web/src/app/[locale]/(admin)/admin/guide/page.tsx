'use client';
import { BadgeCheck, Ban, CheckCircle2, ChevronRight, Flag, Gift, Mail, MailCheck, Minus, Send, ShieldAlert, ShieldCheck, Sparkles, TrendingUp, UserCog, Users, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import { Badge, Card } from '@duomatch/ui';
import { Sparkline } from '@/components/admin/DashboardParts';
import { PageHeader } from '@/components/admin/PageParts';
import { Link } from '@/i18n/navigation';
import { SECTIONS } from '@/components/admin/AdminShell';

/** Rôle minimal pour chaque rubrique du menu, affiché en pastille (Modérateur < Admin < Super admin). */
const ROLE_TONE = { MODERATOR: 'neutral', ADMIN: 'brand', SUPER_ADMIN: 'gold' } as const;
const SEED = Array.from({ length: 14 }, (_, i) => ({ day: String(i), value: [3, 4, 3, 6, 5, 7, 6, 9, 8, 7, 10, 12, 11, 14][i]! }));

function Flow({ title, steps, to, toLabel }: { title: string; steps: { icon: LucideIcon; title: string; hint?: string }[]; to?: string; toLabel?: string }) {
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-lg font-extrabold">{title}</h3>{to && <Link href={to} className="text-sm font-semibold text-brand-ink hover:underline">{toLabel} →</Link>}</div>
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-2">
        {steps.map((s, i) => (
          <Fragment key={s.title}>
            {i > 0 && <li aria-hidden className="hidden pt-4 text-muted sm:block"><ChevronRight className="size-5" /></li>}
          <li className="flex items-center gap-3 sm:flex-1 sm:flex-col sm:text-center">
            <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft">
              <s.icon className="size-6" aria-hidden />
              <span className="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full border-2 border-card bg-card text-xs font-extrabold text-brand-ink">{i + 1}</span>
            </span>
            <span className="min-w-0 flex-1 sm:flex-none"><span className="block font-bold leading-tight">{s.title}</span>{s.hint && <span className="mt-0.5 block text-sm text-muted">{s.hint}</span>}</span>
          </li>
          </Fragment>
        ))}
      </ol>
    </Card>
  );
}

function Can({ yes }: { yes: boolean }) {
  return yes
    ? <span className="inline-flex size-7 items-center justify-center rounded-full bg-success/15 text-success-ink"><CheckCircle2 className="size-4" aria-hidden /><span className="sr-only">oui</span></span>
    : <span className="inline-flex size-7 items-center justify-center rounded-full bg-soft text-muted"><Minus className="size-4" aria-hidden /><span className="sr-only">non</span></span>;
}

const MATRIX: { key: string; icon: LucideIcon; mod: boolean; admin: boolean; sup: boolean }[] = [
  { key: 'reports', icon: Flag, mod: true, admin: true, sup: true },
  { key: 'sanction', icon: Ban, mod: true, admin: true, sup: true },
  { key: 'members', icon: Users, mod: true, admin: true, sup: true },
  { key: 'email', icon: Mail, mod: false, admin: true, sup: true },
  { key: 'money', icon: Gift, mod: false, admin: true, sup: true },
  { key: 'settings', icon: Sparkles, mod: false, admin: true, sup: true },
  { key: 'roles', icon: UserCog, mod: false, admin: false, sup: true },
  { key: 'staff', icon: ShieldAlert, mod: false, admin: false, sup: true },
];

function Callout({ n, children }: { n: number; children: ReactNode }) {
  return <li className="flex items-start gap-3 text-sm"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-strong text-xs font-extrabold text-white">{n}</span><span>{children}</span></li>;
}

export default function AdminGuide() {
  const t = useTranslations();
  return (
    <div className="space-y-10">
      <PageHeader title={t('admin.nav.guide')} description={t('admin.guide.intro')} />

      <section aria-labelledby="g-start" className="space-y-3">
        <h3 id="g-start" className="font-display text-lg font-extrabold">{t('admin.guide.startTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['/admin/reports', Flag, 'a'], ['/admin/users', Users, 'b'], ['/admin/newsletter', Send, 'c']] as const).map(([href, Icon, k]) => (
            <Link key={k} href={href} className="group flex flex-col gap-3 rounded-3xl border border-line bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-strong">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-soft text-brand-ink"><Icon className="size-6" aria-hidden /></span>
              <span className="font-bold">{t(`admin.guide.start.${k}`)}</span>
              <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-brand-ink">{t(`admin.guide.start.${k}Go`)}<ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="g-map" className="space-y-4">
        <div><h3 id="g-map" className="font-display text-lg font-extrabold">{t('admin.guide.mapTitle')}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">{t('admin.guide.legend')}<Badge tone="neutral">{t('admin.guide.roles.MODERATOR')}</Badge><Badge tone="brand">{t('admin.guide.roles.ADMIN')}</Badge><Badge tone="gold">{t('admin.guide.roles.SUPER_ADMIN')}</Badge></p></div>
        {SECTIONS.map((sec) => (
          <div key={sec.id} className="space-y-2">
            <p className="text-xs font-bold tracking-wider text-muted uppercase">{t(`admin.sections.${sec.id}` as never)}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sec.items.filter((i) => i.key !== 'guide').map(({ href, key, icon: Icon, min }) => (
                <Link key={key} href={href} className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-brand-strong hover:bg-soft">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="font-bold">{t(`admin.nav.${key}` as never)}</span><Badge tone={ROLE_TONE[min]}>{t(`admin.guide.roles.${min}`)}</Badge></span>
                    <span className="mt-0.5 block text-sm text-muted">{t(`admin.guide.what.${key}` as never)}</span></span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="g-flows" className="space-y-4">
        <h3 id="g-flows" className="font-display text-lg font-extrabold">{t('admin.guide.flowsTitle')}</h3>
        <Flow title={t('admin.guide.f1.title')} to="/admin/reports" toLabel={t('admin.guide.open')} steps={[
          { icon: Flag, title: t('admin.guide.f1.s1'), hint: t('admin.guide.f1.h1') }, { icon: ShieldCheck, title: t('admin.guide.f1.s2'), hint: t('admin.guide.f1.h2') },
          { icon: CheckCircle2, title: t('admin.guide.f1.s3'), hint: t('admin.guide.f1.h3') }, { icon: Ban, title: t('admin.guide.f1.s4'), hint: t('admin.guide.f1.h4') }]} />
        <Flow title={t('admin.guide.f2.title')} to="/admin/users" toLabel={t('admin.guide.open')} steps={[
          { icon: Users, title: t('admin.guide.f2.s1'), hint: t('admin.guide.f2.h1') }, { icon: BadgeCheck, title: t('admin.guide.f2.s2'), hint: t('admin.guide.f2.h2') },
          { icon: Gift, title: t('admin.guide.f2.s3'), hint: t('admin.guide.f2.h3') }, { icon: CheckCircle2, title: t('admin.guide.f2.s4'), hint: t('admin.guide.f2.h4') }]} />
        <Flow title={t('admin.guide.f3.title')} to="/admin/newsletter" toLabel={t('admin.guide.open')} steps={[
          { icon: Mail, title: t('admin.guide.f3.s1'), hint: t('admin.guide.f3.h1') }, { icon: Sparkles, title: t('admin.guide.f3.s2'), hint: t('admin.guide.f3.h2') },
          { icon: Send, title: t('admin.guide.f3.s3'), hint: t('admin.guide.f3.h3') }, { icon: MailCheck, title: t('admin.guide.f3.s4'), hint: t('admin.guide.f3.h4') }]} />
      </section>

      <section aria-labelledby="g-who" className="space-y-3">
        <h3 id="g-who" className="font-display text-lg font-extrabold">{t('admin.guide.whoTitle')}</h3>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[30rem] text-sm">
            <thead><tr className="border-b border-line text-left"><th scope="col" className="p-4 font-semibold text-muted">{t('admin.guide.whoCan')}</th>
              {(['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const).map((r) => <th key={r} scope="col" className="p-4 text-center"><Badge tone={ROLE_TONE[r]}>{t(`admin.guide.roles.${r}`)}</Badge></th>)}</tr></thead>
            <tbody>
              {MATRIX.map((m) => (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <th scope="row" className="p-4 text-left font-medium"><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft text-brand-ink"><m.icon className="size-4" aria-hidden /></span>{t(`admin.guide.can.${m.key}` as never)}</span></th>
                  <td className="p-4 text-center"><Can yes={m.mod} /></td><td className="p-4 text-center"><Can yes={m.admin} /></td><td className="p-4 text-center"><Can yes={m.sup} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="g-read" className="space-y-3">
        <h3 id="g-read" className="font-display text-lg font-extrabold">{t('admin.guide.readTitle')}</h3>
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
          <Card className="flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between text-sm text-muted"><span>{t('admin.guide.read.label')}</span><Users className="size-5 text-brand" aria-hidden /></div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-display text-3xl font-extrabold">89</span>
              <Badge tone="success"><TrendingUp className="size-3" aria-hidden />+12 %</Badge></div>
            <Sparkline points={SEED} />
            <p className="text-xs text-muted">{t('admin.guide.read.hint')}</p>
          </Card>
          <ul className="space-y-3">
            <Callout n={1}>{t('admin.guide.read.c1')}</Callout>
            <Callout n={2}>{t('admin.guide.read.c2')}</Callout>
            <Callout n={3}>{t('admin.guide.read.c3')}</Callout>
            <Callout n={4}>{t('admin.guide.read.c4')}</Callout>
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['ok', 'success', '< 30 %', 'thin'], ['ok2', 'success', '≤ 1,5', 'ratio'], ['ok3', 'success', '> 90 %', 'mail']] as const).map(([k, , v, name]) => (
            <Card key={k} className="flex items-center gap-4 p-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success/15 font-display text-sm font-extrabold text-success-ink">{v}</span><span className="text-sm"><span className="block font-bold">{t(`admin.guide.target.${name}`)}</span><span className="text-muted">{t(`admin.guide.target.${name}Hint`)}</span></span></Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="g-safe" className="space-y-3">
        <h3 id="g-safe" className="font-display text-lg font-extrabold">{t('admin.guide.safeTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([[ShieldCheck, 'log'], [X, 'share'], [ShieldAlert, 'kill'], [Mail, 'privacy']] as const).map(([Icon, k]) => (
            <Card key={k} className="space-y-2 p-4"><span className="flex size-10 items-center justify-center rounded-xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span><p className="font-bold">{t(`admin.guide.safe.${k}`)}</p><p className="text-sm text-muted">{t(`admin.guide.safe.${k}Hint`)}</p></Card>
          ))}
        </div>
      </section>
    </div>
  );
}
