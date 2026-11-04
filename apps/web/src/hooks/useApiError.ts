'use client';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { errorMessage } from '@/lib/errors';

export function useApiError() {
  const t = useTranslations();
  return useCallback((e: unknown) => errorMessage(e, (k) => t(k as never), (k) => t.has(k as never)), [t]);
}
