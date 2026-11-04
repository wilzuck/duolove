import { Injectable, Module } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getEnv } from '../config/env.js';
import { badRequest } from '../common/errors.js';

const KEY_RE = /^[a-z0-9][a-z0-9/_-]*\.webp$/i;

/**
 * Pilote de stockage local (dev/CI). L'interface (put/get/delete) est volontairement minimale
 * pour brancher un pilote S3 compatible (R2, MinIO, S3) sans toucher aux appelants — voir docs/ARCHITECTURE.md.
 */
@Injectable()
export class StorageService {
  private readonly root = path.resolve(getEnv().UPLOAD_DIR);

  private resolve(key: string) {
    if (!KEY_RE.test(key) || key.includes('..')) throw badRequest('INVALID_KEY');
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null; // Silence assumé : un fichier absent se traduit par un 404 chez l'appelant.
    }
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

export const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'];

/**
 * Validation + assainissement des images : le format réel est lu par le décodeur (pas l'en-tête MIME),
 * l'orientation EXIF est appliquée puis TOUTES les métadonnées (GPS inclus) sont supprimées par la ré-encodage WebP.
 */
@Injectable()
export class ImagesService {
  async process(input: Buffer): Promise<ProcessedImage> {
    let format: string | undefined;
    try {
      format = (await sharp(input, { limitInputPixels: 50_000_000 }).metadata()).format;
    } catch {
      throw badRequest('INVALID_IMAGE', 'Fichier image illisible');
    }
    if (!format || !ALLOWED_IMAGE_FORMATS.includes(format)) throw badRequest('UNSUPPORTED_IMAGE_FORMAT', 'Formats acceptés : JPEG, PNG, WebP');
    const base = () => sharp(input, { limitInputPixels: 50_000_000 }).rotate();
    const { data: full, info } = await base()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base().resize({ width: 480, height: 600, fit: 'cover' }).webp({ quality: 75 }).toBuffer();
    return { full, thumb, width: info.width, height: info.height };
  }
}

@Module({ providers: [StorageService, ImagesService], exports: [StorageService, ImagesService] })
export class StorageModule {}
