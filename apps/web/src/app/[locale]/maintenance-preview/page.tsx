import type { Metadata } from 'next';
import { MaintenancePreview } from './preview';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Aperçu de l'écran que voient les membres pendant la maintenance (lien depuis Admin › Maintenance). Rien n'est bloqué ici. */
export default function Page() {
  return <MaintenancePreview />;
}
