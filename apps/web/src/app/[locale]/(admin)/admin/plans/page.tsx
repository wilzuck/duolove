'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { DURATION_MONTHS, PLAN_FEATURE_KEYS, priceForDuration, type PlanFeatures } from '@duomatch/types';
import { Badge, Button, Card, DataTable, Field, Input, Skeleton, Switch } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, patch } from '@/lib/api';
import { formatXof } from '@/lib/format';
import { useUi } from '@/lib/store';

interface PlanRow { id: string; code: string; name: string; priceXof: number; active: boolean; featured: boolean; sortOrder: number; features: PlanFeatures; prices: { months: number; discountPercent: number; amountOverride: number | null; active: boolean }[] }
interface ProductRow { id: string; code: string; name: string; priceXof: number; quantity: number; active: boolean; kind: string }

const num = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

function PlanEditor({ plan }: { plan: PlanRow }) {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [d, setD] = useState(() => ({ name: plan.name, priceXof: plan.priceXof, active: plan.active, featured: plan.featured, sortOrder: plan.sortOrder, features: plan.features,
    prices: DURATION_MONTHS.map((m) => { const p = plan.prices.find((x) => x.months === m); return { months: m, discountPercent: p?.discountPercent ?? 0, amountOverride: p?.amountOverride ?? null, active: p?.active ?? true }; }) }));
  const save = useMutation({
    mutationFn: () => patch(`/admin/plans/${plan.code}`, { name: d.name, priceXof: d.priceXof, active: d.active, featured: d.featured, sortOrder: d.sortOrder, features: d.features, ...(plan.code === 'FREE' ? {} : { prices: d.prices }) }),
    onSuccess: () => { toast('success', t('admin.plans.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'plans'] }); void qc.invalidateQueries({ queryKey: ['plans'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const setF = <K extends keyof PlanFeatures>(k: K, v: PlanFeatures[K]) => setD({ ...d, features: { ...d.features, [k]: v } });
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-bold">{plan.code}<Badge tone={d.active ? 'success' : 'neutral'}>{d.active ? t('admin.plans.active') : t('admin.plans.inactive')}</Badge></h2>
        <div className="flex items-center gap-4 text-sm"><label className="flex items-center gap-2">{t('admin.plans.featured')}<Switch checked={d.featured} onChange={(v) => setD({ ...d, featured: v })} label={t('admin.plans.featured')} /></label>
          <label className="flex items-center gap-2">{t('admin.plans.active')}<Switch checked={d.active} disabled={plan.code === 'FREE'} onChange={(v) => setD({ ...d, active: v })} label={t('admin.plans.active')} /></label></div></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('admin.plans.name')}>{(p) => <Input {...p} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
        <Field label={t('admin.plans.monthlyPrice')} hint={t('admin.plans.currencyHint')}>{(p) => <Input {...p} type="number" min={0} disabled={plan.code === 'FREE'} value={d.priceXof} onChange={(e) => setD({ ...d, priceXof: num(e.target.value) })} />}</Field>
        <Field label={t('admin.plans.order')}>{(p) => <Input {...p} type="number" min={0} value={d.sortOrder} onChange={(e) => setD({ ...d, sortOrder: num(e.target.value) })} />}</Field>
      </div>
      <fieldset className="space-y-3"><legend className="font-bold">{t('admin.plans.featuresTitle')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLAN_FEATURE_KEYS.map((k) => {
            const v = d.features[k];
            return typeof v === 'boolean'
              ? <label key={k} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm"><code>{k}</code><Switch checked={v} onChange={(x) => setF(k, x as never)} label={k} /></label>
              : <Field key={k} label={k} hint={k === 'daily_likes_limit' ? t('admin.plans.unlimitedHint') : undefined}>{(p) => <Input {...p} type="number" min={k === 'daily_likes_limit' ? -1 : 0} value={v as number} onChange={(e) => setF(k, num(e.target.value) as never)} />}</Field>;
          })}
        </div>
      </fieldset>
      {plan.code !== 'FREE' && (
        <fieldset className="space-y-3"><legend className="font-bold">{t('admin.plans.durations')}</legend>
          <DataTable
            minWidth="34rem" className="rounded-2xl bg-transparent"
            columns={['months', 'discount', 'override', 'total', 'active'].map((h) => ({ key: h, header: t(`admin.plans.col.${h}`) }))}
          >
            <tbody>{d.prices.map((p, i) => (
              <tr key={p.months} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-semibold">{t('plans.months', { n: p.months })}</td>
                <td className="px-3 py-2"><Input aria-label={t('admin.plans.col.discount')} type="number" min={0} max={90} className="h-10 w-24" value={p.discountPercent} onChange={(e) => setD({ ...d, prices: d.prices.map((x, j) => (j === i ? { ...x, discountPercent: num(e.target.value) } : x)) })} /></td>
                <td className="px-3 py-2"><Input aria-label={t('admin.plans.col.override')} type="number" min={0} className="h-10 w-32" placeholder="—" value={p.amountOverride ?? ''} onChange={(e) => setD({ ...d, prices: d.prices.map((x, j) => (j === i ? { ...x, amountOverride: e.target.value === '' ? null : num(e.target.value) } : x)) })} /></td>
                <td className="px-3 py-2 font-semibold">{formatXof(priceForDuration(d.priceXof, p.months, p.discountPercent, p.amountOverride), locale)}</td>
                <td className="px-3 py-2"><Switch checked={p.active} onChange={(v) => setD({ ...d, prices: d.prices.map((x, j) => (j === i ? { ...x, active: v } : x)) })} label={t('admin.plans.col.active')} /></td>
              </tr>))}</tbody></DataTable>
          <p className="text-xs text-muted">{t('admin.plans.contractNote')}</p>
        </fieldset>
      )}
      <div className="flex justify-end"><Button onClick={() => save.mutate()} loading={save.isPending}>{t('common.save')}</Button></div>
    </Card>
  );
}

function ProductEditor({ product }: { product: ProductRow }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [d, setD] = useState({ name: product.name, priceXof: product.priceXof, quantity: product.quantity, active: product.active });
  const save = useMutation({ mutationFn: () => patch(`/admin/products/${product.code}`, d), onSuccess: () => { toast('success', t('admin.plans.saved')); void qc.invalidateQueries({ queryKey: ['plans'] }); }, onError: (e) => toast('error', err(e)) });
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2"><code className="text-xs">{product.code}</code></td>
      <td className="px-3 py-2"><Input aria-label={t('admin.plans.name')} className="h-10" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></td>
      <td className="px-3 py-2"><Input aria-label={t('admin.plans.quantity')} type="number" min={1} className="h-10 w-20" value={d.quantity} onChange={(e) => setD({ ...d, quantity: num(e.target.value, 1) })} /></td>
      <td className="px-3 py-2"><Input aria-label={t('admin.plans.price')} type="number" min={0} className="h-10 w-28" value={d.priceXof} onChange={(e) => setD({ ...d, priceXof: num(e.target.value) })} /></td>
      <td className="px-3 py-2"><Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('admin.plans.active')} /></td>
      <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => save.mutate()} loading={save.isPending}>{t('common.save')}</Button></td>
    </tr>
  );
}

export default function AdminPlans() {
  const t = useTranslations();
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api<{ plans: PlanRow[]; products: ProductRow[] }>('/admin/plans') });
  if (!q.data) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">{t('admin.plans.intro')}</p>
      {q.data.plans.map((p) => <PlanEditor key={p.code} plan={p} />)}
      <section aria-labelledby="pr"><h2 id="pr" className="mb-3 text-lg font-bold">{t('admin.plans.productsTitle')}</h2>
        <DataTable
          minWidth="40rem"
          columns={['code', 'name', 'quantity', 'price', 'active', ''].map((h) => ({ key: h || 'save', header: h ? t(`admin.plans.${h === 'code' ? 'codeCol' : h}`) : t('common.save'), srOnlyHeader: !h }))}
        >
          <tbody>{q.data.products.map((p) => <ProductEditor key={p.code} product={p} />)}</tbody></DataTable>
      </section>
    </div>
  );
}
