import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** En-tête lu par les lecteurs d'écran seulement (colonne d'actions). */
  srOnlyHeader?: boolean;
  cellClassName?: string;
  cell?: (row: T) => ReactNode;
}

/**
 * Tableau de données : conteneur arrondi défilant horizontalement, en-têtes `scope="col"`, lignes séparées, message si vide.
 * Données simples : `rows` + `columns[].cell`. Lignes spéciales (formulaires en ligne) : passer `children` (le `<tbody>` complet).
 */
export function DataTable<T>({ columns, rows, rowKey, minWidth = '36rem', empty, caption, rowClassName, children, className }: {
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
}) {
  return (
    <div className={cn('overflow-x-auto rounded-3xl border border-line bg-card', className)}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line text-muted">
          <tr>
            {columns.map((c) => <th key={c.key} scope="col" className="px-4 py-3 font-semibold">{c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : c.header}</th>)}
          </tr>
        </thead>
        {children ?? (
          <tbody>
            {(rows ?? []).map((row, i) => (
              <tr key={rowKey ? rowKey(row) : i} className={cn('border-b border-line last:border-0', rowClassName)}>
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
