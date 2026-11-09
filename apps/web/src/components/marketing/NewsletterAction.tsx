'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button, Spinner } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { post } from '@/lib/api';

function Action({ kind }: { kind: 'confirm' | 'unsubscribe' | 'notifications' }) {
  const t = useTranslations();
  const token = useSearchParams().get('token');
  const q = useQuery({ queryKey: ['newsletter', kind, token], enabled: !!token, retry: false, staleTime: Infinity, queryFn: async () => { await post(`${kind === 'notifications' ? '/notifications/unsubscribe-email' : `/newsletter/${kind}`}?token=${encodeURIComponent(token ?? '')}`); return true; } });
  const bad = q.isError || !token;
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      {q.isLoading && <Spinner size="lg" label={t('common.loading')} />}
      {q.isSuccess && <><CheckCircle2 className="size-12 text-success-ink" aria-hidden /><h1 className="text-2xl font-extrabold">{t(`newsletter.${kind}.okTitle`)}</h1><p className="text-muted">{t(`newsletter.${kind}.okText`)}</p></>}
      {bad && <><XCircle className="size-12 text-danger-ink" aria-hidden /><h1 className="text-2xl font-extrabold">{t('newsletter.badTitle')}</h1><p className="text-muted">{t('newsletter.badText')}</p></>}
      {!q.isLoading && <Link href="/"><Button variant="outline">{t('nav.home')}</Button></Link>}
    </div>
  );
}
export function NewsletterAction({ kind }: { kind: 'confirm' | 'unsubscribe' | 'notifications' }) { return <Suspense><Action kind={kind} /></Suspense>; }
