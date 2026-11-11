'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, Field, Input, RadioChips, Select, Skeleton } from '@duomatch/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { useApiError } from '@/hooks/useApiError';
import { ApiError, api, post, put } from '@/lib/api';
import { useUi } from '@/lib/store';

interface PaymentView { source: 'env' | 'db'; provider: 'mock' | 'kkiapay'; publicKey: string | null; sandbox: boolean; live: boolean; hasPrivateKey: boolean; hasWebhookSecret: boolean; privateKeyMasked: string | null; webhookUrl: string; encryptionKeyConfigured: boolean; envProvider: string; isProd: boolean; reauth: 'password' | 'code' }

/** Paiement en ligne (KKiaPay). Réservé au super administrateur ; les clés sont en écriture seule, chiffrées en base, et l'enregistrement redemande le mot de passe. */
export default function AdminPaymentConfig() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const view = useQuery({ queryKey: ['admin', 'payment-config'], queryFn: () => api<PaymentView>('/admin/payment-config') });
  const v = view.data;
  const [form, setForm] = useState<{ provider: 'mock' | 'kkiapay'; publicKey: string; privateKey: string; webhookSecret: string; sandbox: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'password' | 'code' | null>(null);  // null : celui que le serveur conseille (code si le compte n'a pas de mot de passe)
  const how = mode ?? v?.reauth ?? 'password';
  const f = form ?? { provider: v?.provider ?? 'mock', publicKey: v?.publicKey ?? '', privateKey: '', webhookSecret: '', sandbox: v?.sandbox ?? true };
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setForm({ ...f, [k]: val });
  // Le serveur explique la cause précise d'un échec de test : on l'affiche tel quel (le message générique « Une erreur est survenue » n'apprend rien).
  const explain = (e: unknown) => (e instanceof ApiError && e.code === 'PAYMENT_TEST_FAILED' ? e.message : err(e));
  const body = () => ({ provider: f.provider, publicKey: f.publicKey || undefined, privateKey: f.privateKey || undefined, webhookSecret: f.webhookSecret || undefined, sandbox: f.sandbox });
  const kk = f.provider === 'kkiapay';

  const test = useMutation({ mutationFn: () => post('/admin/payment-config/test', body()), onSuccess: () => toast('success', t('admin.pay.testOk')), onError: (e) => toast('error', explain(e)) });
  const sendCode = useMutation({ mutationFn: () => post('/admin/payment-config/code'), onSuccess: () => toast('success', t('admin.pay.codeSent')), onError: (e) => toast('error', err(e)) });
  const save = useMutation({
    mutationFn: () => put<PaymentView>('/admin/payment-config', { ...body(), ...(how === 'code' ? { code } : { password }) }),
    onSuccess: () => { toast('success', t('admin.pay.saved')); setForm(null); setConfirm(false); setPassword(''); setCode(''); setMode(null); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast('error', explain(e)),
  });

  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.pay.title')}</h2><p className="text-sm text-muted">{t('admin.pay.subtitle')}</p></header>
      {view.isLoading && <Skeleton className="h-64" />}
      {v && (
        <>
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-soft text-brand-ink">{v.provider === 'kkiapay' ? <CreditCard className="size-5" aria-hidden /> : <FlaskConical className="size-5" aria-hidden />}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{v.provider === 'kkiapay' ? 'KKiaPay' : t('admin.pay.mock')}</p>
                <p className="text-sm text-muted">{t(v.source === 'db' ? 'admin.pay.sourceDb' : 'admin.pay.sourceEnv')}{v.provider === 'kkiapay' ? ` · ${t(v.sandbox ? 'admin.pay.sandbox' : 'admin.pay.real')}` : ''}</p>
              </div>
              <Badge tone={v.live ? 'success' : v.provider === 'kkiapay' ? 'neutral' : 'danger'}>{v.live ? t('admin.pay.liveBadge') : v.provider === 'kkiapay' ? t('admin.pay.testBadge') : t('admin.pay.offBadge')}</Badge>
            </div>
            {v.provider === 'mock' && v.isProd && <Alert variant="text">{t('admin.pay.mockProd')}</Alert>}
            {!v.encryptionKeyConfigured && <Alert variant="text">{t('admin.pay.noKey')}</Alert>}
          </Card>

          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">{t('admin.pay.formTitle')}</h3>
            <p className="text-sm text-muted">{t('admin.pay.formHelp')}</p>
            <RadioChips legend={t('admin.pay.provider')} value={f.provider} onChange={(p) => set('provider', p as 'mock' | 'kkiapay')} options={[{ value: 'kkiapay', label: 'KKiaPay' }, { value: 'mock', label: t('admin.pay.mock') }]} />
            {kk && (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setConfirm(true); }}>
                <Field label={t('admin.pay.publicKey')} hint={t('admin.pay.publicKeyHint')}>{(p) => <Input {...p} autoComplete="off" value={f.publicKey} onChange={(e) => set('publicKey', e.target.value)} required />}</Field>
                <Field label={t('admin.pay.privateKey')} hint={v.hasPrivateKey ? t('admin.pay.keep', { masked: v.privateKeyMasked ?? '' }) : t('admin.pay.privateKeyHint')}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={f.privateKey} onChange={(e) => set('privateKey', e.target.value)} required={!v.hasPrivateKey} />}</Field>
                <Field label={t('admin.pay.webhookSecret')} hint={v.hasWebhookSecret ? t('admin.pay.keepSecret') : t('admin.pay.webhookSecretHint')}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={f.webhookSecret} onChange={(e) => set('webhookSecret', e.target.value)} required={!v.hasWebhookSecret} />}</Field>
                <Field label={t('admin.pay.mode')} hint={t(f.sandbox ? 'admin.pay.sandboxOn' : 'admin.pay.sandboxOff')}>{(p) => (
                  <Select {...p} value={f.sandbox ? 'test' : 'production'} onChange={(e) => set('sandbox', e.target.value !== 'production')}>
                    <option value="test">{t('admin.pay.modeTest')}</option>
                    <option value="production">{t('admin.pay.modeProduction')}</option>
                  </Select>
                )}</Field>
                <div className="sm:col-span-2 rounded-2xl bg-soft p-4 text-sm">
                  <p className="font-semibold">{t('admin.pay.webhookTitle')}</p>
                  <p className="mt-1 break-all font-mono text-xs">{v.webhookUrl}</p>
                  <p className="mt-1 text-muted">{t('admin.pay.webhookHelp')}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => test.mutate()} loading={test.isPending}>{t('admin.pay.test')}</Button>
                  <Button type="submit">{t('admin.pay.save')}</Button>
                </div>
              </form>
            )}
            {!kk && <div><Button onClick={() => setConfirm(true)}>{t('admin.pay.save')}</Button></div>}
          </Card>
        </>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('admin.pay.confirmTitle')} closeLabel={t('common.close')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <p className="text-sm">{t(kk && !f.sandbox ? 'admin.pay.confirmReal' : 'admin.pay.confirmText')}</p>
          {how === 'password' ? (
            <>
              <Field label={t('admin.pay.password')}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
              <button type="button" className="text-sm font-semibold text-brand-ink underline" onClick={() => setMode('code')}>{t('admin.pay.useCode')}</button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{v?.reauth === 'code' ? t('admin.pay.codeHelpNoPassword') : t('admin.pay.codeHelp')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => sendCode.mutate()} loading={sendCode.isPending}>{t('admin.pay.sendCode')}</Button>
              <Field label={t('admin.pay.code')}>{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />}</Field>
              {v?.reauth === 'password' && <button type="button" className="text-sm font-semibold text-brand-ink underline" onClick={() => setMode('password')}>{t('admin.pay.usePassword')}</button>}
            </>
          )}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button type="submit" loading={save.isPending} disabled={how === 'code' ? code.length !== 6 : !password}>{t('admin.pay.confirm')}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
