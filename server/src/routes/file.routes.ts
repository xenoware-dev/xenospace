import { Router } from 'express'

import * as fileController from '@/controllers/file.controller'
import { protect } from '@/middleware/auth.middleware'
import { verifyOrigin } from '@/middleware/csrf.middleware'
import { uploadFiles } from '@/middleware/upload.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  createFolderSchema,
  downloadFileSchema,
  fileIdSchema,
  listFilesQuerySchema,
  moveFileSchema,
  updateFileSchema,
  uploadFilesSchema,
} from '@/validators/file.validator'

const router = Router()

router.use(protect)
// A multipart upload is reachable from a cross-site form without a preflight,
// so every write here is checked against the app's own origin.
router.use(verifyOrigin)

// The fixed segments come first, so neither is read as an id by /:id.
router.get('/', validate(listFilesQuerySchema), fileController.listFiles)
router.get('/tree', fileController.getFileTree)
router.get('/summary', fileController.getFileSummary)

router.post('/folders', validate(createFolderSchema), fileController.createFolder)
// The multipart body is parsed before it is validated, since the metadata
// fields only exist once multer has read the stream.
router.post('/upload', uploadFiles, validate(uploadFilesSchema), fileController.uploadFileNodes)
router.post('/trash/empty', fileController.emptyTrash)

router.get('/:id', validate(fileIdSchema), fileController.getFile)
router.get('/:id/download', validate(downloadFileSchema), fileController.downloadFile)

router.patch('/:id', validate(updateFileSchema), fileController.updateFile)
router.patch('/:id/move', validate(moveFileSchema), fileController.moveFile)

router.post('/:id/star', validate(fileIdSchema), fileController.starFile)
router.post('/:id/trash', validate(fileIdSchema), fileController.trashFile)
router.post('/:id/restore', validate(fileIdSchema), fileController.restoreFile)

router.delete('/:id', validate(fileIdSchema), fileController.deleteFile)

export default router
