import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { sessions, users } from '../db/schema.js';
import type { Config } from '../config/env.js';
import { AppError } from '../middleware/errors.js';
import { profile } from '../repositories/users.js';
export const hashPassword = (value: string) =>
  argon2.hash(value, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export function authService(db: Database, config: Config) {
  const digest = (value: string) =>
    createHmac('sha256', config.SESSION_SECRET).update(value).digest('hex');
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  return {
    csrf(token: string) {
      return digest(`csrf:${token}`);
    },
    matches(a: string, b: string) {
      return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    },
    async authenticate(token?: string) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'Please sign in');
      const [row] = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, digest(token)),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date()),
            eq(users.accountStatus, 'active'),
          ),
        );
      if (!row) throw new AppError(401, 'Your session has expired. Please sign in');
      return row;
    },
    async login(email: string, password: string, remember: boolean, oldToken?: string) {
      const [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      const valid = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
      if (!valid || !user || user.accountStatus !== 'active' || !user.passwordHash)
        throw new AppError(401, 'Email or password is incorrect');
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (remember ? 7 * 24 : 8) * 3600_000);
      await db.transaction(async (tx) => {
        const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
        if (
          !current ||
          current.accountStatus !== 'active' ||
          current.passwordHash !== user.passwordHash
        )
          throw new AppError(401, 'Email or password is incorrect');
        if (oldToken)
          await tx
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.tokenHash, digest(oldToken)));
        await tx.insert(sessions).values({ userId: user.id, tokenHash: digest(token), expiresAt });
        await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      });
      return { token, expiresAt, user: await profile(db, user.id), csrfToken: this.csrf(token) };
    },
    async logout(token: string) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, digest(token)));
    },
  };
}
