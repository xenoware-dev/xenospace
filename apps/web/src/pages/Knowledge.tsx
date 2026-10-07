import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DOC_VISIBILITIES, createKbNoteSchema,
  type KbGraph, type KbNote, type Paginated,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { number, relativeTime, titleCase } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState, Skeleton } from '@/components/ui/Spinner.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { SearchField } from '@/components/ui/Toolbar.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { KnowledgeGraph } from '@/components/KnowledgeGraph.jsx';
import { Edit, Graph, Knowledge as KnowledgeIcon, Link as LinkIcon, Plus, Trash } from '@/components/icons.jsx';

/**
 * Knowledge base.
 *
 * Three panes: a note list, the note itself, and a graph view that can take
 * over the whole surface. Notes link with `[[wiki links]]`, and the graph is
 * built from those links, so the structure emerges from writing rather than
 * from maintaining a separate hierarchy.
 */
export function KnowledgePage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { allows, user } = useAuth();
  const { data: projects } = useProjectOptions();
  const [createOpen, setCreateOpen] = useQueryFlag('new');
  const [editing, setEditing] = useState<KbNote | null>(null);
  const [deleting, setDeleting] = useState<KbNote | null>(null);
  const [view, setView] = useState<'notes' | 'graph'>('notes');

  const { filters, setFilter } = useFilters({ q: '', projectId: '', tag: '' });

  const listQuery = {
    q: filters.q || undefined,
    projectId: filters.projectId || undefined,
    tag: filters.tag || undefined,
    pageSize: '100',
  };

  const { data: notes, isLoading, error, refetch } = useQuery({
    queryKey: keys.notes(listQuery),
    queryFn: () => api.get<Paginated<KbNote>>('/kb', listQuery),
  });

  const { data: facets } = useQuery({
    queryKey: keys.kbFacets,
    queryFn: () => api.get<{ tags: Array<{ tag: string; count: number }>; folders: Array<{ folder: string; count: number }> }>('/kb/facets'),
  });

  const { data: graph } = useQuery({
    queryKey: keys.graph(filters.projectId || undefined),
    queryFn: () => api.get<KbGraph>('/kb/graph', { projectId: filters.projectId || undefined }),
    enabled: view === 'graph',
  });

  /*
   * A wiki link navigates by title rather than id, since the author writes the
   * title. Resolving it here means a link to an unwritten note offers to
   * create it instead of dead-ending.
   */
  const titleParam = params.get('title');
  const selectedId = routeId ?? (titleParam
    ? notes?.items.find((note) => note.title.toLowerCase() === titleParam.toLowerCase())?.id
    : notes?.items[0]?.id);

  const { data: note } = useQuery({
    queryKey: keys.note(selectedId ?? ''),
    queryFn: () => api.get<KbNote>(`/kb/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  // Intercept wiki-link clicks inside rendered markdown so they route in-app.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a.xs-wikilink');
      if (!anchor) return;
      event.preventDefault();
      const title = anchor.getAttribute('data-title');
      if (!title) return;
      const target = notes?.items.find((candidate) => candidate.title.toLowerCase() === title.toLowerCase());
      if (target) navigate(`/knowledge/${target.id}`);
      else navigate(`/knowledge?title=${encodeURIComponent(title)}&new=1`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [notes, navigate]);

  const remove = useMutate((noteId: string) => api.delete(`/kb/${noteId}`), {
    invalidates: [['kb']],
    successMessage: 'Note deleted',
    onSuccess: () => {
      setDeleting(null);
      navigate('/knowledge', { replace: true });
    },
  });

  const canEdit = note && (allows('kb:update') || note.author.id === user?.id);

  return (
    <Page
      fullBleed
      title="Knowledge Base"
      description="Team documentation, linked together."
      actions={
        allows('kb:create') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            New note
          </Button>
        )
      }
      toolbar={
        <>
          <SegmentedControl
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { value: 'notes', label: 'Notes' },
              { value: 'graph', label: <span className="flex items-center gap-1"><Graph size={11} /> Graph</span> },
            ]}
          />
          <SearchField
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
            placeholder="Search notes…"
            className="w-full sm:w-56"
          />
          {filters.tag && (
            <button
              type="button"
              onClick={() => setFilter('tag', '')}
              className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--accent-wash)] px-2 py-1 text-2xs font-medium text-[var(--accent)]"
            >
              #{filters.tag}
              <span aria-hidden="true">×</span>
            </button>
          )}
        </>
      }
    >
      {view === 'graph' ? (
        <Card padded={false} className="h-full overflow-hidden">
          {!graph ? (
            <LoadingState label="Building the graph" />
          ) : (
            <KnowledgeGraph
              graph={graph}
              selectedId={selectedId ?? null}
              onSelect={(nodeId) => {
                setView('notes');
                navigate(`/knowledge/${nodeId}`);
              }}
            />
          )}
        </Card>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden px-4 pb-4 sm:px-6 lg:grid-cols-[17rem_1fr]">
          {/* ------------------------------------------------------ sidebar */}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {facets && facets.tags.length > 0 && (
              <Card>
                <h3 className="text-xs font-medium text-[var(--ink-muted)]">Tags</h3>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {facets.tags.slice(0, 14).map((facet) => (
                    <li key={facet.tag}>
                      <button
                        type="button"
                        onClick={() => setFilter('tag', filters.tag === facet.tag ? '' : facet.tag)}
                        className={cn(
                          'rounded-[var(--radius-full)] px-2 py-0.5 text-2xs transition-colors',
                          filters.tag === facet.tag
                            ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                            : 'bg-[var(--surface-3)] text-[var(--ink-secondary)] hover:bg-[var(--wash-active)]',
                        )}
                      >
                        {facet.tag}
                        <span className="ml-1 opacity-60 tabular-nums">{facet.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card padded={false} className="min-h-0 flex-1 overflow-hidden">
              <div className="border-b border-[var(--line-subtle)] px-3 py-2">
                <p className="text-xs font-medium text-[var(--ink-muted)]">
                  {notes ? `${notes.total} notes` : 'Notes'}
                </p>
              </div>
              {isLoading ? (
                <div className="p-3">
                  {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mb-2 h-10" />)}
                </div>
              ) : error ? (
                <div className="p-3">
                  <ErrorState message="Notes could not be loaded." onRetry={() => void refetch()} />
                </div>
              ) : notes!.items.length === 0 ? (
                <EmptyState compact icon={<KnowledgeIcon size={16} />} title="No notes" message="Create the first one." />
              ) : (
                <ul className="overflow-y-auto">
                  {notes!.items.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/knowledge/${candidate.id}`)}
                        className={cn(
                          'flex w-full items-start gap-2 border-b border-[var(--line-subtle)] px-3 py-2 text-left transition-colors',
                          candidate.id === selectedId ? 'bg-[var(--wash-selected)]' : 'hover:bg-[var(--wash-hover)]',
                        )}
                      >
                        <span aria-hidden="true" className="mt-0.5 shrink-0 text-xs">
                          {candidate.icon ?? '📄'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate-line text-xs font-medium">{candidate.title}</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--ink-faint)]">
                            {candidate.folder ? `${candidate.folder} · ` : ''}
                            {relativeTime(candidate.updatedAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* --------------------------------------------------------- note */}
          <div className="min-h-0 overflow-y-auto">
            {!note ? (
              titleParam ? (
                <Card>
                  <EmptyState
                    icon={<LinkIcon size={18} />}
                    title={`“${titleParam}” does not exist yet`}
                    message="This note is linked from somewhere but has not been written."
                    action={
                      allows('kb:create') ? (
                        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                          Create it
                        </Button>
                      ) : undefined
                    }
                  />
                </Card>
              ) : (
                <Card>
                  <EmptyState
                    icon={<KnowledgeIcon size={20} />}
                    title="Select a note"
                    message="Pick one from the list, or create a new one."
                  />
                </Card>
              )
            ) : (
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                      {note.icon && <span aria-hidden="true">{note.icon}</span>}
                      <span className="min-w-0">{note.title}</span>
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={note.visibility === 'PRIVATE' ? 'warning' : 'neutral'} size="sm">
                        {titleCase(note.visibility)}
                      </Badge>
                      {note.folder && <Badge tone="neutral" size="sm">{note.folder}</Badge>}
                      {note.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setFilter('tag', tag)}
                          className="rounded-[var(--radius-full)] bg-[var(--accent-wash)] px-2 py-0.5 text-2xs font-medium text-[var(--accent)] hover:bg-[var(--accent-wash-strong)]"
                        >
                          #{tag}
                        </button>
                      ))}
                      <span className="text-2xs text-[var(--ink-faint)]">
                        {number(note.wordCount)} words · updated {relativeTime(note.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton label="Edit note" size="sm" onClick={() => setEditing(note)}>
                        <Edit size={14} />
                      </IconButton>
                      <IconButton label="Delete note" size="sm" onClick={() => setDeleting(note)}>
                        <Trash size={14} />
                      </IconButton>
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-[var(--line-subtle)] pt-5">
                  {note.content ? (
                    <Markdown content={note.content} />
                  ) : (
                    <p className="text-xs text-[var(--ink-faint)] italic">This note is empty.</p>
                  )}
                </div>

                {(note.outboundLinks.length > 0 || note.inboundLinks.length > 0) && (
                  <div className="mt-6 grid gap-4 border-t border-[var(--line-subtle)] pt-5 sm:grid-cols-2">
                    {note.inboundLinks.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-[var(--ink-muted)]">
                          Linked from ({note.inboundLinks.length})
                        </h3>
                        <ul className="flex flex-col gap-1">
                          {note.inboundLinks.map((link) => (
                            <li key={link.id}>
                              <button
                                type="button"
                                onClick={() => navigate(`/knowledge/${link.id}`)}
                                className="w-full truncate-line rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-3)]"
                              >
                                {link.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {note.outboundLinks.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-[var(--ink-muted)]">
                          Links to ({note.outboundLinks.length})
                        </h3>
                        <ul className="flex flex-col gap-1">
                          {note.outboundLinks.map((link) => (
                            <li key={link.title}>
                              <button
                                type="button"
                                onClick={() =>
                                  link.id
                                    ? navigate(`/knowledge/${link.id}`)
                                    : navigate(`/knowledge?title=${encodeURIComponent(link.title)}`)
                                }
                                className={cn(
                                  'flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-xs transition-colors',
                                  link.id
                                    ? 'bg-[var(--surface-inset)] hover:bg-[var(--surface-3)]'
                                    : 'bg-[var(--status-warning-wash)] text-[var(--status-warning-ink)]',
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate-line">{link.title}</span>
                                {!link.id && <span className="shrink-0 text-[10px]">not written</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5 flex items-center gap-4 border-t border-[var(--line-subtle)] pt-4">
                  <span className="flex items-center gap-2 text-2xs text-[var(--ink-muted)]">
                    Written by <UserChip user={note.author} />
                  </span>
                  {note.lastEditedBy && note.lastEditedBy.id !== note.author.id && (
                    <span className="flex items-center gap-2 text-2xs text-[var(--ink-muted)]">
                      Last edited by <UserChip user={note.lastEditedBy} />
                    </span>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <NoteModal
        open={createOpen || editing !== null}
        note={editing}
        defaultTitle={titleParam ?? ''}
        projects={projects ?? []}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={(saved) => navigate(`/knowledge/${saved.id}`)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        message="Notes linking to it keep their link, which will show as unresolved in the graph."
        loading={remove.isPending}
      />
    </Page>
  );
}

function NoteModal({
  open, note, defaultTitle, projects, onClose, onSaved,
}: {
  open: boolean;
  note: KbNote | null;
  defaultTitle: string;
  projects: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (note: KbNote) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? defaultTitle);
  const [content, setContent] = useState(note?.content ?? '');
  const [folder, setFolder] = useState(note?.folder ?? '');
  const [icon, setIcon] = useState(note?.icon ?? '');
  const [visibility, setVisibility] = useState<KbNote['visibility']>(note?.visibility ?? 'TEAM');
  const [projectId, setProjectId] = useState(note?.projectId ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed when the modal opens for a different note.
  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? defaultTitle);
    setContent(note?.content ?? '');
    setFolder(note?.folder ?? '');
    setIcon(note?.icon ?? '');
    setVisibility(note?.visibility ?? 'TEAM');
    setProjectId(note?.projectId ?? '');
    setTags(note?.tags ?? []);
    setErrors({});
  }, [open, note, defaultTitle]);

  const save = useMutate(
    (input: unknown) =>
      note ? api.patch<KbNote>(`/kb/${note.id}`, input) : api.post<KbNote>('/kb', input),
    {
      invalidates: [['kb']],
      successMessage: note ? 'Note updated' : 'Note created',
      errorMessage: 'Could not save the note',
      onSuccess: (saved) => {
        onClose();
        onSaved(saved);
      },
    },
  );

  const addTag = () => {
    const value = tagInput.trim().toLowerCase().slice(0, 32);
    if (value && !tags.includes(value) && tags.length < 20) setTags([...tags, value]);
    setTagInput('');
  };

  const submit = () => {
    const parsed = createKbNoteSchema.safeParse({
      title, content, tags, visibility,
      folder: folder || undefined,
      icon: icon || undefined,
      projectId: projectId || undefined,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={note ? `Edit “${note.title}”` : 'New note'}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {note ? 'Save changes' : 'Create note'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[4rem_1fr]">
          <TextInput
            label="Icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={4}
            placeholder="📘"
            className="text-center text-lg"
          />
          <TextInput
            label="Title"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            placeholder="Engineering Handbook"
            hint="Titles must be unique — wiki links resolve by title."
          />
        </div>

        <TextArea
          label="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={errors.content}
          rows={16}
          placeholder={'# Heading\n\nWrite here. Link to another note with [[Its Title]].\n\n- A list item\n- [ ] A task\n'}
          hint="Markdown, with [[wiki links]] between notes."
          className="font-mono text-xs"
          aside={`${content.length.toLocaleString()} characters`}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="Folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Engineering"
          />
          <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </Select>
          <Select
            label="Visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as KbNote['visibility'])}
            hint={visibility === 'PRIVATE' ? 'Only you' : visibility === 'TEAM' ? 'Project members' : 'Everyone'}
          >
            {DOC_VISIBILITIES.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--ink-secondary)]">Tags</span>
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-3)] px-2 py-0.5 text-2xs transition-colors hover:bg-[var(--status-critical-wash)] hover:text-[var(--status-critical-ink)]"
                  >
                    {tag}
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="Type a tag and press Enter"
            aria-label="Add a tag"
            className="h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 text-sm ring-1 ring-inset ring-[var(--line)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}
