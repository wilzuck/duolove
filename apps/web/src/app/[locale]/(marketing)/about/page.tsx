import { HeartHandshake } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.about'), description: t('about.lead') };
}

const CHAPTERS = ['c1', 'c2', 'c3', 'c4', 'c5'] as const;
const VALUES = ['respect', 'safety', 'privacy', 'sincerity'] as const;

export default async function About({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations();
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t('about.storyKicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-5xl">{t('about.title')}</h1>
          <p className="mt-5 text-balance text-xl text-muted md:text-2xl">{t('about.lead')}</p>
          <p className="mt-6 text-lg">{t('about.mission')}</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl space-y-14 px-4 py-14">
        {CHAPTERS.map((c, i) => (
          <section key={c} aria-labelledby={`chapter-${c}`} className="grid gap-4 md:grid-cols-[4rem_1fr]">
            <span aria-hidden className="text-5xl font-extrabold text-brand-ink/30">{String(i + 1).padStart(2, '0')}</span>
            <div className="space-y-4">
              <h2 id={`chapter-${c}`} className="text-2xl font-bold md:text-3xl">{t(`about.chapters.${c}.title`)}</h2>
              <p className="text-lg leading-relaxed">{t(`about.chapters.${c}.p1`)}</p>
              <p className="text-lg leading-relaxed text-muted">{t(`about.chapters.${c}.p2`)}</p>
            </div>
          </section>
        ))}
      </article>

      <section className="mx-auto max-w-3xl px-4 pb-14">
        <h2 className="text-2xl font-bold">{t('about.valuesTitle')}</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v} className="rounded-3xl border border-line bg-card p-6 shadow-soft"><dt className="font-bold">{t(`about.values.${v}.title`)}</dt><dd className="mt-1 text-muted">{t(`about.values.${v}.text`)}</dd></div>
          ))}
        </dl>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-linear-to-br from-brand-strong to-brand-strong-2 px-6 py-14 text-center text-white shadow-pop">
          <h2 className="text-3xl font-extrabold md:text-4xl">{t('about.nextTitle')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/90">{t('about.nextText')}</p>
          <Link href="/register" className="mt-8 inline-block"><Button size="lg" className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost">{t('about.nextCta')}</Button></Link>
        </div>
      </section>
    </>
  );
}
