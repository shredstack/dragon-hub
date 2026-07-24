import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { schoolJoinCodes, schools } from "@/lib/db/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import type { MembershipSource, SchoolRole } from "@/types";

/**
 * Codes that admit someone to a school.
 *
 * There used to be exactly one — `schools.join_code` — which was fine while
 * every door led to the same place. Now a school has a PTA code that hands out
 * `member`, a school admin code that hands out `admin`, and room for the SCC
 * code that is coming, so the code itself has to say what it grants.
 *
 * `schools.join_code` is still the PTA code and still what the QR flow and the
 * board's settings screen read; the row here mirrors it (see
 * `syncPtaJoinCode`) so that redemption has a single path to walk.
 */

/** The label the seeded PTA row carries, and how we find it again. */
export const PTA_CODE_LABEL = "PTA join code";

export type JoinCodeRow = typeof schoolJoinCodes.$inferSelect;

/** Why a code was refused, in words we can show the person holding it. */
export type JoinCodeRejection =
  | "not_found"
  | "inactive"
  | "expired"
  | "exhausted";

export const JOIN_CODE_REJECTION_MESSAGES: Record<JoinCodeRejection, string> = {
  not_found:
    "We couldn't find a school with that code. Please check the code and try again.",
  inactive: "That code is no longer active. Please ask for a current one.",
  expired: "That code has expired. Please ask for a current one.",
  exhausted:
    "That code has already been used the maximum number of times. Please ask for a new one.",
};

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * The alphabet every code is drawn from. Excludes characters that get misread
 * out loud or in print: 0/O, 1/I/L.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Codes are globally unique and `findJoinCode` resolves the *school* from the
 * code, so a guessable one is a way into a school you have nothing to do with.
 *
 * That rules out `Math.random()`, whose xorshift128+ state is recoverable from
 * a handful of outputs — see one school's code, predict the next school's.
 * `randomInt` draws from the CSPRNG and rejects modulo bias.
 *
 * 10 characters of a 32-symbol alphabet is 50 bits, which is not brute-forceable
 * against the rate limit on redemption and still reads over a microphone.
 */
export const DEFAULT_JOIN_CODE_LENGTH = 10;

export function generateRandomCode(
  length: number = DEFAULT_JOIN_CODE_LENGTH
): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return code;
}

/**
 * A code that is guaranteed not to collide with one already in use.
 *
 * At 50 bits a collision is vanishingly unlikely, but `code` carries a unique
 * constraint and the failure mode — a school's code rotation throwing at the
 * database — is worth three cheap lookups to avoid.
 */
export async function generateUniqueCode(
  length: number = DEFAULT_JOIN_CODE_LENGTH
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRandomCode(length);
    const [clash, schoolClash] = await Promise.all([
      db.query.schoolJoinCodes.findFirst({
        where: eq(schoolJoinCodes.code, code),
        columns: { id: true },
      }),
      db.query.schools.findFirst({
        where: eq(schools.joinCode, code),
        columns: { id: true },
      }),
    ]);
    if (!clash && !schoolClash) return code;
  }
  throw new Error("Could not generate a unique join code. Please try again.");
}

/**
 * Shared validation for a hand-typed code. Codes are globally unique because
 * redemption resolves the school *from* the code — there is no school context
 * to disambiguate two schools that both chose "DRAGONS".
 */
export async function assertCodeAvailable(
  code: string,
  { exceptId }: { exceptId?: string } = {}
): Promise<void> {
  if (code.length < 4) throw new Error("Code must be at least 4 characters");
  if (code.length > 20) throw new Error("Code must be 20 characters or less");
  if (!/^[A-Z0-9]+$/.test(code)) {
    throw new Error("Code can only contain letters and numbers");
  }

  const clash = await db.query.schoolJoinCodes.findFirst({
    where: exceptId
      ? and(eq(schoolJoinCodes.code, code), ne(schoolJoinCodes.id, exceptId))
      : eq(schoolJoinCodes.code, code),
    columns: { id: true },
  });
  if (clash) throw new Error("This code is already in use");

  // The PTA code also lives on `schools`, and that column carries its own
  // unique constraint — a clash there would fail at the database instead of
  // here, with a message nobody can act on.
  const schoolClash = await db.query.schools.findFirst({
    where: eq(schools.joinCode, code),
    columns: { id: true },
  });
  if (schoolClash && !exceptId) {
    throw new Error("This code is already in use");
  }
}

/**
 * Resolve a code to the row that will admit someone, or the reason it won't.
 *
 * Every gate a code can fail lives here rather than at the call site, so the
 * redemption path and any future preview screen agree about what a usable code
 * is.
 */
export async function findJoinCode(
  rawCode: string
): Promise<
  { ok: true; code: JoinCodeRow } | { ok: false; reason: JoinCodeRejection }
> {
  const code = normalizeJoinCode(rawCode);

  const row = await db.query.schoolJoinCodes.findFirst({
    where: eq(schoolJoinCodes.code, code),
  });
  if (!row) return { ok: false, reason: "not_found" };

  if (!row.active) return { ok: false, reason: "inactive" };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.maxUses !== null && row.uses >= row.maxUses) {
    return { ok: false, reason: "exhausted" };
  }

  return { ok: true, code: row };
}

/**
 * Whether redeeming this code should land in `pending` rather than `approved`.
 *
 * A code that grants more than `member` is a high-value secret that will end up
 * forwarded in a staff email, and auto-approving it would also route around the
 * deliberate downgrade in `joinSchool` — where someone whose access was removed
 * comes back as a plain member, so that rejoining can never restore privileges
 * the board just took away. Requiring an approval keeps that guarantee.
 */
export function codeRequiresApproval(code: JoinCodeRow): boolean {
  return code.requiresApproval || code.grantsRole !== "member";
}

export async function getSchoolJoinCodes(
  schoolId: string
): Promise<JoinCodeRow[]> {
  return db
    .select()
    .from(schoolJoinCodes)
    .where(eq(schoolJoinCodes.schoolId, schoolId))
    .orderBy(asc(schoolJoinCodes.createdAt));
}

/** The codes that admit someone as a school admin. */
export async function getSchoolAdminJoinCodes(
  schoolId: string
): Promise<JoinCodeRow[]> {
  return db
    .select()
    .from(schoolJoinCodes)
    .where(
      and(
        eq(schoolJoinCodes.schoolId, schoolId),
        eq(schoolJoinCodes.grantsRole, "admin")
      )
    )
    .orderBy(asc(schoolJoinCodes.createdAt));
}

/**
 * Keep the PTA code row in step with `schools.join_code`.
 *
 * The board rotates its code from School Settings, which writes the `schools`
 * column; redemption reads this table. Calling this from both rotation paths is
 * what stops the two from drifting into disagreeing about what the PTA code is.
 */
export async function syncPtaJoinCode(
  schoolId: string,
  code: string
): Promise<void> {
  const existing = await db.query.schoolJoinCodes.findFirst({
    where: and(
      eq(schoolJoinCodes.schoolId, schoolId),
      eq(schoolJoinCodes.grantsSource, "pta_join_code")
    ),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(schoolJoinCodes)
      .set({ code, active: true, updatedAt: new Date() })
      .where(eq(schoolJoinCodes.id, existing.id));
    return;
  }

  await db.insert(schoolJoinCodes).values({
    schoolId,
    code,
    label: PTA_CODE_LABEL,
    grantsRole: "member",
    grantsSource: "pta_join_code",
    requiresApproval: false,
    active: true,
  });
}

/** Create a code. Role and source travel together so they can't disagree. */
export async function createJoinCode(input: {
  schoolId: string;
  code: string;
  label: string;
  grantsRole: SchoolRole;
  grantsSource: MembershipSource;
  requiresApproval?: boolean;
  expiresAt?: Date | null;
  maxUses?: number | null;
  createdBy?: string | null;
}): Promise<JoinCodeRow> {
  const [row] = await db
    .insert(schoolJoinCodes)
    .values({
      schoolId: input.schoolId,
      code: input.code,
      label: input.label,
      grantsRole: input.grantsRole,
      grantsSource: input.grantsSource,
      requiresApproval: input.requiresApproval ?? input.grantsRole !== "member",
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}
