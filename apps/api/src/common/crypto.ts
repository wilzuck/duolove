import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config/env.js';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hashIp = (ip: string | undefined) =>
  ip ? createHmac('sha256', getEnv().IP_HASH_SALT).update(ip).digest('hex').slice(0, 32) : null;

export function hmacHex(secret: string, payload: string | Buffer) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
export function safeEqualStr(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
