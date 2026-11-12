'use client';
import { useTranslations } from 'next-intl';
import { Button, Dialog } from '@duomatch/ui';
import { useUi } from '@/lib/store';

/** Fenêtre de paiement fermée sans payer : le membre choisit de réessayer ou d'annuler (le bouton d'achat ne reste jamais bloqué en chargement). */
export function PayInterrupted() {
  const t = useTranslations();
  const p = useUi((s) => s.payInterrupted);
  const set = useUi((s) => s.setPayInterrupted);
  const close = () => set(null);
  return (
    <Dialog open={!!p} onClose={close} title={t('pay.interruptedTitle')} closeLabel={t('common.close')}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('pay.interruptedText')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close}>{t('pay.cancel')}</Button>
          <Button onClick={() => { const r = p?.retry; close(); r?.(); }}>{t('pay.retry')}</Button>
        </div>
      </div>
    </Dialog>
  );
}
