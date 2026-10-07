import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, type Paginated, type StoredFile } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { bytes, relativeTime, titleCase } from '@/lib/format.js';
import { useFilters } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { useToast } from '@/components/ui/Toast.jsx';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ClearFilters, FilterSelect, Pagination, SearchField } from '@/components/ui/Toolbar.jsx';
import { ConfirmDialog } from '@/components/ui/Modal.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { Download, Files as FilesIcon, Trash, Upload } from '@/components/icons.jsx';

/**
 * Files and documents.
 *
 * Drag-and-drop upload with a visible size and type contract, because a reject
 * after the upload has run is a waste of the user's time. Downloads go through
 * the API, which re-checks access and serves every file as an attachment.
 */
export function FilesPage() {
  const { allows, user, isAdmin } = useAuth();
  const { data: projects } = useProjectOptions();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('list');

  const { filters, setFilter, clear, activeCount } = useFilters({
    q: '', projectId: '', folder: '', mimeGroup: '', page: '1',
  });

  const query = {
    q: filters.q || undefined,
    projectId: filters.projectId || undefined,
    folder: filters.folder || undefined,
    mimeGroup: filters.mimeGroup || undefined,
    page: filters.page,
    pageSize: '30',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.files(query),
    queryFn: () => api.get<Paginated<StoredFile>>('/files', query),
  });

  const { data: folders } = useQuery({
    queryKey: keys.fileFolders(filters.projectId || undefined),
    queryFn: () => api.get<Array<{ folder: string; count: number }>>('/files/folders', {
      projectId: filters.projectId || undefined,
    }),
  });

  const upload = useMutate(
    (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (filters.projectId) form.append('projectId', filters.projectId);
      if (filters.folder) form.append('folder', filters.folder);
      return api.upload<StoredFile>('/files', form);
    },
    {
      invalidates: [['files']],
      successMessage: (file) => `${file.name} uploaded`,
      errorMessage: 'Upload failed',
    },
  );

  const remove = useMutate((id: string) => api.delete(`/files/${id}`), {
    invalidates: [['files']],
    successMessage: 'File deleted',
    onSuccess: () => setDeleting(null),
  });

  /** Validates before sending, so an oversized file never leaves the browser. */
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is too large`, `The limit is ${bytes(MAX_UPLOAD_BYTES)}.`);
        continue;
      }
      if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(file.type)) {
        toast.error(`${file.name} is not an allowed type`, file.type || 'Unknown type');
        continue;
      }
      upload.mutate(file);
    }
  };

  return (
    <Page
      title="Files & Docs"
      description="Shared documents, images and exports."
      actions={
        allows('file:upload') && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only-focusable"
              accept={ALLOWED_UPLOAD_MIME.join(',')}
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={14} />}
              loading={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              Upload
            </Button>
          </>
        )
      }
      toolbar={
        <>
          <SearchField
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
            placeholder="Search files…"
            className="w-full sm:w-52"
          />
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          <FilterSelect
            label="Folder"
            value={filters.folder}
            onChange={(value) => setFilter('folder', value)}
            options={(folders ?? []).map((f) => ({ value: f.folder, label: `${f.folder} (${f.count})` }))}
          />
          <FilterSelect
            label="Type"
            value={filters.mimeGroup}
            onChange={(value) => setFilter('mimeGroup', value)}
            options={[
              { value: 'image', label: 'Images' },
              { value: 'document', label: 'Documents' },
              { value: 'archive', label: 'Archives' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <ClearFilters count={activeCount} onClear={clear} />
          <span className="flex-1" />
          <SegmentedControl
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { value: 'list', label: 'List' },
              { value: 'grid', label: 'Grid' },
            ]}
          />
        </>
      }
    >
      {/* Drop zone wraps the whole content area, so a file can be dropped
          anywhere on the page rather than onto a small target. */}
      <div
        onDragOver={(event) => {
          if (!allows('file:upload')) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!allows('file:upload')) return;
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-[var(--radius-lg)] transition-colors',
          dragging && 'bg-[var(--accent-wash)] ring-2 ring-dashed ring-[var(--accent)]',
        )}
      >
        {dragging && (
          <p className="py-16 text-center text-sm font-medium text-[var(--accent)]">
            Drop to upload
          </p>
        )}

        {!dragging && (
          isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : error ? (
            <ErrorState message="Files could not be loaded." onRetry={() => void refetch()} />
          ) : data!.items.length === 0 ? (
            <EmptyState
              icon={<FilesIcon size={20} />}
              title={activeCount > 0 ? 'No files match those filters' : 'No files yet'}
              message={
                activeCount > 0
                  ? 'Try clearing a filter.'
                  : allows('file:upload')
                    ? `Drag files here, or use Upload. Up to ${bytes(MAX_UPLOAD_BYTES)} each.`
                    : 'Nothing has been shared with you yet.'
              }
              action={
                activeCount > 0 ? (
                  <Button variant="secondary" onClick={clear}>Clear filters</Button>
                ) : allows('file:upload') ? (
                  <Button variant="primary" icon={<Upload size={14} />} onClick={() => inputRef.current?.click()}>
                    Upload a file
                  </Button>
                ) : undefined
              }
            />
          ) : view === 'list' ? (
            <>
              <Card padded={false} className="overflow-hidden">
                <ul className="divide-y divide-[var(--line-subtle)]">
                  {data!.items.map((file) => (
                    <li key={file.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--wash-hover)] sm:px-4">
                      <FileIcon mimeType={file.mimeType} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate-line text-xs font-medium">{file.name}</span>
                        <span className="mt-0.5 block text-2xs text-[var(--ink-faint)]">
                          {bytes(file.sizeBytes)}
                          {file.folder && ` · ${file.folder}`}
                          {` · ${relativeTime(file.createdAt)}`}
                        </span>
                      </span>
                      <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">
                        {titleCase(file.visibility)}
                      </Badge>
                      <span className="hidden w-32 shrink-0 md:block">
                        <UserChip user={file.uploadedBy} />
                      </span>
                      <IconButton
                        label={`Download ${file.name}`}
                        size="sm"
                        onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                      >
                        <Download size={14} />
                      </IconButton>
                      {(file.uploadedBy.id === user?.id || isAdmin) && allows('file:delete') && (
                        <IconButton label={`Delete ${file.name}`} size="sm" onClick={() => setDeleting(file)}>
                          <Trash size={13} />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
              <Pagination
                page={data!.page}
                totalPages={data!.totalPages}
                total={data!.total}
                pageSize={data!.pageSize}
                onPageChange={(next) => setFilter('page', String(next))}
              />
            </>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {data!.items.map((file) => (
                  <Card as="li" key={file.id} interactive className="flex flex-col gap-2">
                    {file.thumbnailUrl ? (
                      <img
                        src={file.thumbnailUrl}
                        alt={file.name}
                        loading="lazy"
                        className="aspect-4/3 w-full rounded-[var(--radius-sm)] bg-[var(--surface-inset)] object-cover"
                      />
                    ) : (
                      <div className="grid aspect-4/3 w-full place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-inset)]">
                        <FileIcon mimeType={file.mimeType} large />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate-line text-xs font-medium">{file.name}</p>
                      <p className="mt-0.5 text-2xs text-[var(--ink-faint)]">{bytes(file.sizeBytes)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant="secondary"
                        fullWidth
                        icon={<Download size={11} />}
                        onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                      >
                        Download
                      </Button>
                      {(file.uploadedBy.id === user?.id || isAdmin) && allows('file:delete') && (
                        <IconButton label={`Delete ${file.name}`} size="xs" onClick={() => setDeleting(file)}>
                          <Trash size={11} />
                        </IconButton>
                      )}
                    </div>
                  </Card>
                ))}
              </ul>
              <Pagination
                page={data!.page}
                totalPages={data!.totalPages}
                total={data!.total}
                pageSize={data!.pageSize}
                onPageChange={(next) => setFilter('page', String(next))}
              />
            </>
          )
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete ${deleting?.name ?? ''}?`}
        message="Anywhere this file is attached will lose it. This cannot be undone."
        loading={remove.isPending}
      />
    </Page>
  );
}

/** Extension-derived glyph, so file kinds are distinguishable at a glance. */
function FileIcon({ mimeType, large = false }: { mimeType: string; large?: boolean }) {
  const kind = mimeType.startsWith('image/')
    ? { label: 'IMG', color: 'var(--series-3)' }
    : mimeType === 'application/pdf'
      ? { label: 'PDF', color: 'var(--status-critical)' }
      : mimeType === 'application/zip'
        ? { label: 'ZIP', color: 'var(--series-4)' }
        : mimeType.includes('spreadsheet') || mimeType === 'text/csv'
          ? { label: 'CSV', color: 'var(--status-good)' }
          : mimeType.includes('wordprocessing')
            ? { label: 'DOC', color: 'var(--series-1)' }
            : mimeType.startsWith('text/')
              ? { label: 'TXT', color: 'var(--ink-muted)' }
              : { label: 'FILE', color: 'var(--ink-faint)' };

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-[var(--radius-sm)] font-mono font-bold text-white',
        large ? 'size-12 text-xs' : 'size-8 text-[9px]',
      )}
      style={{ background: kind.color }}
    >
      {kind.label}
    </span>
  );
}
