'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Gift, Image as ImageIcon, Info, Radio, Rocket, Star, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FLAG_CATEGORIES, type FlagCategory, type FlagKey } from '@duomatch/types';
import { Badge, Card, IconButton, Skeleton, Switch } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

interface Flag { key: FlagKey; category: FlagCategory; emergency: boolean; defaultOn: boolean; enabled: boolean; overridden: boolean }
const ICONS: Record<FlagKey, LucideIcon> = {
  registration_open: UserPlus, payments_enabled: CreditCard, promo_codes: Gift, boosts: Rocket,
  live_match: Radio, super_likes: Star, chat_images: ImageIcon, referral_program: Users,
};

export default function AdminFlags() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [open, setOpen] = useState<FlagKey | null>(null);
  const flags = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api<Flag[]>('/admin/feature-flags') });
  const set = useMutation({
    mutationFn: ({ k, enabled }: { k: FlagKey; enabled: boolean }) => put(`/admin/feature-flags/${k}`, { enabled }),
    onSuccess: (_r, v) => { toast('success', t('admin.ff.saved', { name: t(`admin.ff.items.${v.k}.name` as never), state: t(v.enabled ? 'admin.ff.on' : 'admin.ff.off').toLowerCase() })); void qc.invalidateQueries({ queryKey: ['admin', 'flags'] }); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.ff.title')}</h2><p className="text-sm text-muted">{t('admin.ff.subtitle')}</p></header>
      {flags.isLoading && <Skeleton className="h-64" />}
      {flags.data && FLAG_CATEGORIES.map((cat) => {
        const items = flags.data.filter((f) => f.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h3 id={`cat-${cat}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t(`admin.ff.cat.${cat}` as never)}</h3>
            <Card className="divide-y divide-line px-5">
              {items.map((f) => {
                const Icon = ICONS[f.key];
                const name = t(`admin.ff.items.${f.key}.name` as never);
                const isOpen = open === f.key;
                return (
                  <div key={f.key} className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">{name}{f.emergency && <Badge tone="gold">{t('admin.ff.emergency')}</Badge>}</p>
                        <p className="text-xs text-muted">{f.enabled ? t('admin.ff.on') : t('admin.ff.off')}{!f.overridden && ` · ${t('admin.ff.default')}`}</p>
                      </div>
                      <IconButton label={t('admin.ff.info', { name })} tone="plain" className="text-brand-ink" aria-expanded={isOpen} aria-controls={`ff-${f.key}`} onClick={() => setOpen(isOpen ? null : f.key)}><Info className="size-5" aria-hidden /></IconButton>
                      <Switch checked={f.enabled} onChange={(v) => set.mutate({ k: f.key, enabled: v })} label={name} />
                    </div>
                    {isOpen && (
                      <div id={`ff-${f.key}`} className="mt-3 space-y-3 rounded-2xl bg-soft p-4 text-sm">
                        <p>{t(`admin.ff.items.${f.key}.what` as never)}</p>
                        <dl className="grid gap-3 sm:grid-cols-3">
                          <div><dt className="font-semibold">{t('admin.ff.whenOn')}</dt><dd className="text-muted">{t(`admin.ff.items.${f.key}.on` as never)}</dd></div>
                          <div><dt className="font-semibold">{t('admin.ff.whenOff')}</dt><dd className="text-muted">{t(`admin.ff.items.${f.key}.off` as never)}</dd></div>
                          <div><dt className="font-semibold">{t('admin.ff.useWhen')}</dt><dd className="text-muted">{t(`admin.ff.items.${f.key}.useWhen` as never)}</dd></div>
                        </dl>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
      <p className="text-xs text-muted">{t('admin.ff.note')}</p>
    </div>
  );
}
