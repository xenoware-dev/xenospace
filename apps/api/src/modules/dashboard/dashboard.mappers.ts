import type { CodeReview, Issue, Task } from '@xenospace/shared';
import { iso, nestedUser } from '../../lib/serialize.js';

/**
 * Row mappers shared by the dashboard queries.
 *
 * Kept separate from the per-module mappers because the dashboard selects its
 * own tailored column sets, and importing the module services here would create
 * a cycle (sprints and reviews already import from the dashboard side).
 */

const FORMER_MEMBER = {
  id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER' as const,
  status: 'DEACTIVATED' as const, avatarUrl: null, avatarColor: '#94a3b8',
  jobTitle: null, presence: 'OFFLINE' as const, lastSeenAt: null,
};

export function mapTaskRows(rows: Array<Record<string, unknown>>): Task[] {
  return rows.map((row) => ({
    id: row.id as string,
    reference: `${row.project_key as string}-${row.number as number}`,
    projectId: row.project_id as string,
    project: {
      id: row.project_id as string,
      name: row.project_name as string,
      key: row.project_key as string,
      color: row.project_color as string,
    },
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    type: row.type as Task['type'],
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    assignee: nestedUser(row, 'assignee'),
    reporter: nestedUser(row, 'reporter') ?? FORMER_MEMBER,
    sprintId: (row.sprint_id as string | null) ?? null,
    parentTaskId: (row.parent_task_id as string | null) ?? null,
    estimate: (row.estimate as number | null) ?? null,
    position: Number(row.position ?? 0),
    dueDate: (row.due_date as string | null) ?? null,
    labels: (row.labels as string[]) ?? [],
    commentCount: 0,
    attachmentCount: 0,
    subtaskCount: 0,
    doneSubtaskCount: 0,
    blockedBy: [],
    loggedMinutes: 0,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
    completedAt: iso(row.completed_at as string | null),
  }));
}

export function mapReviewRows(rows: Array<Record<string, unknown>>): CodeReview[] {
  return rows.map((row) => ({
    id: row.id as string,
    reference: `${row.project_key as string}-PR${row.number as number}`,
    projectId: row.project_id as string,
    repositoryId: (row.repository_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as CodeReview['status'],
    author: nestedUser(row, 'author') ?? FORMER_MEMBER,
    reviewers: [],
    sourceBranch: row.source_branch as string,
    targetBranch: row.target_branch as string,
    externalNumber: (row.external_number as number | null) ?? null,
    externalUrl: (row.external_url as string | null) ?? null,
    additions: (row.additions as number) ?? 0,
    deletions: (row.deletions as number) ?? 0,
    changedFiles: (row.changed_files as number) ?? 0,
    commentCount: 0,
    unresolvedCount: 0,
    linkedTaskId: (row.linked_task_id as string | null) ?? null,
    // The dashboard only lists reviews; nothing there acts on merge or close.
    syncedFromGitHub: row.external_number != null && Boolean(row.external_url),
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
    mergedAt: iso(row.merged_at as string | null),
  }));
}

export function mapIssueRows(rows: Array<Record<string, unknown>>): Issue[] {
  return rows.map((row) => ({
    id: row.id as string,
    reference: `${row.project_key as string}-B${row.number as number}`,
    projectId: row.project_id as string,
    project: {
      id: row.project_id as string,
      name: row.project_name as string,
      key: row.project_key as string,
      color: row.project_color as string,
    },
    title: row.title as string,
    description: row.description as string,
    kind: row.kind as Issue['kind'],
    severity: row.severity as Issue['severity'],
    status: row.status as Issue['status'],
    assignee: nestedUser(row, 'assignee'),
    reporter: nestedUser(row, 'reporter') ?? FORMER_MEMBER,
    stepsToReproduce: (row.steps_to_reproduce as string | null) ?? null,
    expectedBehaviour: (row.expected_behaviour as string | null) ?? null,
    actualBehaviour: (row.actual_behaviour as string | null) ?? null,
    environment: (row.environment as string | null) ?? null,
    affectedVersion: (row.affected_version as string | null) ?? null,
    labels: (row.labels as string[]) ?? [],
    linkedTaskId: (row.linked_task_id as string | null) ?? null,
    resolution: (row.resolution as string | null) ?? null,
    commentCount: 0,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
    resolvedAt: iso(row.resolved_at as string | null),
  }));
}
