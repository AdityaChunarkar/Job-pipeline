import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './errors.js';

const PDF_MAGIC = Buffer.from('%PDF-');

/** Validates extension, declared MIME type and the PDF file signature. */
export function assertValidPdf(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) throw new HttpError(400, 'A PDF resume is required', 'RESUME_REQUIRED');
  const extOk = path.extname(file.originalname).toLowerCase() === '.pdf';
  const mimeOk = file.mimetype === 'application/pdf';
  const sigOk = file.buffer.length > PDF_MAGIC.length && file.buffer.subarray(0, 5).equals(PDF_MAGIC);
  if (!extOk || !mimeOk || !sigOk) {
    throw new HttpError(415, 'Resume must be a valid PDF file', 'INVALID_FILE_TYPE');
  }
}

/** Stores the buffer under a random server-generated name; the client name is never used on disk. */
export async function saveResume(buffer: Buffer): Promise<string> {
  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.pdf`;
  await fs.writeFile(path.join(config.UPLOAD_DIR, name), buffer, { flag: 'wx', mode: 0o600 });
  return name;
}

const SAFE_NAME = /^[0-9a-f-]{36}\.pdf$/;

/** Resolves a stored name to a path, refusing anything that could escape the upload dir. */
export function resumePath(stored: string): string {
  const notFound = new HttpError(404, 'Resume file not found', 'RESUME_NOT_FOUND');
  if (!SAFE_NAME.test(stored)) throw notFound;
  const full = path.resolve(config.UPLOAD_DIR, stored);
  if (path.dirname(full) !== config.UPLOAD_DIR) throw notFound;
  return full;
}

export async function deleteResume(stored: string) {
  await fs.rm(resumePath(stored), { force: true });
}
