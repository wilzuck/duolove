'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { EmptyState, Skeleton } from '@duomatch/ui';
import { ProfileDetail } from '@/components/app/ProfileDetail';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Card } from '@/lib/types';

export default function ProfileView({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const showMatch = useUi((s) => s.showMatch);
  const q = useQuery({ queryKey: ['profile', userId], queryFn: () => api<Card>(`/profiles/${userId}`), retry: false });
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4">
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"><ArrowLeft className="size-4" aria-hidden />{t('common.back')}</button>
      {q.isLoading && <Skeleton className="aspect-[4/5] rounded-[2rem]" />}
      {q.isError && <EmptyState icon={<Lock className="size-8" aria-hidden />} title={t('profileView.unavailable')}><Link href="/discover" className="font-semibold text-brand-ink underline">{t('profileView.back')}</Link></EmptyState>}
      {q.data && <ProfileDetail card={q.data} onBlocked={() => router.replace('/discover')} onLiked={(r) => { if (r.matched && r.match) showMatch({ matchId: r.match.id, conversationId: r.match.conversationId, user: r.match.user ?? q.data ?? null }); }} />}
    </div>
  );
}
