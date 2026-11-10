'use client';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { PasswordInput as Base } from '@duomatch/ui';

/** Champ mot de passe avec œil afficher / masquer, libellés traduits. */
export function PasswordInput(props: Omit<ComponentProps<typeof Base>, 'showLabel' | 'hideLabel'>) {
  const t = useTranslations();
  return <Base {...props} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />;
}
