import { useTranslations } from 'next-intl';
import type { DataTableLabels } from '@duomatch/ui';

/** Textes (FR/EN) de la barre de recherche, des filtres et de la pagination des tableaux. */
export function useTableLabels(): DataTableLabels {
  const t = useTranslations();
  return {
    search: t('table.search'), searchPlaceholder: t('table.searchPlaceholder'), allOption: t('table.all'), reset: t('table.reset'), rowsPerPage: t('table.rowsPerPage'),
    showing: (from, to, total) => t('table.showing', { from, to, total }), pageOf: (page, pages) => t('table.pageOf', { page, pages }),
    first: t('table.first'), prev: t('table.prev'), next: t('table.next'), last: t('table.last'), noResults: t('table.noResults'), export: t('table.export'), loadMore: t('table.loadMore'), actions: t('table.actions'), sortBy: (name) => t('table.sortBy', { name }), sortLabel: t('table.sortLabel'), columnsMenu: t('table.columns'), filters: t('table.filters'), done: t('table.done'), close: t('common.close'),
  };
}
