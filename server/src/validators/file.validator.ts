import { z } from 'zod'

import { FILE_CATEGORIES, FILE_VISIBILITIES } from '@/types/enums'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

/** `null` and `'root'` both mean the top of the library. */
const parentId = z.union([objectId, z.literal('root'), z.null()]).optional()

const name = z.string().trim().min(1, 'A name is required').max(255)
const tags = z.array(z.string().trim().min(1).max(30)).max(20)

export const listFilesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    folder: z.union([objectId, z.literal('root')]).optional(),
    scope: z.enum(['folder', 'mine', 'shared', 'starred', 'recent', 'trash']).default('folder'),
    search: z.string().trim().max(100).optional(),
    category: z.enum(FILE_CATEGORIES).optional(),
    project: objectId.optional(),
    sort: z.enum(['name', 'recent', 'size', 'kind']).default('name'),
  }),
})

export const fileIdSchema = z.object({
  params: z.object({ id: objectId }),
})

export const downloadFileSchema = z.object({
  params: z.object({ id: objectId }),
  query: z.object({
    /** `inline` renders in the browser; anything else saves to disk. */
    disposition: z.enum(['inline', 'attachment']).default('attachment'),
  }),
})

export const createFolderSchema = z.object({
  body: z.object({
    name,
    parent: parentId,
    description: z.string().trim().max(1000).optional(),
    tags: tags.optional(),
    visibility: z.enum(FILE_VISIBILITIES).optional(),
    project: objectId.nullable().optional(),
    sharedWith: z.array(objectId).max(100).optional(),
  }),
})

/**
 * Multipart fields all arrive as strings, so the metadata that rides along with
 * an upload is coerced here rather than in the controller. `tags` comes over as
 * a comma-separated list, which is how a form field can carry one.
 */
export const uploadFilesSchema = z.object({
  body: z.object({
    parent: z.union([objectId, z.literal('root'), z.literal('')]).optional(),
    description: z.string().trim().max(1000).optional(),
    tags: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 20)
          : undefined
      ),
    visibility: z.enum(FILE_VISIBILITIES).optional(),
    project: z.union([objectId, z.literal('')]).optional(),
  }),
})

export const updateFileSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: name.optional(),
      description: z.string().trim().max(1000).optional(),
      tags: tags.optional(),
      visibility: z.enum(FILE_VISIBILITIES).optional(),
      project: objectId.nullable().optional(),
      sharedWith: z.array(objectId).max(100).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'Nothing to update'),
})

export const moveFileSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ parent: z.union([objectId, z.literal('root'), z.null()]) }),
})
