import { notFound } from 'next/navigation';

// Toute URL inconnue sous une langue valide → page 404 localisée.
export default function CatchAll() {
  notFound();
}
