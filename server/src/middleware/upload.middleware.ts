import path from 'node:path'

import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

import { env } from '@/config/env'
import { ApiError } from '@/utils/ApiError'
import {
  MAX_UPLOAD_BYTES,
  absolutePathFor,
  buildStorageKey,
  ensureShardFor,
  ensureUploadRoot,
} from '@/utils/storage'

ensureUploadRoot()

/** The generated key multer picked, read back by the service after the upload. */
type KeyedFile = Express.Multer.File & { storageKey?: string }

export function storageKeyOf(file: Express.Multer.File) {
  return (file as KeyedFile).storageKey ?? ''
}

/**
 * Bytes stream straight to disk under a generated key, so a large upload is
 * never held in memory. multer asks for the directory and the basename in two
 * separate calls, so the key is decided in the first and stashed on the file
 * for the second — and for the service, which writes it to the metadata row.
 */
const storage = multer.diskStorage({
  destination(_req, file, cb) {
    try {
      const storageKey = buildStorageKey(file.originalname)
      ;(file as KeyedFile).storageKey = storageKey
      ensureShardFor(storageKey)
      cb(null, path.dirname(absolutePathFor(storageKey)))
    } catch (error) {
      cb(error as Error, '')
    }
  },
  filename(_req, file, cb) {
    cb(null, path.basename(storageKeyOf(file)))
  },
})

const multerUpload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: env.MAX_UPLOAD_FILES,
    // Only the handful of small text fields the upload form sends alongside.
    fields: 20,
  },
})

/**
 * Accepts the `files` field and translates multer's own errors into the API's
 * error shape, so a too-large upload reads like every other 400 rather than
 * surfacing as an unhandled 500.
 */
export function uploadFiles(req: Request, res: Response, next: NextFunction) {
  multerUpload.array('files', env.MAX_UPLOAD_FILES)(req, res, (error: unknown) => {
    if (!error) {
      next()
      return
    }

    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Each file must be ${env.MAX_UPLOAD_MB}MB or smaller`
          : error.code === 'LIMIT_FILE_COUNT'
            ? `Up to ${env.MAX_UPLOAD_FILES} files can be uploaded at once`
            : error.code === 'LIMIT_UNEXPECTED_FILE'
              ? 'Unexpected upload field — send files under "files"'
              : 'Upload failed'

      next(ApiError.badRequest(message))
      return
    }

    next(error)
  })
}
