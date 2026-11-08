'use client';

import { Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './button';
import { Pencil } from 'lucide-react';
import type { Column } from './data-table';
import type { RowAction } from './row-menu';
import { DataTableView, type DataTableLabels } from './data-table-view';
import { Dialog } from './dialog';

/**
 * Liste + bouton d'ajout + boîte de dialogue de saisie, prêts à l'emploi.
 * - Le tableau est un `DataTableView` (recherche, filtres, tri, pagination 10/20/30/50/100) : `columns` (avec `value`/`filter`), `rows`, `rowKey`, `empty`, `tableLabels`.
 * - Le bouton d'ajout en haut ouvre la boîte de dialogue ; `children` en sont les champs (`Field` + `Input`…).
 * - « Valider » appelle `onSubmit` : si la promesse réussit la boîte se ferme, si elle échoue elle reste ouverte
 *   (l'appelant affiche l'erreur). `onOpen` sert à (ré)initialiser le formulaire à chaque ouverture.
 * - Modification : avec `editLabel`, chaque ligne a un bouton qui rouvre la même boîte ; `onOpen(row)` et `onSubmit(row)`
 *   reçoivent alors la ligne (`null` pour un ajout), et l'appelant adapte `dialogTitle` / `submitLabel`.
 */
export function CrudTable<T>({
  title, description, intro, addLabel, editLabel, rowActions, columns, rows, rowKey, empty, loading, minWidth, tableLabels, exportName,
  dialogTitle, submitLabel, cancelLabel, closeLabel, submitting, onOpen, onSubmit, children, footnote,
}: {
  title: string;
  description?: string;
  /** Contenu libre entre l'en-tête et le tableau (notes, statistiques). */
  intro?: ReactNode;
  addLabel: string;
  /** Libellé du bouton de modification par ligne ; sans lui, aucune colonne d'actions n'est ajoutée. */
  editLabel?: string;
  /** Autres actions de ligne (menu « ⋯ »), après « Modifier ». */
  rowActions?: (row: T) => RowAction[];
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  empty?: ReactNode;
  loading?: ReactNode;
  minWidth?: string;
  /** Textes de la barre de recherche, des filtres et de la pagination. */
  tableLabels: DataTableLabels;
  /** Nom du fichier CSV exporté (sans extension) ; active le bouton d'export. */
  exportName?: string;
  dialogTitle: string;
  submitLabel: string;
  cancelLabel: string;
  closeLabel: string;
  submitting?: boolean;
  onOpen?: (row: T | null) => void;
  onSubmit: (row: T | null) => Promise<unknown> | void;
  children: ReactNode;
  /** Note affichée au bas de la boîte de dialogue (ex. « non modifiable après création »). */
  footnote?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const show = (row: T | null) => { setEditing(row); onOpen?.(row); setOpen(true); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await onSubmit(editing); setOpen(false); } catch { /* la boîte reste ouverte : l'appelant a déjà signalé l'erreur */ }
  };
  const menu = editLabel || rowActions
    ? (row: T): RowAction[] => [...(editLabel ? [{ label: editLabel, icon: <Pencil className="size-4" aria-hidden />, onSelect: () => show(row) }] : []), ...(rowActions?.(row) ?? [])]
    : undefined;
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        <Button onClick={() => show(null)}><Plus className="size-4" aria-hidden />{addLabel}</Button>
      </header>
      {intro}
      {rows === undefined ? loading : <DataTableView columns={columns} rowActions={menu} rows={rows} rowKey={rowKey} empty={empty} minWidth={minWidth} labels={tableLabels} exportName={exportName} />}
      <Dialog open={open} onClose={() => setOpen(false)} title={dialogTitle} closeLabel={closeLabel} className="w-[min(92vw,34rem)]">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 [&>*:only-child]:sm:col-span-2">{children}</div>
          {footnote && <p className="text-xs text-muted">{footnote}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{cancelLabel}</Button>
            <Button type="submit" loading={submitting}>{submitLabel}</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
