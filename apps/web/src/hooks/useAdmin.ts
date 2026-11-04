'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paged } from '@/lib/types';

/** Liste paginée par curseur pour les écrans d'administration. */
export function useAdminList<T>(key: unknown[], path: string) {
  const q = useInfiniteQuery({
    queryKey: ['admin', ...key], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Paged<T>>(`${path}${path.includes('?') ? '&' : '?'}limit=25${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}
