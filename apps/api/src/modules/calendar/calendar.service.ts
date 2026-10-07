import type { CalendarEvent } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { recordActivity } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import type { Principal } from '../../middleware/authenticate.js';
import { assertProjectAccess, isAdmin, visibleProjectIds, WhereBuilder } from '../common/access.js';

const EVENT_SELECT = `
  SELECT e.id, e.project_id, e.title, e.description, e.kind, e.starts_at, e.ends_at,
         e.all_day, e.location, e.meeting_url, e.recurrence_rule, e.reminder_minutes, e.created_at,
         ${userJoinColumns('o', 'organizer')}
    FROM calendar_events e
    LEFT JOIN users o ON o.id = e.organizer_id
`;

function mapEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    projectId: (row.project_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    kind: row.kind as CalendarEvent['kind'],
    startsAt: iso(row.starts_at as string)!,
    endsAt: iso(row.ends_at as string)!,
    allDay: Boolean(row.all_day),
    location: (row.location as string | null) ?? null,
    meetingUrl: (row.meeting_url as string | null) ?? null,
    organizer: nestedUser(row, 'organizer') ?? {
      id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER', status: 'DEACTIVATED',
      avatarUrl: null, avatarColor: '#94a3b8', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    attendees: [],
    recurrenceRule: (row.recurrence_rule as string | null) ?? null,
    reminderMinutes: (row.reminder_minutes as number | null) ?? null,
    createdAt: iso(row.created_at as string)!,
  };
}

async function attachAttendees(events: CalendarEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT ea.event_id, ea.response, ${userJoinColumns('u', 'u')}
       FROM event_attendees ea JOIN users u ON u.id = ea.user_id
      WHERE ea.event_id = ANY($1::uuid[]) ORDER BY u.name`,
    [events.map((e) => e.id)],
  );
  const byEvent = new Map<string, CalendarEvent['attendees']>();
  for (const row of rows) {
    const list = byEvent.get(row.event_id as string) ?? [];
    list.push({
      user: nestedUser(row, 'u')!,
      response: row.response as 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE',
    });
    byEvent.set(row.event_id as string, list);
  }
  for (const event of events) event.attendees = byEvent.get(event.id) ?? [];
}

/**
 * Visibility clause for the calendar.
 *
 * An event is visible when it belongs to a project the viewer can see, or when
 * they organise or attend it. Personal events (no project) are therefore private
 * to their participants rather than workspace-wide.
 */
function applyEventScope(where: WhereBuilder, actor: Principal, visibleIds: string[]): void {
  if (isAdmin(actor)) return;
  where.add(
    `(
       (e.project_id IS NOT NULL AND e.project_id = ANY(?::uuid[]))
       OR e.organizer_id = ?
       OR EXISTS (SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = ?)
     )`,
    visibleIds, actor.id, actor.id,
  );
}

export async function listEvents(
  actor: Principal,
  range: { from: string; to: string; projectId?: string },
): Promise<CalendarEvent[]> {
  if (range.projectId) await assertProjectAccess(actor, range.projectId);
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);

  const where = new WhereBuilder();
  // Overlap, not containment: an event spanning the window must still appear.
  where.add(`e.starts_at < ? AND e.ends_at > ?`, range.to, range.from);
  where.addIf(range.projectId, `e.project_id = ?`, range.projectId);
  applyEventScope(where, actor, visibleIds);

  const { rows } = await db().query<Record<string, unknown>>(
    `${EVENT_SELECT} ${where.sql} ORDER BY e.starts_at ASC LIMIT 1000`,
    where.params,
  );
  const events = rows.map(mapEvent);
  await attachAttendees(events);
  return events;
}

export async function getEvent(actor: Principal, id: string): Promise<CalendarEvent> {
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);
  const where = new WhereBuilder();
  where.add(`e.id = ?`, id);
  applyEventScope(where, actor, visibleIds);

  const { rows } = await db().query<Record<string, unknown>>(`${EVENT_SELECT} ${where.sql}`, where.params);
  const row = rows[0];
  if (!row) throw notFound('Event');
  const event = mapEvent(row);
  await attachAttendees([event]);
  return event;
}

export async function createEvent(actor: Principal, input: Record<string, unknown>): Promise<CalendarEvent> {
  if (input.projectId) await assertProjectAccess(actor, input.projectId as string);

  const id = await db().transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO calendar_events (project_id, title, description, kind, starts_at, ends_at,
                                    all_day, location, meeting_url, organizer_id,
                                    recurrence_rule, reminder_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        input.projectId ?? null, input.title, input.description ?? null, input.kind ?? 'MEETING',
        input.startsAt, input.endsAt, input.allDay ?? false, input.location ?? null,
        input.meetingUrl ?? null, actor.id, input.recurrenceRule ?? null, input.reminderMinutes ?? null,
      ],
    );
    const eventId = rows[0]!.id;

    // The organiser attends by default and is already accepted.
    const attendees = new Set([actor.id, ...((input.attendeeIds as string[]) ?? [])]);
    for (const userId of attendees) {
      await tx.query(
        `INSERT INTO event_attendees (event_id, user_id, response) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [eventId, userId, userId === actor.id ? 'ACCEPTED' : 'PENDING'],
      );
    }

    await recordActivity(
      { actorId: actor.id, action: 'event.created', entityType: 'event', entityId: eventId, entityLabel: input.title as string, projectId: (input.projectId as string) ?? null },
      tx,
    );
    return eventId;
  });

  const event = await getEvent(actor, id);
  await notify({
    userIds: event.attendees.map((a) => a.user.id),
    kind: 'EVENT_REMINDER',
    title: `Invited: ${event.title}`,
    body: new Date(event.startsAt).toUTCString(),
    link: `/calendar?event=${id}`,
    actorId: actor.id,
  });
  return event;
}

/** Only the organiser or a team lead may change an event. */
async function assertEventWrite(actor: Principal, id: string): Promise<CalendarEvent> {
  const event = await getEvent(actor, id);
  if (event.organizer.id !== actor.id && !isAdmin(actor)) {
    throw forbidden('Only the organiser can change this event.');
  }
  return event;
}

export async function updateEvent(actor: Principal, id: string, input: Record<string, unknown>): Promise<CalendarEvent> {
  await assertEventWrite(actor, id);

  const columns: Record<string, string> = {
    title: 'title', description: 'description', kind: 'kind', startsAt: 'starts_at',
    endsAt: 'ends_at', allDay: 'all_day', location: 'location', meetingUrl: 'meeting_url',
    reminderMinutes: 'reminder_minutes',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }

  await db().transaction(async (tx) => {
    if (sets.length > 0) {
      await tx.query(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = $1`, params);
    }
    if (input.attendeeIds !== undefined) {
      const ids = (input.attendeeIds as string[]) ?? [];
      // Removed attendees are deleted; existing ones keep their RSVP.
      await tx.query(
        `DELETE FROM event_attendees WHERE event_id = $1 AND user_id <> ALL($2::uuid[])`,
        [id, [...ids, actor.id]],
      );
      for (const userId of ids) {
        await tx.query(
          `INSERT INTO event_attendees (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, userId],
        );
      }
    }
  });

  return getEvent(actor, id);
}

export async function deleteEvent(actor: Principal, id: string): Promise<void> {
  const event = await assertEventWrite(actor, id);
  await db().transaction(async (tx) => {
    await tx.query(`DELETE FROM calendar_events WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'event.deleted', entityType: 'event', entityId: id, entityLabel: event.title, projectId: event.projectId },
      tx,
    );
  });
  await notify({
    userIds: event.attendees.map((a) => a.user.id),
    kind: 'SYSTEM', title: `Cancelled: ${event.title}`, actorId: actor.id,
  });
}

/** RSVP. Only the attendee may answer for themselves. */
export async function rsvp(
  actor: Principal,
  id: string,
  response: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE',
): Promise<CalendarEvent> {
  await getEvent(actor, id);
  const { rowCount } = await db().query(
    `UPDATE event_attendees SET response = $3 WHERE event_id = $1 AND user_id = $2`,
    [id, actor.id, response],
  );
  if (rowCount === 0) throw notFound('Invitation');
  return getEvent(actor, id);
}

/** Next few events for the dashboard. */
export async function upcoming(actor: Principal, limit = 5): Promise<CalendarEvent[]> {
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);
  const where = new WhereBuilder();
  where.raw(`e.ends_at > now()`);
  applyEventScope(where, actor, visibleIds);

  const { rows } = await db().query<Record<string, unknown>>(
    `${EVENT_SELECT} ${where.sql} ORDER BY e.starts_at ASC LIMIT ${Math.min(limit, 20)}`,
    where.params,
  );
  const events = rows.map(mapEvent);
  await attachAttendees(events);
  return events;
}
