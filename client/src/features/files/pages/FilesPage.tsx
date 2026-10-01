import { AxiosError } from 'axios'
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileBreadcrumbs } from '@/features/files/components/FileBreadcrumbs'
import { FileCard } from '@/features/files/components/FileCard'
import { FileDetailsSheet } from '@/features/files/components/FileDetailsSheet'
import { FileRow } from '@/features/files/components/FileRow'
import { FolderTree } from '@/features/files/components/FolderTree'
import { MoveDialog } from '@/features/files/components/MoveDialog'
import { NodeFormDialog } from '@/features/files/components/NodeFormDialog'
import { StorageBreakdown } from '@/features/files/components/StorageBreakdown'
import { DropOverlay, UploadZone } from '@/features/files/components/UploadZone'
import { categoryMeta, scopeLabels, sortLabels } from '@/features/files/lib/file-meta'
import { fileApi } from '@/services/file.service'
import { projectApi } from '@/services/project.service'
import { userApi } from '@/services/user.service'
import type { User } from '@/types/auth'
import {
  FILE_FILTER_CATEGORIES,
  FILE_SCOPES,
  FILE_SORTS,
  type FileBreadcrumb,
  type FileCategory,
  type FileNode,
  type FileScope,
  type FileSort,
  type FileSummary,
  type FileTreeNode,
  type Pagination,
} from '@/types/file'
import type { Project } from '@/types/project'

const ALL = '__all__'
const PAGE_SIZE = 24

export default function FilesPage() {
  // The open folder lives in the URL, so a folder can be linked to and the
  // back button walks back out of the tree.
  const [searchParams, setSearchParams] = useSearchParams()
  const folderId = searchParams.get('folder')

  const [items, setItems] = useState<FileNode[]>([])
  const [breadcrumb, setBreadcrumb] = useState<FileBreadcrumb[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [summary, setSummary] = useState<FileSummary | null>(null)
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [rootFileCount, setRootFileCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const [scope, setScope] = useState<FileScope>('folder')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<FileCategory | typeof ALL>(ALL)
  const [sort, setSort] = useState<FileSort>('name')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // Only the dialogs need these, so they load once alongside the first listing.
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FileNode | undefined>(undefined)
  const [moveTarget, setMoveTarget] = useState<FileNode | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [detailsNode, setDetailsNode] = useState<FileNode | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const load = useCallback(() => {
    setIsLoading(true)
    fileApi
      .list({
        page,
        limit: PAGE_SIZE,
        scope,
        folder: scope === 'folder' && folderId ? folderId : undefined,
        search: search || undefined,
        category: category === ALL ? undefined : category,
        sort,
      })
      .then(({ data }) => {
        setItems(data.items)
        setBreadcrumb(data.breadcrumb)
        setPagination(data.pagination)
      })
      .catch((error: unknown) => {
        const fallback = 'Unable to load the file library'
        toast.error(
          error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
        )
      })
      .finally(() => setIsLoading(false))
  }, [page, scope, folderId, search, category, sort])

  useEffect(load, [load])

  const loadAside = useCallback(() => {
    fileApi
      .summary()
      .then(({ data }) => setSummary(data.summary))
      .catch(() => setSummary(null))
    fileApi
      .tree()
      .then(({ data }) => {
        setTree(data.tree)
        setRootFileCount(data.rootFileCount)
      })
      .catch(() => setTree([]))
  }, [])

  useEffect(loadAside, [loadAside])

  useEffect(() => {
    projectApi
      .list({ limit: 100 })
      .then(({ data }) => setProjects(data.projects))
      .catch(() => setProjects([]))
    userApi
      .list({ limit: 100, status: 'active' })
      .then(({ data }) => setUsers(data.users))
      .catch(() => setUsers([]))
  }, [])

  /** Everything the listing, the tree and the tiles derive from, after a change. */
  const refresh = useCallback(() => {
    load()
    loadAside()
  }, [load, loadAside])

  const openFolder = useCallback(
    (id: string | null) => {
      setPage(1)
      setScope('folder')
      setSearch('')
      setSearchParams(id ? { folder: id } : {}, { replace: false })
    },
    [setSearchParams]
  )

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  const onOpen = useCallback(
    (node: FileNode) => {
      if (node.kind === 'FOLDER' && !node.isTrashed) {
        openFolder(node.id)
        return
      }
      setDetailsNode(node)
      setDetailsOpen(true)
    },
    [openFolder]
  )

  const handlers = useMemo(
    () => ({
      onDetails: (node: FileNode) => {
        setDetailsNode(node)
        setDetailsOpen(true)
      },
      onRename: (node: FileNode) => {
        setEditing(node)
        setFormOpen(true)
      },
      onMove: (node: FileNode) => {
        setMoveTarget(node)
        setMoveOpen(true)
      },
      onStar: (node: FileNode) => {
        fileApi
          .star(node.id)
          .then(({ message }) => {
            toast.success(message)
            refresh()
          })
          .catch(() => toast.error('Unable to update the star'))
      },
      onTrash: (node: FileNode) => {
        const warning =
          node.kind === 'FOLDER'
            ? `Move "${node.name}" and everything inside it to the trash?`
            : `Move "${node.name}" to the trash?`
        if (!window.confirm(warning)) return

        fileApi
          .trash(node.id)
          .then(({ message }) => {
            toast.success(message)
            refresh()
          })
          .catch(() => toast.error('Unable to move this to the trash'))
      },
      onRestore: (node: FileNode) => {
        fileApi
          .restore(node.id)
          .then(({ message }) => {
            toast.success(message)
            refresh()
          })
          .catch(() => toast.error('Unable to restore this item'))
      },
      onDelete: (node: FileNode) => {
        const warning =
          node.kind === 'FOLDER'
            ? `Permanently delete "${node.name}" and everything inside it? This cannot be undone.`
            : `Permanently delete "${node.name}"? This cannot be undone.`
        if (!window.confirm(warning)) return

        fileApi
          .remove(node.id)
          .then(({ message }) => {
            toast.success(message)
            refresh()
          })
          .catch(() => toast.error('Unable to delete this item'))
      },
    }),
    [refresh]
  )

  const onEmptyTrash = () => {
    if (!window.confirm('Permanently delete everything in the trash? This cannot be undone.')) {
      return
    }

    fileApi
      .emptyTrash()
      .then(({ data, message }) => {
        toast.success(data.deleted ? message : 'The trash is already empty')
        refresh()
      })
      .catch(() => toast.error('Unable to empty the trash'))
  }

  const currentFolderName = breadcrumb.at(-1)?.name ?? 'Library'
  const isBrowsing = scope === 'folder'
  const canUploadHere = isBrowsing && !search

  // Any change of view replays the shared tab motion, matching route changes.
  const viewKey = `${scope}-${folderId ?? 'root'}-${category}-${sort}-${search}-${page}-${view}`

  return (
    <div
      className="flex flex-col gap-6"
      onDragOver={(event) => {
        if (!canUploadHere) return
        event.preventDefault()
        setIsDraggingOver(true)
      }}
      onDragLeave={(event) => {
        // Only the drag actually leaving the panel should clear the overlay,
        // not one crossing between the cards inside it.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setIsDraggingOver(false)
      }}
      onDrop={() => setIsDraggingOver(false)}
    >
      <DropOverlay
        visible={isDraggingOver && canUploadHere}
        onDismiss={() => setIsDraggingOver(false)}
      />

      <PageHeader
        title="Files"
        description="The shared library — documents, assets and everything the team hands around"
        action={
          <div className="flex gap-2">
            {scope === 'trash' ? (
              <Button variant="outline" onClick={onEmptyTrash} disabled={!summary?.trashed}>
                <Trash2 />
                Empty trash
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(undefined)
                  setFormOpen(true)
                }}
              >
                <FolderPlus />
                New folder
              </Button>
            )}
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Files" value={summary.files} />
          <StatTile label="Folders" value={summary.folders} />
          <StatTile label="Starred" value={summary.starred} />
          <StatTile label="Added this week" value={summary.uploadedThisWeek} />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={scope}
          onValueChange={(value) => {
            setPage(1)
            setScope(value as FileScope)
          }}
        >
          <TabsList>
            {FILE_SCOPES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {scopeLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search the whole library by name, note or tag..."
            className="pl-8"
            onChange={(event) => debouncedSetSearch(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={category}
            onValueChange={(value) => {
              setPage(1)
              setCategory(value as FileCategory | typeof ALL)
            }}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {FILE_FILTER_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {categoryMeta[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => setSort(value as FileSort)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {FILE_SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {sortLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs value={view} onValueChange={(value) => setView(value as 'grid' | 'list')}>
            <TabsList>
              <TabsTrigger value="grid" aria-label="Grid view">
                <LayoutGrid className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="list" aria-label="List view">
                <List className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden flex-col gap-4 xl:flex">
          <FolderTree
            tree={tree}
            rootFileCount={rootFileCount}
            activeId={isBrowsing ? folderId : null}
            onSelect={openFolder}
          />
          {summary && <StorageBreakdown summary={summary} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {isBrowsing && !search && (
            <FileBreadcrumbs trail={breadcrumb} onNavigate={openFolder} />
          )}

          {canUploadHere && (
            <UploadZone
              folderId={folderId}
              folderName={currentFolderName}
              onUploaded={refresh}
            />
          )}

          {isLoading ? (
            <div
              className={
                view === 'grid'
                  ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4'
                  : 'flex flex-col gap-2'
              }
            >
              {Array.from({ length: view === 'grid' ? 8 : 6 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className={view === 'grid' ? 'h-48 rounded-2xl' : 'h-14 rounded-xl'}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card variant="elevated">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="glass-tile flex size-12 items-center justify-center rounded-full">
                  <FolderOpen className="text-muted-foreground size-6" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {scope === 'trash' ? 'The trash is empty' : 'Nothing here yet'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {search || category !== ALL
                      ? 'Try clearing the filters to see everything.'
                      : scope === 'trash'
                        ? 'Items you delete land here first, so they can be restored.'
                        : scope === 'starred'
                          ? 'Star the things you keep coming back to and they will show up here.'
                          : 'Drop files above, or create a folder to organise them.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : view === 'grid' ? (
            <div
              key={viewKey}
              className="animate-tab-enter grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4"
            >
              {items.map((node) => (
                <FileCard key={node.id} node={node} onOpen={onOpen} {...handlers} />
              ))}
            </div>
          ) : (
            <div key={viewKey} className="animate-tab-enter flex flex-col gap-1">
              {items.map((node) => (
                <FileRow key={node.id} node={node} onOpen={onOpen} {...handlers} />
              ))}
            </div>
          )}

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </div>

      <NodeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        node={editing}
        parentId={isBrowsing ? folderId : null}
        projects={projects}
        onSaved={refresh}
      />

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        node={moveTarget}
        tree={tree}
        onMoved={refresh}
      />

      <FileDetailsSheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        node={detailsNode}
        users={users}
        onChanged={(node) => {
          setDetailsNode(node)
          refresh()
        }}
      />
    </div>
  )
}
