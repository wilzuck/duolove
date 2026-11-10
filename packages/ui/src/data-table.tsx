import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** En-tête lu par les lecteurs d'écran seulement (colonne d'actions). */
  srOnlyHeader?: boolean;
  cellClassName?: string;
  cell?: (row: T) => ReactNode;
  /** Valeur brute de la colonne : active le tri, la recherche et le filtre dans `DataTableView`. */
  value?: (row: T) => string | number | null | undefined;
  /** Filtre de colonne : `'text'` (contient) ou liste de choix (égalité avec `value`). */
  filter?: 'text' | { options: readonly { value: string; label: string }[] };
  /** Colonne masquée par défaut sur téléphone (l'utilisateur peut l'afficher via le menu « Colonnes »). */
  mobileHidden?: boolean;
  /** Colonne du menu d'actions : en cartes mobiles, elle se place en haut à droite de la carte. */
  actions?: boolean;
  /** Libellé du filtre (par défaut l'en-tête s'il s'agit d'un texte). */
  filterLabel?: string;
}

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/** Sélection multiple (cases à cocher en première colonne) : l'état est tenu par l'appelant (`DataTableView`). */
export interface RowSelection {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Coche ou décoche toutes les lignes affichées. */
  onToggleAll: (checked: boolean) => void;
  /** Libellés accessibles : « Sélectionner la ligne », « Tout sélectionner ». */
  rowLabel: string;
  allLabel: string;
}

const checkbox = 'size-[1.125rem] shrink-0 cursor-pointer accent-brand-strong';

/**
 * Tableau de données : conteneur arrondi défilant horizontalement, en-têtes `scope="col"`, lignes séparées, message si vide.
 * Données simples : `rows` + `columns[].cell`. Lignes spéciales (formulaires en ligne) : passer `children` (le `<tbody>` complet).
 */
export function DataTable<T>({ columns, rows, rowKey, minWidth = '36rem', empty, caption, rowClassName, children, className, sort, onSort, sortLabel, stacked, selection }: {
  columns: readonly Column<T>[];
  rows?: readonly T[];
  rowKey?: (row: T) => string;
  minWidth?: string;
  /** Message affiché sous le tableau quand `rows` est vide. */
  empty?: ReactNode;
  caption?: string;
  rowClassName?: string;
  children?: ReactNode;
  className?: string;
  /** Tri courant et rappel au clic sur l'en-tête (colonnes ayant `value`). */
  sort?: SortState;
  onSort?: (key: string) => void;
  /** Texte lu par les lecteurs d'écran sur le bouton de tri (ex. « Trier par {name} »). */
  sortLabel?: (header: string) => string;
  /** Affichage en cartes (une par ligne : libellé + valeur), sans défilement horizontal — pour les écrans étroits. */
  stacked?: boolean;
  /** Active les cases à cocher (une par ligne + « tout sélectionner » dans l'en-tête). Exige `rowKey`. */
  selection?: RowSelection;
}) {
  const keyOf = (row: T, i: number) => (rowKey ? rowKey(row) : String(i));
  const allChecked = !!selection && (rows ?? []).length > 0 && (rows ?? []).every((r, i) => selection.selected.has(keyOf(r, i)));
  const someChecked = !!selection && (rows ?? []).some((r, i) => selection.selected.has(keyOf(r, i)));
  if (stacked && !children) {
    const labelled = columns.filter((c) => !c.srOnlyHeader);
    const corner = columns.filter((c) => c.actions);
    const actions = columns.filter((c) => c.srOnlyHeader && !c.actions);
    return (
      <div className={className}>
        {caption && <p className="sr-only">{caption}</p>}
        <ul className="space-y-3">
          {(rows ?? []).map((row, i) => (
            <li key={rowKey ? rowKey(row) : i} className={cn('relative rounded-3xl border bg-card p-4 transition-colors', selection?.selected.has(keyOf(row, i)) ? 'border-brand-strong bg-soft' : 'border-line', rowClassName)}>
              {selection && <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted"><input type="checkbox" className={checkbox} aria-label={selection.rowLabel} checked={selection.selected.has(keyOf(row, i))} onChange={() => selection.onToggle(keyOf(row, i))} />{selection.rowLabel}</label>}
              {corner.length > 0 && <div className="absolute top-3 right-3">{corner.map((c) => <div key={c.key}>{c.cell?.(row)}</div>)}</div>}
              <dl className={cn('grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-2 text-sm', corner.length > 0 && 'pr-10')}>
                {labelled.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted">{c.header}</dt>
                    <dd className={cn('min-w-0 break-words', c.cellClassName)}>{c.cell?.(row)}</dd>
                  </div>
                ))}
              </dl>
              {actions.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">{actions.map((c) => <div key={c.key}>{c.cell?.(row)}</div>)}</div>}
            </li>
          ))}
        </ul>
        {rows && rows.length === 0 && empty && <p className="rounded-3xl border border-line bg-card p-6 text-center text-muted">{empty}</p>}
      </div>
    );
  }
  return (
    <div className={cn('overflow-x-auto rounded-3xl border border-line bg-card', className)}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line text-muted">
          <tr>
            {selection && (
              <th scope="col" className="w-px py-3 pr-0 pl-4">
                <input type="checkbox" className={checkbox} aria-label={selection.allLabel} checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={(e) => selection.onToggleAll(e.target.checked)} />
              </th>
            )}
            {columns.map((c) => {
              const sortable = !!onSort && !!c.value && !c.srOnlyHeader;
              const active = sort?.key === c.key ? sort.dir : null;
              const text = typeof c.header === 'string' ? c.header : c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined} className="px-4 py-3 font-semibold">
                  {c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : sortable ? (
                    <button type="button" onClick={() => onSort(c.key)} aria-label={sortLabel?.(text)} className="-mx-1 inline-flex items-center gap-1 rounded px-1 font-semibold hover:text-fg">
                      {c.header}{active === 'asc' ? <ChevronUp className="size-4" aria-hidden /> : active === 'desc' ? <ChevronDown className="size-4" aria-hidden /> : <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        {children ?? (
          <tbody>
            {(rows ?? []).map((row, i) => (
              <tr key={rowKey ? rowKey(row) : i} className={cn('border-b border-line transition-colors last:border-0', selection?.selected.has(keyOf(row, i)) ? 'bg-soft hover:bg-soft' : 'hover:bg-soft/60', rowClassName)}>
                {selection && <td className="w-px py-3 pr-0 pl-4"><input type="checkbox" className={checkbox} aria-label={selection.rowLabel} checked={selection.selected.has(keyOf(row, i))} onChange={() => selection.onToggle(keyOf(row, i))} /></td>}
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-3', c.cellClassName)}>{c.cell?.(row)}</td>)}
              </tr>
            ))}
          </tbody>
        )}
      </table>
      {rows && rows.length === 0 && empty && <p className="p-6 text-center text-muted">{empty}</p>}
    </div>
  );
}
