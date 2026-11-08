'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Download, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from './button';
import { DataTable, type Column, type SortState } from './data-table';
import { Popover } from './popover';
import { Input, Select } from './field';

export const PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/** Textes de l'interface du tableau (le package UI ne connaît pas la langue : l'application les fournit). */
export interface DataTableLabels {
  search: string;
  searchPlaceholder: string;
  allOption: string;
  reset: string;
  rowsPerPage: string;
  /** « 1–10 sur 42 » */
  showing: (from: number, to: number, total: number) => string;
  /** « Page 2 sur 5 » */
  pageOf: (page: number, pages: number) => string;
  first: string; prev: string; next: string; last: string;
  noResults: string;
  /** Libellé du bouton d'export CSV. */
  export: string;
  sortBy: (name: string) => string;
  /** Libellé de la liste de tri (affichage en cartes). */
  sortLabel: string;
  /** Bouton qui ouvre le panneau de filtres. */
  filters: string;
  /** Bouton de fermeture des boîtes de dialogue (« Terminé »). */
  done: string;
  close: string;
  /** Menu de choix des colonnes affichées. */
  columnsMenu: string;
}

const NARROW = '(max-width: 767px)';
const subscribeNarrow = (cb: () => void) => { const m = window.matchMedia(NARROW); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
/** Vrai sur écran étroit (téléphone) : le tableau passe en cartes. Faux côté serveur, puis corrigé à l'hydratation. */
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);

const menuButton = 'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-3.5 text-sm font-semibold hover:bg-soft';

const norm = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cmp = (a: string | number | null | undefined, b: string | number | null | undefined) => {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1; // vides toujours en dernier
  if (b == null || b === '') return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`; // neutralise l'interprétation comme formule dans Excel
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Télécharge un CSV (séparateur « ; » et BOM UTF-8 : s'ouvre correctement dans Excel en français). */
function downloadCsv(name: string, head: string[], lines: unknown[][]) {
  const text = `\uFEFF${[head, ...lines].map((l) => l.map(csvCell).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Tableau complet côté client : recherche globale, filtres par colonne (texte ou liste), tri au clic sur l'en-tête,
 * pagination (10, 20, 30, 50, 100 lignes) avec compteur. Les colonnes participent via `value` (et `filter`).
 * Avec `exportName`, un bouton exporte en CSV toutes les lignes filtrées et triées (pas seulement la page affichée).
 */
export function DataTableView<T>({ columns, rows, rowKey, labels, empty, minWidth, defaultPageSize = 10, toolbar, exportName }: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  labels: DataTableLabels;
  empty?: ReactNode;
  minWidth?: string;
  defaultPageSize?: (typeof PAGE_SIZES)[number];
  /** Contenu supplémentaire à droite de la barre de recherche. */
  toolbar?: ReactNode;
  /** Nom du fichier d'export (sans extension) ; sans lui, pas de bouton d'export. */
  exportName?: string;
}) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(null);
  const [size, setSize] = useState<number>(defaultPageSize);
  const [page, setPage] = useState(1);
  const narrow = useNarrow();
  const [shown, setShown] = useState<Record<string, boolean>>({});

  const searchable = columns.filter((c) => c.value);
  const isShown = (c: Column<T>) => c.srOnlyHeader || (shown[c.key] ?? !(narrow && c.mobileHidden));
  const displayed = columns.filter(isShown);
  const togglable = columns.filter((c) => !c.srOnlyHeader);
  const sortable = columns.filter((c) => c.value && !c.srOnlyHeader);
  const filterable = columns.filter((c) => c.filter && c.value);
  const selects = filterable.filter((c) => c.filter !== 'text'); // les filtres « texte » sont couverts par la recherche globale
  const activeCount = selects.filter((c) => filters[c.key]).length;
  const [dialog, setDialog] = useState<'filters' | 'columns' | null>(null);
  const columnsBtn = useRef<HTMLButtonElement>(null);
  const filtersBtn = useRef<HTMLButtonElement>(null);
  const active = q.trim() !== '' || Object.values(filters).some(Boolean);

  const result = useMemo(() => {
    const needle = norm(q.trim());
    let out = rows.filter((r) => {
      if (needle && !searchable.some((c) => norm(c.value!(r)).includes(needle))) return false;
      return filterable.every((c) => {
        const f = filters[c.key];
        if (!f) return true;
        return c.filter === 'text' ? norm(c.value!(r)).includes(norm(f)) : String(c.value!(r) ?? '') === f;
      });
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) out = [...out].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * cmp(col.value!(a), col.value!(b)));
    }
    return out;
  }, [rows, q, filters, sort, columns, searchable, filterable]);

  const pages = Math.max(1, Math.ceil(result.length / size));
  const current = Math.min(page, pages);
  const from = result.length === 0 ? 0 : (current - 1) * size + 1;
  const to = Math.min(current * size, result.length);
  const visible = result.slice((current - 1) * size, current * size);
  const go = (p: number) => setPage(Math.min(Math.max(1, p), pages));
  const onSort = (key: string) => { setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null)); setPage(1); };
  const reset = () => { setQ(''); setFilters({}); setPage(1); };

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label={labels.search} placeholder={labels.searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="h-10 rounded-3xl pl-10" />
        </div>
        {(selects.length > 0 || narrow) && (
          <button ref={filtersBtn} type="button" className={menuButton} aria-label={labels.filters} aria-haspopup="true" aria-expanded={dialog === 'filters'} onClick={() => setDialog(dialog === 'filters' ? null : 'filters')}>
            <SlidersHorizontal className="size-4" aria-hidden /><span className="max-sm:sr-only">{labels.filters}</span>
            {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-brand-strong text-xs text-white">{activeCount}</span>}
          </button>
        )}
        {togglable.length > 1 && (
          <button ref={columnsBtn} type="button" className={menuButton} aria-label={labels.columnsMenu} aria-haspopup="true" aria-expanded={dialog === 'columns'} onClick={() => setDialog(dialog === 'columns' ? null : 'columns')}>
            <Columns3 className="size-4" aria-hidden /><span className="max-sm:sr-only">{labels.columnsMenu}</span>
          </button>
        )}
        {exportName && (
          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" aria-label={labels.export} disabled={result.length === 0}
            onClick={() => downloadCsv(exportName, searchable.map((c) => (typeof c.header === 'string' ? c.header : c.filterLabel ?? c.key)), result.map((r) => searchable.map((c) => c.value!(r))))}>
            <Download className="size-4" aria-hidden /><span className="max-sm:sr-only">{labels.export}</span>
          </Button>
        )}
        {toolbar}
      </div>

      <Popover open={dialog === 'filters'} anchorRef={filtersBtn} onClose={() => setDialog(null)} align="end" className="w-64 p-3">
        <div className="space-y-3">
          {selects.map((c) => {
            const label = c.filterLabel ?? (typeof c.header === 'string' ? c.header : c.key);
            return (
              <label key={c.key} className="block space-y-1 text-xs font-medium text-muted">{label}
                <Select className="h-10 text-sm text-fg" value={filters[c.key] ?? ''} onChange={(e) => { setFilters({ ...filters, [c.key]: e.target.value }); setPage(1); }}>
                  <option value="">{labels.allOption}</option>
                  {(c.filter as { options: readonly { value: string; label: string }[] }).options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
            );
          })}
          {narrow && (
            <label className="block space-y-1 text-xs font-medium text-muted">{labels.sortLabel}
              <Select className="h-10 text-sm text-fg" value={sort ? `${sort.key}:${sort.dir}` : ''}
                onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort(key ? { key, dir: dir as 'asc' | 'desc' } : null); setPage(1); }}>
                <option value="">—</option>
                {sortable.flatMap((c) => { const n = typeof c.header === 'string' ? c.header : c.filterLabel ?? c.key; return (['asc', 'desc'] as const).map((d) => <option key={`${c.key}:${d}`} value={`${c.key}:${d}`}>{n} {d === 'asc' ? '↑' : '↓'}</option>); })}
              </Select>
            </label>
          )}
          <div className="flex justify-end pt-1">
            {active && <Button type="button" variant="ghost" onClick={reset}>{labels.reset}</Button>}
            
          </div>
        </div>
      </Popover>
      <Popover open={dialog === 'columns'} anchorRef={columnsBtn} onClose={() => setDialog(null)} align="end" className="w-56 p-2">
        <fieldset>
          <legend className="sr-only">{labels.columnsMenu}</legend>
          {togglable.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-soft">
              <input type="checkbox" className="size-4 accent-[var(--color-brand-strong)]" checked={isShown(c)} disabled={isShown(c) && displayed.filter((d) => !d.srOnlyHeader).length === 1}
                onChange={(e) => setShown({ ...shown, [c.key]: e.target.checked })} />
              {typeof c.header === 'string' ? c.header : c.filterLabel ?? c.key}
            </label>
          ))}
        </fieldset>
      </Popover>

      <DataTable columns={displayed} rows={visible} rowKey={rowKey} minWidth={minWidth} stacked={narrow} sort={sort} onSort={onSort} sortLabel={labels.sortBy}
        empty={rows.length === 0 ? empty : result.length === 0 ? labels.noResults : undefined} />

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p aria-live="polite">{labels.showing(from, to, result.length)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">{labels.rowsPerPage}
              <Select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className="h-9 w-auto min-w-20 text-fg">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </label>
            <nav aria-label={labels.pageOf(current, pages)} className="flex items-center gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => go(1)} disabled={current === 1} aria-label={labels.first}><ChevronsLeft className="size-4" aria-hidden /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => go(current - 1)} disabled={current === 1} aria-label={labels.prev}><ChevronLeft className="size-4" aria-hidden /></Button>
              <span className="px-2 text-fg">{labels.pageOf(current, pages)}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => go(current + 1)} disabled={current === pages} aria-label={labels.next}><ChevronRight className="size-4" aria-hidden /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => go(pages)} disabled={current === pages} aria-label={labels.last}><ChevronsRight className="size-4" aria-hidden /></Button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
