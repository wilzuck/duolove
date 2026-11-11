'use client';
import type { ReactNode } from 'react';
import { useSession } from '@/hooks/useQueries';

/** Affiche `member` si la personne est connectée, `guest` sinon (et pendant la vérification) : les pages publiques ne proposent plus « Créer mon compte » à quelqu'un déjà connecté. */
export function AuthSwitch({ guest, member }: { guest: ReactNode; member: ReactNode }) {
  const { data } = useSession();
  return <>{data?.authenticated ? member : guest}</>;
}
