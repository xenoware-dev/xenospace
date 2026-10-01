import { AxiosError } from 'axios'
import { Loader2, UploadCloud, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/features/files/lib/file-meta'
import { cn } from '@/lib/utils'
import { fileApi } from '@/services/file.service'
import type { FileNode } from '@/types/file'

interface UploadZoneProps {
  /** Where the files land. Null is the root of the library. */
  folderId: string | null
  folderName: string
  onUploaded: (nodes: FileNode[]) => void
  /** Hidden while the trash or a read-only scope is open. */
  disabled?: boolean
}

/**
 * Drag-and-drop plus a file picker, with the real upload progress underneath.
 * Dropping anywhere on the panel is handled by the page; this is the explicit
 * target, which is what people look for the first time.
 */
export function UploadZone({ folderId, folderName, onUploaded, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<File[]>([])
  const [percent, setPercent] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const upload = useCallback(
    (files: File[]) => {
      if (!files.length) return

      setQueue(files)
      setPercent(0)
      setIsUploading(true)

      fileApi
        .upload({ files, parent: folderId }, setPercent)
        .then(({ data, message }) => {
          toast.success(message)
          onUploaded(data.nodes)
        })
        .catch((error: unknown) => {
          const fallback = 'Upload failed'
          toast.error(
            error instanceof AxiosError
              ? (error.response?.data?.message ?? fallback)
              : fallback
          )
        })
        .finally(() => {
          setIsUploading(false)
          setQueue([])
          setPercent(0)
          if (inputRef.current) inputRef.current.value = ''
        })
    },
    [folderId, onUploaded]
  )

  if (disabled) return null

  const totalSize = queue.reduce((sum, file) => sum + file.size, 0)

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        upload(Array.from(event.dataTransfer.files))
      }}
      className={cn(
        'glass-control flex flex-col gap-3 rounded-2xl border-dashed p-4 text-center',
        'transition-[background-color,border-color,transform] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
        isDragging && 'border-ring bg-glass-tile scale-[1.01]'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => upload(Array.from(event.target.files ?? []))}
      />

      {isUploading ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>
              Uploading {queue.length} {queue.length === 1 ? 'file' : 'files'} ·{' '}
              {formatBytes(totalSize)}
            </span>
          </div>
          <Progress value={percent} aria-label="Upload progress" />
          <p className="text-muted-foreground text-xs tabular-nums">{percent}%</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="glass-tile flex size-10 items-center justify-center rounded-full">
            <UploadCloud className="text-muted-foreground size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">Drop files to upload</p>
            <p className="text-muted-foreground text-xs">
              They land in <span className="text-foreground">{folderName}</span> and inherit its
              visibility
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The page-wide drop target. Dragging a file anywhere over the library uploads
 * it, which is how a desktop file manager behaves; the overlay is what tells
 * people the drop will be caught.
 */
export function DropOverlay({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  if (!visible) return null

  return (
    <div className="glass-overlay animate-tab-enter pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-3xl">
      <div className="flex flex-col items-center gap-2">
        <UploadCloud className="size-8" aria-hidden />
        <p className="text-sm font-medium">Drop to upload to this folder</p>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-events-auto"
          onClick={onDismiss}
        >
          <X className="size-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  )
}
