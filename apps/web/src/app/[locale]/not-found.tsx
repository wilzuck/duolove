import { useTranslations } from 'next-intl';
import { Button, Logo } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <h1 className="text-4xl font-extrabold">{t('common.notFoundTitle')}</h1>
      <p className="max-w-md text-muted">{t('common.notFoundText')}</p>
      <Link href="/"><Button>{t('common.backHome')}</Button></Link>
    </main>
  );
}
