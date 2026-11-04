'use client';
import { MessageCircleHeart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@duomatch/ui';

export default function MessagesIndex() {
  const t = useTranslations();
  return <div className="m-auto"><EmptyState icon={<MessageCircleHeart className="size-8" />} title={t('chat.pickTitle')}>{t('chat.pickText')}</EmptyState></div>;
}
