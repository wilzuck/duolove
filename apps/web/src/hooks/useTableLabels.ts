import { useTranslations } from 'next-intl';
import type { DataTableLabels } from '@duomatch/ui';

/** Textes (FR/EN) de la barre de recherche, des filtres et de la pagination des tableaux. */
export function useTableLabels(): DataTableLabels {
  const t = useTranslations('table');
  const common = useTranslations('common');
  return {
    search: t('search'), searchPlaceholder: t('searchPlaceholder'), allOption: t('all'), reset: t('reset'), rowsPerPage: t('rowsPerPage'),
    showing: (from, to, total) => t('showing', { from, to, total }), pageOf: (page, pages) => t('pageOf', { page, pages }),
    first: t('first'), prev: t('prev'), next: t('next'), last: t('last'), noResults: t('noResults'), export: t('export'), sortBy: (name) => t('sortBy', { name }), sortLabel: t('sortLabel'), columnsMenu: t('columns'), filters: t('filters'), done: t('done'), close: common('close'),
  };
}
