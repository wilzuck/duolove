'use client';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button, Card } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';

function Mock() {
  const t = useTranslations();
  const ref = useSearchParams().get('ref') ?? '';
  const router = useRouter();
  const err = useApiError();
  const pay = useMutation({
    mutationFn: (outcome: 'success' | 'fail') => post(`/payments/mock/${encodeURIComponent(ref)}/complete`, { outcome }).then(() => outcome),
    onSuccess: (o) => router.replace(`/settings?tab=payments&status=${o}`),
  });
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="space-y-5 p-7">
        <span className="flex size-12 items-center justify-center rounded-full bg-gold/20 text-gold-ink"><FlaskConical className="size-6" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('checkout.title')}</h1>
        <p className="rounded-2xl bg-gold/15 p-4 text-sm">{t('checkout.warning')}</p>
        {pay.isError && <p role="alert" className="text-sm text-danger-ink">{err(pay.error)}</p>}
        <div className="grid gap-3">
          <Button size="lg" onClick={() => pay.mutate('success')} loading={pay.isPending && pay.variables === 'success'}>{t('checkout.pay')}</Button>
          <Button size="lg" variant="outline" onClick={() => pay.mutate('fail')} loading={pay.isPending && pay.variables === 'fail'}>{t('checkout.fail')}</Button>
        </div>
      </Card>
    </div>
  );
}
export default function MockCheckout() { return <Suspense><Mock /></Suspense>; }
