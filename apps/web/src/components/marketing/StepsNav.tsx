'use client';

import { useScrollSpy } from '@/hooks/useScrollSpy';

export function StepsNav({ label, steps }: { label: string; steps: readonly { key: string; title: string }[] }) {
  const active = useScrollSpy(steps.map((s) => `step-${s.key}`), 170);
  return (
    <nav aria-label={label} className="hidden lg:block">
      <div className="sticky top-36 rounded-3xl border border-line bg-card p-5 shadow-soft">
        <ol className="space-y-1 text-sm">
          {steps.map((s, i) => {
            const on = active === `step-${s.key}`;
            return (
              <li key={s.key}>
                <a href={`#step-${s.key}`} aria-current={on ? 'step' : undefined} className={`flex gap-3 rounded-xl px-2 py-1.5 hover:bg-soft hover:text-brand-ink ${on ? 'bg-soft font-bold text-brand-ink' : 'text-muted'}`}>
                  <span className="font-bold text-brand-ink" aria-hidden>{i + 1}</span>{s.title}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
