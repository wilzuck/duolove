'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Input, Skeleton, Switch } from '@duomatch/ui';
import { api, put } from '@/lib/api';

interface Flag { key: string; enabled: boolean; description: string | null }

export default function AdminFlags() {
  const t = useTranslations();
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const flags = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api<Flag[]>('/admin/feature-flags') });
  const set = useMutation({ mutationFn: ({ k, enabled }: { k: string; enabled: boolean }) => put(`/admin/feature-flags/${k}`, { enabled }), onSuccess: () => { setKey(''); void qc.invalidateQueries({ queryKey: ['admin'] }); } });
  return (
    <div className="space-y-6">
      <section aria-labelledby="ff"><h2 id="ff" className="mb-3 text-lg font-bold">{t('admin.flags')}</h2>
        <Card className="divide-y divide-line px-5">
          {flags.isLoading && <Skeleton className="my-4 h-16" />}
          {flags.data?.map((f) => <div key={f.key} className="flex items-center justify-between py-3"><code className="text-sm">{f.key}</code><Switch checked={f.enabled} onChange={(v) => set.mutate({ k: f.key, enabled: v })} label={f.key} /></div>)}
          {flags.data?.length === 0 && <p className="py-6 text-center text-muted">{t('admin.noFlags')}</p>}
          <form className="flex gap-2 py-4" onSubmit={(e) => { e.preventDefault(); if (key) set.mutate({ k: key, enabled: false }); }}><Input aria-label={t('admin.flagKey')} placeholder="new_feature" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} pattern="[a-z0-9_.\-]{2,60}" /><Button type="submit" variant="outline">{t('admin.addFlag')}</Button></form>
        </Card>
      </section>
    </div>
  );
}
