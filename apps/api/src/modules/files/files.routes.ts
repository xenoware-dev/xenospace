import { Router } from 'express';
import { createReadStream } from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, fileListQuery, fileMetaSchema } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, query as validQuery } from '../../middleware/validate.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { created, noContent, ok } from '../../lib/http.js';
import { tooLarge, unsupportedMedia } from '../../lib/errors.js';
import * as service from './files.service.js';

export const filesRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

/**
 * Upload handling.
 *
 * Memory storage keeps an unvalidated file off disk entirely until the MIME
 * type and size have been accepted, so a rejected upload leaves nothing behind.
 * The limits here are the hard boundary; the service re-checks them because a
 * multipart `Content-Length` is attacker-controlled.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    // Bounds the non-file parts, which multer would otherwise buffer freely.
    fields: 10,
    fieldSize: 8 * 1024,
    parts: 12,
  },
  fileFilter(_req, file, callback) {
    if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(file.mimetype)) {
      callback(unsupportedMedia(`Files of type ${file.mimetype} are not allowed.`));
      return;
    }
    callback(null, true);
  },
});

filesRouter.use(authenticate);

filesRouter.get(
  '/',
  requirePermission('file:read'),
  validate({ query: fileListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listFiles(principal(req), validQuery(req, fileListQuery)));
  }),
);

filesRouter.get(
  '/folders',
  requirePermission('file:read'),
  validate({ query: z.object({ projectId: z.string().uuid().optional() }) }),
  asyncRoute(async (req, res) => {
    const { projectId } = validQuery(req, z.object({ projectId: z.string().uuid().optional() }));
    ok(res, await service.folders(principal(req), projectId));
  }),
);

filesRouter.post(
  '/',
  uploadLimiter,
  requirePermission('file:upload'),
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) throw unsupportedMedia('Attach a file under the "file" field.');
    if (file.size > MAX_UPLOAD_BYTES) throw tooLarge('That file is larger than 25 MB.');

    // Multipart text fields arrive as strings, so they are parsed separately
    // from the file itself rather than through the body middleware.
    const meta = fileMetaSchema.parse({
      projectId: req.body?.projectId || undefined,
      folder: req.body?.folder || undefined,
      description: req.body?.description || undefined,
      visibility: req.body?.visibility || undefined,
    });

    const stored = await service.storeFile(principal(req), {
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      buffer: file.buffer,
      projectId: meta.projectId ?? null,
      folder: meta.folder,
      description: meta.description,
      visibility: meta.visibility,
    });
    created(res, stored, `/api/v1/files/${stored.id}`);
  }),
);

filesRouter.get(
  '/:id',
  requirePermission('file:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getFile(principal(req), (req.params as { id: string }).id));
  }),
);

filesRouter.get(
  '/:id/download',
  requirePermission('file:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    const { file, localPath, signedUrl } = await service.readFile(
      principal(req),
      (req.params as { id: string }).id,
    );

    if (signedUrl) {
      res.redirect(302, signedUrl);
      return;
    }

    /*
     * Uploaded content is served defensively. `Content-Disposition: attachment`
     * plus `nosniff` stops an uploaded SVG or HTML file from executing in the
     * origin, which would otherwise be a stored-XSS vector against the app.
     */
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Length', String(file.sizeBytes));

    /*
     * Streamed directly rather than via res.sendFile. `sendFile` delegates to
     * `send`, which applies its own path policy — and with `dotfiles: 'ignore'`
     * it refuses any path containing a dot-prefixed segment, which the default
     * uploads directory has. Streaming also keeps these headers authoritative
     * instead of letting `send` negotiate its own.
     */
    await new Promise<void>((settle, fail) => {
      const stream = createReadStream(localPath!);
      stream.on('error', fail);
      res.on('close', () => stream.destroy());
      stream.pipe(res).on('finish', () => settle()).on('error', fail);
    });
  }),
);

filesRouter.delete(
  '/:id',
  requirePermission('file:delete'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    await service.deleteFile(principal(req), (req.params as { id: string }).id);
    noContent(res);
  }),
);
