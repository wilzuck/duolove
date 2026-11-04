import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { badRequest } from './errors.js';

/** Valide et transforme l'entrée avec un schéma Zod partagé avec le frontend (@duomatch/types). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw badRequest(
        'VALIDATION_ERROR',
        'Données invalides',
        r.error.issues.map((i) => ({ path: i.path.join('.'), code: i.message })),
      );
    }
    return r.data;
  }
}
export const zod = <T>(schema: ZodType<T>) => new ZodPipe(schema);
