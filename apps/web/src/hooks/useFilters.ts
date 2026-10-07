import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filter state in the URL.
 *
 * Filters live in the query string rather than React state, so a filtered view
 * is shareable, survives a reload, and works with the back button. That is the
 * behaviour people expect from a list view and the reason not to keep it local.
 */
export function useFilters<T extends Record<string, string | undefined>>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = params.get(key);
      if (value !== null) (out as Record<string, string>)[key] = value;
    }
    return out;
  }, [params, defaults]);

  const setFilter = useCallback(
    (key: keyof T & string, value: string | undefined) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (!value || value === defaults[key]) next.delete(key);
          else next.set(key, value);
          // Any filter change resets paging; page 4 of a new filter is meaningless.
          if (key !== 'page') next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams, defaults],
  );

  const setMany = useCallback(
    (updates: Partial<Record<keyof T & string, string | undefined>>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(updates)) {
            if (!value || value === defaults[key as keyof T]) next.delete(key);
            else next.set(key, value);
          }
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams, defaults],
  );

  const clear = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  /** Count of filters differing from their default, for the clear button. */
  const activeCount = useMemo(
    () =>
      Object.keys(defaults).filter(
        (key) => key !== 'page' && key !== 'sort' && key !== 'order' && filters[key] !== defaults[key],
      ).length,
    [filters, defaults],
  );

  return { filters, setFilter, setMany, clear, activeCount };
}

/** Reads a single query parameter, for a modal opened by `?new=1`. */
export function useQueryFlag(key: string): [boolean, (value: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) === '1';
  const set = useCallback(
    (next: boolean) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next) updated.set(key, '1');
          else updated.delete(key);
          return updated;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [value, set];
}
