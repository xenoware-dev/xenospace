import type { Response } from 'express';
import type { Paginated, CursorPage } from '@xenospace/shared';

/** Response helpers, so status codes and envelopes stay consistent. */

export function ok<T>(res: Response, data: T): void {
  res.status(200).json(data);
}

export function created<T>(res: Response, data: T, location?: string): void {
  if (location) res.setHeader('Location', location);
  res.status(201).json(data);
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function cursorPage<T>(items: T[], limit: number, cursorOf: (item: T) => string): CursorPage<T> {
  // One extra row is fetched to detect a further page without a COUNT.
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: hasMore && last ? cursorOf(last) : null,
  };
}

/** Marks a response as private, so no shared cache retains per-user data. */
export function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, private');
}
