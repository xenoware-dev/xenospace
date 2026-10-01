import type { Request, Response } from 'express'

import { storageKeyOf } from '@/middleware/upload.middleware'
import { fileService, type FileScope, type FileSort } from '@/services/file.service'
import type { FileCategory, FileVisibility, Role } from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'
import { absolutePathFor } from '@/utils/storage'

function actorOf(req: Request) {
  return { id: String(req.user!._id), role: req.user!.role as Role }
}

/** `root` and `''` both stand for the top of the library, which stores as null. */
function folderIdOf(value: string | null | undefined) {
  return !value || value === 'root' ? null : value
}

export const listFiles = catchAsync(async (req: Request, res: Response) => {
  // validate() writes its parsed output back onto req.body only, so query
  // values still arrive as strings here and are coerced by hand.
  const query = req.query as Record<string, string | undefined>

  const result = await fileService.list(
    {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 24,
      folder: folderIdOf(query.folder),
      scope: (query.scope as FileScope) || 'folder',
      search: query.search,
      category: query.category as FileCategory | undefined,
      project: query.project,
      sort: (query.sort as FileSort) || 'name',
    },
    actorOf(req)
  )

  ApiResponse.send(res, 200, 'Files', result)
})

export const getFileTree = catchAsync(async (req: Request, res: Response) => {
  const result = await fileService.tree(actorOf(req))
  ApiResponse.send(res, 200, 'Folder tree', result)
})

export const getFileSummary = catchAsync(async (req: Request, res: Response) => {
  const summary = await fileService.summary(actorOf(req))
  ApiResponse.send(res, 200, 'Library summary', { summary })
})

export const getFile = catchAsync(async (req: Request, res: Response) => {
  const result = await fileService.getById(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'File', result)
})

export const downloadFile = catchAsync(async (req: Request, res: Response) => {
  const file = await fileService.getDownload(String(req.params.id), actorOf(req))
  const inline = req.query.disposition === 'inline'

  res.type(file.mimeType)
  res.setHeader('Content-Length', String(file.size))
  // A stored blob is only ever reachable through this authenticated route, so
  // nothing downstream should keep a shared copy of it.
  res.setHeader('Cache-Control', 'private, max-age=0, no-store')

  if (inline) {
    // Inline rendering of attacker-supplied markup would run on our origin.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'")
    res.setHeader('Content-Disposition', 'inline')
    res.sendFile(absolutePathFor(file.storageKey))
    return
  }

  res.download(absolutePathFor(file.storageKey), file.name)
})

export const createFolder = catchAsync(async (req: Request, res: Response) => {
  const folder = await fileService.createFolder(req.body, actorOf(req))
  ApiResponse.send(res, 201, 'Folder created', { node: folder })
})

export const uploadFileNodes = catchAsync(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (!files.length) {
    throw ApiError.badRequest('Choose at least one file to upload')
  }

  const body = req.body as {
    parent?: string
    description?: string
    tags?: string[]
    visibility?: FileVisibility
    project?: string
  }

  const nodes = await fileService.upload(
    files.map((file) => ({
      originalName: file.originalname,
      storageKey: storageKeyOf(file),
      mimeType: file.mimetype,
      size: file.size,
    })),
    {
      parent: folderIdOf(body.parent),
      description: body.description,
      tags: body.tags,
      visibility: body.visibility,
      project: body.project || undefined,
    },
    actorOf(req)
  )

  ApiResponse.send(res, 201, `${nodes.length} file${nodes.length === 1 ? '' : 's'} uploaded`, {
    nodes,
  })
})

export const updateFile = catchAsync(async (req: Request, res: Response) => {
  const node = await fileService.update(String(req.params.id), req.body, actorOf(req))
  ApiResponse.send(res, 200, 'Changes saved', { node })
})

export const moveFile = catchAsync(async (req: Request, res: Response) => {
  const node = await fileService.move(
    String(req.params.id),
    folderIdOf(req.body.parent as string | null),
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Moved', { node })
})

export const starFile = catchAsync(async (req: Request, res: Response) => {
  const node = await fileService.toggleStar(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, node.isStarred ? 'Added to starred' : 'Removed from starred', { node })
})

export const trashFile = catchAsync(async (req: Request, res: Response) => {
  const node = await fileService.trash(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Moved to trash', { node })
})

export const restoreFile = catchAsync(async (req: Request, res: Response) => {
  const node = await fileService.restore(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Restored', { node })
})

export const deleteFile = catchAsync(async (req: Request, res: Response) => {
  const result = await fileService.remove(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Deleted permanently', result)
})

export const emptyTrash = catchAsync(async (req: Request, res: Response) => {
  const result = await fileService.emptyTrash(actorOf(req))
  ApiResponse.send(res, 200, 'Trash emptied', result)
})
