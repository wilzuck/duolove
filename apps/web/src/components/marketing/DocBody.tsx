import { CheckCircle2, Heart, Info, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type ListKind = 'do' | 'dont' | 'info';
export interface DocSection { id: string; h: string; intro?: string; paras?: string[]; lists?: { kind: ListKind; items: string[] }[] }

const LIST_META: Record<ListKind, { icon: LucideIcon; tone: string }> = {
  do: { icon: CheckCircle2, tone: 'text-success-ink' },
  dont: { icon: XCircle, tone: 'text-danger-ink' },
  info: { icon: Info, tone: 'text-brand-ink' },
};

/** Corps d'un document long (charte, conditions) : sommaire collant sur grand écran / repliable sur mobile, rubriques numérotées en cartes, listes titrées
 *  (le sens ne repose jamais sur la couleur seule). `extra` ajoute du contenu propre à une rubrique ; `footer` s'affiche après la dernière. */
export function DocBody({ sections, icons, tocLabel, listLabels, extra, footer }: {
  sections: DocSection[]; icons: Record<string, LucideIcon>; tocLabel: string; listLabels: Record<ListKind, string>; extra?: (id: string) => ReactNode; footer?: ReactNode;
}) {
  const toc = (
    <ol className="space-y-1 text-sm">
      {sections.map((s, i) => (
        <li key={s.id}><a href={`#${s.id}`} className="flex gap-2 rounded-xl px-3 py-2 text-muted hover:bg-soft hover:text-brand-ink"><span className="font-semibold tabular-nums text-brand-ink">{String(i + 1).padStart(2, '0')}</span>{s.h}</a></li>
      ))}
    </ol>
  );
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[15rem_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <details className="rounded-2xl border border-line bg-card p-3 lg:hidden"><summary className="cursor-pointer px-3 py-2 font-semibold">{tocLabel}</summary><nav aria-label={tocLabel} className="mt-2">{toc}</nav></details>
        <nav aria-label={tocLabel} className="hidden lg:block"><p className="mb-2 px-3 text-sm font-bold">{tocLabel}</p>{toc}</nav>
      </aside>
      <div className="space-y-6">
        {sections.map((s, i) => {
          const Icon = icons[s.id] ?? Heart;
          return (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 rounded-3xl border border-line bg-card p-6 shadow-soft md:p-8">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-soft text-brand-ink"><Icon className="size-6" aria-hidden /></span>
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-brand-ink uppercase">{String(i + 1).padStart(2, '0')}</p>
                  <h2 id={`${s.id}-h`} className="text-2xl font-extrabold">{s.h}</h2>
                </div>
              </div>
              {s.intro && <p className="mt-4 text-lg leading-relaxed text-muted">{s.intro}</p>}
              {s.paras?.map((p) => <p key={p} className="mt-3 leading-relaxed text-muted">{p}</p>)}
              {s.lists?.map((l) => {
                const M = LIST_META[l.kind];
                return (
                  <div key={l.kind} className={`mt-5 rounded-2xl p-4 ${l.kind === 'info' ? 'bg-soft' : 'border border-line'}`}>
                    <h3 className={`flex items-center gap-2 text-sm font-bold ${M.tone}`}><M.icon className="size-5" aria-hidden />{listLabels[l.kind]}</h3>
                    <ul className="mt-3 space-y-2">{l.items.map((it) => <li key={it} className="flex gap-3 leading-relaxed"><M.icon className={`mt-1 size-4 shrink-0 ${M.tone}`} aria-hidden /><span>{it}</span></li>)}</ul>
                  </div>
                );
              })}
              {extra?.(s.id)}
            </section>
          );
        })}
        {footer}
      </div>
    </div>
  );
}
