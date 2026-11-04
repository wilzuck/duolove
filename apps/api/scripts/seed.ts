/**
 * Données de DÉVELOPPEMENT uniquement (refuse de tourner en production).
 * Tous les comptes ont une adresse en @seed.duomatch.test ; mot de passe commun affiché à la fin.
 */
import './../src/bootstrap-env.js';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INTEREST_SLUGS } from '@duomatch/types';
import { PrismaClient, type Gender, type Intent } from '../src/generated/prisma/client.js';

if (process.env.NODE_ENV === 'production') throw new Error('Le seed de développement est interdit en production.');

// Jamais de mot de passe en clair dans le dépôt : variable SEED_PASSWORD, sinon tirage aléatoire (affiché à la fin).
const PASSWORD = process.env.SEED_PASSWORD ?? `${randomBytes(9).toString('base64url')}aA1!`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const root = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

const PEOPLE: Array<[string, Gender, number, string, string, Intent, string[]]> = [
  ['Aminata', 'WOMAN', 27, 'SN', 'Dakar', 'SERIOUS', ['music', 'cooking', 'travel']],
  ['Kofi', 'MAN', 31, 'CI', 'Abidjan', 'MARRIAGE', ['sport', 'faith', 'family']],
  ['Awa', 'WOMAN', 25, 'CI', 'Abidjan', 'DATING', ['dance', 'fashion', 'music']],
  ['Yao', 'MAN', 29, 'TG', 'Lomé', 'SERIOUS', ['tech', 'gaming', 'cinema']],
  ['Mariama', 'WOMAN', 33, 'BJ', 'Cotonou', 'MARRIAGE', ['faith', 'family', 'cooking']],
  ['Ibrahim', 'MAN', 35, 'BJ', 'Cotonou', 'SERIOUS', ['entrepreneurship', 'reading', 'travel']],
  ['Chantal', 'WOMAN', 28, 'CM', 'Douala', 'SERIOUS', ['art', 'photography', 'nature']],
  ['Serge', 'MAN', 30, 'CM', 'Yaoundé', 'DATING', ['music', 'sport', 'cinema']],
  ['Fatou', 'WOMAN', 24, 'SN', 'Dakar', 'FRIENDSHIP', ['reading', 'art', 'dance']],
  ['Koffi', 'MAN', 26, 'TG', 'Lomé', 'SERIOUS', ['tech', 'music', 'travel']],
  ['Adjoa', 'WOMAN', 30, 'TG', 'Lomé', 'SERIOUS', ['cooking', 'nature', 'faith']],
  ['Moussa', 'MAN', 32, 'SN', 'Dakar', 'MARRIAGE', ['family', 'sport', 'faith']],
  ['Nadège', 'WOMAN', 29, 'BJ', 'Porto-Novo', 'DATING', ['fashion', 'photography', 'travel']],
  ['Eric', 'MAN', 28, 'BJ', 'Cotonou', 'SERIOUS', ['gaming', 'cinema', 'tech']],
  ['Grâce', 'WOMAN', 26, 'CM', 'Douala', 'SERIOUS', ['music', 'faith', 'dance']],
  ['Landry', 'MAN', 34, 'CI', 'Abidjan', 'SERIOUS', ['entrepreneurship', 'family', 'reading']],
  ['Sika', 'WOMAN', 31, 'TG', 'Lomé', 'MARRIAGE', ['family', 'cooking', 'reading']],
  ['Mamadou', 'MAN', 27, 'SN', 'Dakar', 'DATING', ['music', 'dance', 'sport']],
  ['Prisca', 'WOMAN', 23, 'BJ', 'Cotonou', 'DATING', ['fashion', 'dance', 'art']],
  ['Hervé', 'MAN', 33, 'CI', 'Abidjan', 'SERIOUS', ['nature', 'travel', 'photography']],
  ['Inès', 'WOMAN', 28, 'FR', 'Paris', 'SERIOUS', ['cinema', 'art', 'travel']],
  ['Thomas', 'MAN', 30, 'FR', 'Paris', 'SERIOUS', ['sport', 'tech', 'cooking']],
  ['Rachelle', 'WOMAN', 27, 'CM', 'Yaoundé', 'SERIOUS', ['reading', 'faith', 'family']],
  ['Dieudonné', 'MAN', 36, 'BJ', 'Cotonou', 'MARRIAGE', ['faith', 'family', 'entrepreneurship']],
];
const HUES = [340, 350, 10, 20, 330, 320, 355, 5];

async function avatar(name: string, i: number) {
  const hue = HUES[i % HUES.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 85% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 80% 45%)"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="420" r="170" fill="rgba(255,255,255,.28)"/><text x="400" y="480" font-family="Helvetica,Arial,sans-serif" font-size="190" font-weight="700" fill="#fff" text-anchor="middle">${name[0]}</text></svg>`;
  const key = `photos/5eed${randomBytes(10).toString('hex')}.webp`;
  await mkdir(path.join(root, 'photos'), { recursive: true });
  await writeFile(path.join(root, key), await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer());
  await writeFile(path.join(root, key.replace('.webp', '_t.webp')), await sharp(Buffer.from(svg)).resize(480, 600).webp({ quality: 75 }).toBuffer());
  return key;
}


// ───────── 100 membres de démonstration variés (déterministes) ─────────
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NAMES_F = ['Adèle', 'Bintou', 'Carine', 'Dalila', 'Estelle', 'Fanta', 'Gisèle', 'Hawa', 'Ida', 'Jocelyne', 'Khadija', 'Léa', 'Mireille', 'Nafi', 'Océane', 'Pélagie', 'Rokia', 'Sandrine', 'Tatiana', 'Ursule', 'Vanessa', 'Yasmine', 'Zita', 'Amélie', 'Brigitte', 'Clarisse', 'Déborah', 'Eugénie', 'Flora', 'Hélène'];
const NAMES_M = ['Abdoul', 'Basile', 'Cédric', 'Désiré', 'Emmanuel', 'Fabrice', 'Gaston', 'Habib', 'Idrissa', 'Jonas', 'Kader', 'Léonce', 'Maxime', 'Nestor', 'Olivier', 'Pascal', 'Quentin', 'Rodrigue', 'Samuel', 'Thierry', 'Ulrich', 'Victor', 'Wilfried', 'Yannick', 'Zacharie', 'Alain', 'Bertrand', 'Constant', 'Didier', 'Éric'];
const PLACES: Array<[string, string]> = [['BJ', 'Cotonou'], ['BJ', 'Porto-Novo'], ['BJ', 'Parakou'], ['CI', 'Abidjan'], ['CI', 'Bouaké'], ['TG', 'Lomé'], ['TG', 'Kara'], ['SN', 'Dakar'], ['SN', 'Thiès'], ['CM', 'Douala'], ['CM', 'Yaoundé'], ['BF', 'Ouagadougou'], ['ML', 'Bamako'], ['GA', 'Libreville'], ['FR', 'Paris'], ['FR', 'Lyon'], ['BE', 'Bruxelles'], ['CA', 'Montréal']];
const INTENTS: Intent[] = ['SERIOUS', 'SERIOUS', 'SERIOUS', 'MARRIAGE', 'MARRIAGE', 'DATING', 'DATING', 'FRIENDSHIP', 'UNSURE'];
const BIOS = [
  'Passionné(e) de {a} et de {b}. Je cherche quelqu’un de sincère avec qui partager de beaux moments.',
  'La vie est courte : {a}, {b} et de bonnes conversations. Ravi(e) de faire de nouvelles rencontres.',
  'Calme, curieux(se) et attaché(e) à la famille. J’aime {a} et {b}. On en discute autour d’un café ?',
  'Entre {a} et {b}, je cherche la personne qui me fera sourire tous les jours.',
  'Profil sérieux. Amateur(trice) de {a}, fan de {b}. Les relations honnêtes avant tout.',
  'Ambitieux(se) mais pas stressé(e). {a}, {b}, et un bon sens de l’humour.',
];
const JOBS = ['Ingénieur·e', 'Enseignant·e', 'Infirmier·ère', 'Comptable', 'Entrepreneur·e', 'Médecin', 'Développeur·se', 'Commerçant·e', 'Juriste', 'Designer', 'Chauffeur·se', 'Étudiant·e en master', 'Photographe', 'Banquier·ère', 'Cuisinier·ère'];

async function seedCrowd(hash: string, interests: Map<string, string>) {
  const r = mulberry32(20261103);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  let created = 0;
  for (let i = 1; i <= 100; i++) {
    const email = `membre${String(i).padStart(3, '0')}@seed.duomatch.test`;
    if (await prisma.user.findUnique({ where: { email } })) continue;
    const roll = r();
    const gender: Gender = roll < 0.47 ? 'WOMAN' : roll < 0.94 ? 'MAN' : roll < 0.97 ? 'NON_BINARY' : 'OTHER';
    const name = gender === 'WOMAN' ? pick(NAMES_F) : gender === 'MAN' ? pick(NAMES_M) : pick([...NAMES_F, ...NAMES_M]);
    const age = 19 + Math.floor(r() * 30);
    const [country, city] = pick(PLACES);
    const tags = [...INTEREST_SLUGS].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 4));
    const bio = pick(BIOS).replace('{a}', tags[0]!).replace('{b}', tags[1]!);
    const birth = new Date(); birth.setUTCFullYear(birth.getUTCFullYear() - age - 1); birth.setUTCDate(1 + Math.floor(r() * 27));
    const seeking = gender === 'MAN' ? (r() < 0.9 ? 'WOMEN' : 'EVERYONE') : gender === 'WOMAN' ? (r() < 0.9 ? 'MEN' : 'EVERYONE') : 'EVERYONE';
    const nPhotos = 1 + Math.floor(r() * 3);
    const keys: string[] = [];
    for (let k = 0; k < nPhotos; k++) keys.push(await avatar(name, i + k * 3));
    const plan = i % 25 === 0 ? 'VIP' : i % 10 === 0 ? 'PREMIUM' : 'FREE';
    const lastActive = new Date(Date.now() - Math.floor(r() * 20 * 86_400_000));
    await prisma.user.create({ data: {
      email, passwordHash: hash, emailVerifiedAt: new Date(), acceptedTermsAt: new Date(), lastActiveAt: lastActive, createdAt: new Date(Date.now() - Math.floor(r() * 60 * 86_400_000)),
      profile: { create: { displayName: name, birthDate: birth, gender, country, city, intent: pick(INTENTS), completeness: 60 + Math.floor(r() * 41), onboardedAt: new Date(), verified: r() < 0.28,
        visibility: r() < 0.04 ? 'HIDDEN' : 'VISIBLE', languages: country === 'FR' || country === 'BE' || country === 'CA' ? ['fr', 'en'] : ['fr'], bio, occupation: pick(JOBS),
        photos: { create: keys.map((key, n) => ({ key, width: 800, height: 1000, position: n, isPrimary: n === 0, moderationStatus: 'APPROVED' as const })) } } },
      preference: { create: { seeking, ageMin: Math.max(18, age - 8), ageMax: Math.min(99, age + 12), country: r() < 0.5 ? country : null } },
      notificationPref: { create: {} },
      entitlement: { create: plan === 'FREE' ? {} : { plan, validUntil: new Date(Date.now() + 20 * 86_400_000) } },
      interests: { create: tags.map((t) => ({ interestId: interests.get(t)! })) },
    } });
    created++;
  }
  return created;
}

/** Des likes, un Super Like et trois conversations pour que « Likes » et « Messages » ne soient pas vides côté Aminata. */
async function seedActivity() {
  const me = await prisma.user.findUnique({ where: { email: 'aminata@seed.duomatch.test' } });
  if (!me) return;
  const men = await prisma.user.findMany({ where: { email: { startsWith: 'membre' }, profile: { gender: 'MAN', visibility: 'VISIBLE' } }, take: 18, orderBy: { email: 'asc' } });
  for (const [i, m] of men.entries()) {
    await prisma.swipe.upsert({ where: { giverId_targetId: { giverId: m.id, targetId: me.id } }, create: { giverId: m.id, targetId: me.id, action: i === 2 ? 'SUPER_LIKE' : 'LIKE' }, update: {} });
  }
  const lines = [['Bonjour Aminata, ton profil m’a tapé dans l’œil 😊', 'Merci ! Tu fais quoi dans la vie ?', 'Je suis dans la tech. Et toi, tu aimes voyager ?'], ['Salut ! On a plein de points communs.', 'Ah oui ? Lesquels ?'], ['Coucou, ravi de ce match !']];
  for (const [n, m] of men.slice(0, 3).entries()) {
    const [a, b] = me.id < m.id ? [me.id, m.id] : [m.id, me.id];
    await prisma.swipe.upsert({ where: { giverId_targetId: { giverId: me.id, targetId: m.id } }, create: { giverId: me.id, targetId: m.id, action: 'LIKE' }, update: {} });
    const match = await prisma.match.upsert({ where: { userAId_userBId: { userAId: a, userBId: b } }, create: { userAId: a, userBId: b, conversation: { create: {} } }, update: {}, include: { conversation: true } });
    if ((await prisma.message.count({ where: { conversationId: match.conversation!.id } })) === 0) {
      const base = Date.now() - 3_600_000 * (n + 1);
      for (const [k, body] of lines[n]!.entries()) {
        await prisma.message.create({ data: { conversationId: match.conversation!.id, senderId: k % 2 === 0 ? m.id : me.id, body, createdAt: new Date(base + k * 60_000), readAt: k % 2 === 1 || n > 0 ? new Date() : null } });
      }
      await prisma.conversation.update({ where: { id: match.conversation!.id }, data: { lastMessageAt: new Date(base + 120_000) } });
    }
  }
}

/** Mode de vie des profils de démonstration (taille, enfants, animaux…) : permet de tester les critères du menu Match. Idempotent. */
async function seedLifestyle() {
  const rows = await prisma.profile.findMany({ where: { heightCm: null, user: { email: { endsWith: '@seed.duomatch.test' }, role: 'USER' } }, select: { id: true, gender: true, country: true }, orderBy: { id: 'asc' } });
  const r = mulberry32(2026);
  const LIVING = ['ALONE', 'FAMILY', 'ROOMMATES'] as const;
  for (const p of rows) {
    const base = p.gender === 'MAN' ? 168 : 156;
    await prisma.profile.update({ where: { id: p.id }, data: {
      heightCm: base + Math.floor(r() * 28), hasChildren: r() < 0.3, likesPets: r() < 0.65, living: LIVING[Math.floor(r() * 3)]!,
      originCountry: r() < 0.8 ? p.country : ['CI', 'SN', 'CM', 'BJ', 'TG'][Math.floor(r() * 5)]!,
    } });
  }
  console.warn(`Mode de vie renseigné pour ${rows.length} profils de démonstration.`);
}

async function main() {
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  // Offres, prix et produits : créés au démarrage de l'API (PlanConfigService), jamais par le seed.
  await prisma.interest.createMany({ data: INTEREST_SLUGS.map((slug) => ({ slug })), skipDuplicates: true });
  const interests = new Map((await prisma.interest.findMany()).map((i) => [i.slug, i.id]));

  const staff = [['super@seed.duomatch.test', 'Super Admin', 'SUPER_ADMIN'], ['admin@seed.duomatch.test', 'Admin DuoMatch', 'ADMIN'], ['moderateur@seed.duomatch.test', 'Modératrice', 'MODERATOR']] as const;
  for (const [email, name, role] of staff) {
    if (await prisma.user.findUnique({ where: { email } })) continue;
    await prisma.user.create({ data: { email, passwordHash: hash, role, emailVerifiedAt: new Date(), acceptedTermsAt: new Date(),
      profile: { create: { displayName: name, birthDate: new Date('1990-01-01'), gender: 'OTHER', country: 'BJ', city: 'Cotonou', visibility: 'HIDDEN', onboardedAt: new Date() } },
      preference: { create: {} }, notificationPref: { create: {} }, entitlement: { create: {} } } });
  }

  let created = 0;
  for (const [i, [name, gender, age, country, city, intent, tags]] of PEOPLE.entries()) {
    const email = `${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@seed.duomatch.test`;
    if (await prisma.user.findUnique({ where: { email } })) continue;
    const birth = new Date(); birth.setUTCFullYear(birth.getUTCFullYear() - age - 1);
    const key = await avatar(name, i);
    const u = await prisma.user.create({ data: {
      email, passwordHash: hash, emailVerifiedAt: new Date(), acceptedTermsAt: new Date(),
      profile: { create: { displayName: name, birthDate: birth, gender, country, city, intent, completeness: 85, onboardedAt: new Date(), verified: i % 4 === 0, languages: ['fr'],
        bio: `Profil de démonstration (${city}). J’aime ${tags.join(', ')} et les belles rencontres.`, occupation: ['Ingénieur·e', 'Enseignant·e', 'Entrepreneur·e', 'Infirmier·ère'][i % 4],
        photos: { create: [{ key, width: 800, height: 1000, isPrimary: true, moderationStatus: 'APPROVED' }] } } },
      preference: { create: { seeking: gender === 'MAN' ? 'WOMEN' : 'MEN', ageMin: 18, ageMax: 60 } },
      notificationPref: { create: {} }, entitlement: { create: {} },
      interests: { create: tags.map((t) => ({ interestId: interests.get(t)! })) },
    } });
    created += u ? 1 : 0;
  }
  const crowd = await seedCrowd(hash, interests);
  await seedActivity();
  await seedLifestyle();
  console.warn(`Seed OK : ${crowd} membres de démonstration supplémentaires, ${created} membres créés, ${staff.length} comptes staff (si absents).`);
  console.warn(`Mot de passe de TOUS les comptes seed : ${PASSWORD}  (domaine @seed.duomatch.test ; les comptes déjà existants gardent leur mot de passe)`);
}
main().finally(() => prisma.$disconnect());
