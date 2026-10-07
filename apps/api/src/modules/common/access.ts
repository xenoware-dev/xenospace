import { can, type Permission, type Role } from '@xenospace/shared';
import { db, type Queryable } from '../../db/index.js';
import { forbidden, notFound } from '../../lib/errors.js';
import type { Principal } from '../../middleware/authenticate.js';

/**
 * Data scoping.
 *
 * RBAC answers "may this role perform this action at all". It cannot answer
 * "on *this* record", which is where multi-tenant systems usually leak. Every
 * query that touches project-owned data goes through a scope built here, so
 * membership is enforced in the WHERE clause rather than remembered by hand.
 *
 * The rule: a team lead sees the whole workspace; a developer sees only
 * projects they are a member of.
 */

export function isAdmin(actor: Principal | { role: Role }): boolean {
  return actor.role === 'ADMIN';
}

/**
 * A SQL fragment and parameter restricting `projects` to what the actor may see.
 *
 * Returns `null` for an admin, meaning "no restriction" — callers must treat
 * null as *unrestricted*, not as *deny*.
 */
export function projectScope(actor: Principal, alias = 'p'): { sql: string; params: [string] } | null {
  if (isAdmin(actor)) return null;
  return {
    sql: `EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${alias}.id AND pm.user_id = $PARAM)`,
    params: [actor.id],
  };
}

/** True when the actor may read the project at all. */
export async function canAccessProject(actor: Principal, projectId: string, tx?: Queryable): Promise<boolean> {
  const runner = tx ?? db();
  if (isAdmin(actor)) {
    const { rows } = await runner.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1) AS ok`,
      [projectId],
    );
    return rows[0]?.ok === true;
  }
  const { rows } = await runner.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2
     ) AS ok`,
    [projectId, actor.id],
  );
  return rows[0]?.ok === true;
}

/**
 * Asserts project access, raising 404 rather than 403 when denied.
 *
 * The status is deliberate: a 403 would confirm the project exists, letting
 * someone enumerate project ids across tenants. "Not found" is what a caller
 * without access should observe.
 */
export async function assertProjectAccess(actor: Principal, projectId: string, tx?: Queryable): Promise<void> {
  if (!(await canAccessProject(actor, projectId, tx))) throw notFound('Project');
}

/** Project ids the actor may see. Used where a scoped subquery is awkward. */
export async function visibleProjectIds(actor: Principal, tx?: Queryable): Promise<string[]> {
  const runner = tx ?? db();
  const { rows } = isAdmin(actor)
    ? await runner.query<{ id: string }>(`SELECT id FROM projects WHERE archived_at IS NULL`)
    : await runner.query<{ id: string }>(
        `SELECT p.id FROM projects p
           JOIN project_members pm ON pm.project_id = p.id
          WHERE pm.user_id = $1 AND p.archived_at IS NULL`,
        [actor.id],
      );
  return rows.map((r) => r.id);
}

/**
 * Resolves an action the actor may hold either broadly or only over their own
 * records, e.g. `task:update` versus `task:update_own`.
 *
 * Returns how the caller must scope the write. `'none'` means neither
 * permission is held.
 */
export function ownershipMode(
  actor: Principal,
  broad: Permission,
  own: Permission,
): 'all' | 'own' | 'none' {
  if (can(actor.role, broad)) return 'all';
  if (can(actor.role, own)) return 'own';
  return 'none';
}

/**
 * Asserts the actor may write this record, given an ownership-scoped permission.
 * `ownerIds` lists the users who count as owners (author, assignee, …).
 */
export function assertOwnershipWrite(
  actor: Principal,
  broad: Permission,
  own: Permission,
  ownerIds: Array<string | null | undefined>,
): void {
  const mode = ownershipMode(actor, broad, own);
  if (mode === 'all') return;
  if (mode === 'own' && ownerIds.some((id) => id && id === actor.id)) return;
  throw forbidden();
}

/**
 * Builds a parameterised WHERE clause incrementally.
 *
 * Values only ever enter as placeholders — the builder has no API that accepts
 * a raw value into SQL text, which is what keeps the dynamic filtering on the
 * list endpoints free of injection by construction.
 */
export class WhereBuilder {
  private readonly clauses: string[] = [];
  private readonly values: unknown[] = [];

  constructor(private readonly startIndex = 0) {}

  /** Adds a clause; `?` placeholders are replaced with positional parameters. */
  add(clause: string, ...params: unknown[]): this {
    let i = 0;
    const sql = clause.replace(/\?/g, () => {
      this.values.push(params[i++]);
      return `$${this.startIndex + this.values.length}`;
    });
    this.clauses.push(sql);
    return this;
  }

  /** Adds the clause only when `condition` holds. */
  addIf(condition: unknown, clause: string, ...params: unknown[]): this {
    if (condition === undefined || condition === null || condition === false) return this;
    if (Array.isArray(condition) && condition.length === 0) return this;
    return this.add(clause, ...params);
  }

  /** Pushes a value and returns its placeholder, for use in a custom fragment. */
  param(value: unknown): string {
    this.values.push(value);
    return `$${this.startIndex + this.values.length}`;
  }

  raw(clause: string): this {
    this.clauses.push(clause);
    return this;
  }

  get sql(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }

  get params(): unknown[] {
    return [...this.values];
  }

  get nextIndex(): number {
    return this.startIndex + this.values.length;
  }
}

/**
 * Applies the project scope to a builder. Call this on every list query over
 * project-owned data; forgetting it is what turns a filter into a data leak.
 */
export function applyProjectScope(where: WhereBuilder, actor: Principal, projectIdColumn: string): void {
  if (isAdmin(actor)) return;
  where.add(
    `EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${projectIdColumn} AND pm.user_id = ?)`,
    actor.id,
  );
}

/** Whitelists a sort column, so a client-supplied key can never reach SQL. */
export function safeSort<T extends string>(
  requested: string | undefined,
  allowed: Record<T, string>,
  fallback: T,
): string {
  const key = (requested ?? fallback) as T;
  return allowed[key] ?? allowed[fallback];
}

export function safeOrder(requested: string | undefined): 'ASC' | 'DESC' {
  return requested?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}
