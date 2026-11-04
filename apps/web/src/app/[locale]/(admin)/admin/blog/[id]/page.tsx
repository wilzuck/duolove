'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Skeleton } from '@duomatch/ui';
import { BlogEditor } from '@/components/admin/BlogEditor';
import { api } from '@/lib/api';
import type { AdminBlogPost } from '@/lib/types';

export default function EditPost() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['admin', 'blog', id], queryFn: () => api<AdminBlogPost>(`/admin/blog/${id}`) });
  if (!q.data) return <Skeleton className="h-96" />;
  return <BlogEditor key={`${q.data.id}-${q.data.updatedAt}`} post={q.data} />;
}
