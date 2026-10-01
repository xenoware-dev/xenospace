import { AxiosError } from 'axios'
import { Download, Star, StarOff, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { FileThumb } from '@/features/files/components/FileThumb'
import {
  categoryMeta,
  formatBytes,
  formatFileDate,
  visibilityMeta,
} from '@/features/files/lib/file-meta'
import { getInitials } from '@/lib/format'
import { fileApi } from '@/services/file.service'
import type { User } from '@/types/auth'
import type { FileNode } from '@/types/file'

interface FileDetailsSheetProps {
  node: FileNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** People who can be added to a private item. */
  users: User[]
  onChanged: (node: FileNode) => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}

/** A preview the browser can render itself, for the types that allow it. */
function Preview({ node }: { node: FileNode }) {
  const src = fileApi.previewUrl(node.id)

  if (node.category === 'IMAGE') {
    return (
      <img
        src={src}
        alt={node.name}
        className="glass-tile max-h-64 w-full rounded-2xl object-contain"
      />
    )
  }
  if (node.category === 'VIDEO') {
    return <video src={src} controls className="glass-tile max-h-64 w-full rounded-2xl" />
  }
  if (node.category === 'AUDIO') {
    return <audio src={src} controls className="w-full" />
  }
  if (node.category === 'PDF') {
    return (
      <iframe
        src={src}
        title={node.name}
        className="glass-tile h-64 w-full rounded-2xl"
      />
    )
  }

  return <FileThumb node={node} size="tile" className="h-32" />
}

export function FileDetailsSheet({
  node,
  open,
  onOpenChange,
  users,
  onChanged,
}: FileDetailsSheetProps) {
  const [isSaving, setIsSaving] = useState(false)

  if (!node) return null

  const visibility = visibilityMeta[node.visibility]
  const sharedIds = new Set(node.sharedWith.map((user) => user.id))
  const candidates = users.filter(
    (user) => !sharedIds.has(user.id) && user.id !== node.owner?.id
  )

  const run = async (action: () => Promise<{ data: { node: FileNode }; message: string }>) => {
    setIsSaving(true)
    try {
      const { data, message } = await action()
      toast.success(message)
      onChanged(data.node)
    } catch (error: unknown) {
      const fallback = 'Unable to update this item'
      toast.error(
        error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
      )
    } finally {
      setIsSaving(false)
    }
  }

  const setSharedWith = (ids: string[]) =>
    run(() => fileApi.update(node.id, { sharedWith: ids }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="glass-overlay w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="truncate">{node.name}</SheetTitle>
          <SheetDescription>
            {node.kind === 'FOLDER' ? 'Folder' : categoryMeta[node.category].label}
            {node.kind === 'FILE' && ` · ${formatBytes(node.size)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="scrollbar-slim flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          {node.kind === 'FILE' && <Preview node={node} />}

          <div className="flex gap-2">
            {node.kind === 'FILE' && (
              <Button variant="outline" size="sm" asChild className="flex-1">
                <a href={fileApi.downloadUrl(node.id)} download>
                  <Download />
                  Download
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isSaving}
              onClick={() => run(() => fileApi.star(node.id))}
            >
              {node.isStarred ? <StarOff /> : <Star />}
              {node.isStarred ? 'Unstar' : 'Star'}
            </Button>
          </div>

          {node.description && (
            <p className="text-muted-foreground text-sm">{node.description}</p>
          )}

          {node.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {node.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-2.5">
            <Row label="Visibility">
              <Badge variant={visibility.variant}>{visibility.label}</Badge>
            </Row>
            {node.project && (
              <Row label="Project">
                {node.project.key} · {node.project.name}
              </Row>
            )}
            <Row label="Owner">{node.owner?.name ?? 'Unknown'}</Row>
            {node.kind === 'FILE' && (
              <>
                <Row label="Type">{node.mimeType ?? categoryMeta[node.category].label}</Row>
                <Row label="Downloads">{node.downloadCount}</Row>
              </>
            )}
            <Row label="Added">{formatFileDate(node.createdAt)}</Row>
            <Row label="Updated">{formatFileDate(node.updatedAt)}</Row>
            {node.isTrashed && node.trashedAt && (
              <Row label="Trashed">{formatFileDate(node.trashedAt)}</Row>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Shared with</p>
            {node.sharedWith.length === 0 && (
              <p className="text-muted-foreground text-xs">
                {node.visibility === 'TEAM'
                  ? 'Everyone in the workspace can already see this.'
                  : 'Nobody beyond the owner yet.'}
              </p>
            )}

            {node.sharedWith.map((user) => (
              <div key={user.id} className="flex items-center gap-2">
                <Avatar className="size-7">
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                  <AvatarFallback className="text-[10px]">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">{user.name}</span>
                {node.canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={isSaving}
                    aria-label={`Stop sharing with ${user.name}`}
                    onClick={() =>
                      setSharedWith(
                        node.sharedWith.filter((other) => other.id !== user.id).map((o) => o.id)
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {node.canManage && candidates.length > 0 && (
              <Select
                value=""
                disabled={isSaving}
                onValueChange={(userId) =>
                  setSharedWith([...node.sharedWith.map((user) => user.id), userId])
                }
              >
                <SelectTrigger className="mt-1">
                  <span className="text-muted-foreground flex items-center gap-2 text-sm">
                    <UserPlus className="size-3.5" />
                    <SelectValue placeholder="Share with someone" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
