'use client';
import { Pencil, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button, Card, Dialog } from '@duomatch/ui';

/** Valeur d'un réglage en lecture seule : petit libellé, grande valeur, unité. */
export function Tile({ label, value, unit, className }: { label: string; value: ReactNode; unit?: string; className?: string }) {
  return (
    <div className={className ?? 'min-w-40 flex-1 rounded-2xl bg-soft px-4 py-3'}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold break-words">{value}{unit && <> <span className="text-sm font-semibold text-muted">{unit}</span></>}</p>
    </div>
  );
}

/**
 * Bloc de réglages : lecture seule par défaut (pastilles de valeurs), le bouton « Modifier » ouvre l'édition de ce bloc dans une fenêtre.
 * `onSave` doit rejeter en cas d'échec : la fenêtre reste alors ouverte (l'erreur est affichée par l'appelant).
 */
export function SettingCard({ title, help, icon: Icon, badge, view, editor, onOpen, onSave, saving, canSave = true, wide }: {
  title: string; help?: string; icon: LucideIcon; badge?: ReactNode; view: ReactNode; editor: ReactNode;
  onOpen?: () => void; onSave: () => Promise<unknown>; saving: boolean; canSave?: boolean; wide?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const close = () => !saving && setOpen(false);
  return (
    <Card className="space-y-5 p-5">
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><h3 className="font-bold leading-tight">{title}</h3>{help && <p className="mt-0.5 text-sm text-muted">{help}</p>}</div>
        {badge}
        <Button type="button" size="sm" variant="outline" onClick={() => { onOpen?.(); setOpen(true); }}><Pencil className="size-4" aria-hidden />{t('admin.edit')}</Button>
      </header>
      {view}
      <Dialog open={open} onClose={close} title={title} closeLabel={t('common.close')} className={wide ? 'w-[min(94vw,52rem)]' : 'w-[min(94vw,46rem)]'} dismissible={!saving}>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void onSave().then(() => setOpen(false), () => undefined); }}>
          {editor}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={close} disabled={saving}>{t('common.cancel')}</Button>
            <Button type="submit" loading={saving} disabled={!canSave}>{t('common.save')}</Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
