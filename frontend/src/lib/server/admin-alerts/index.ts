/**
 * createAdminAlert — single entry point for every AdminAlert row.
 *
 * Mirrors `notifications/index.ts::createNotification`: the
 * AdminAlert.dedupeKey @unique constraint is the at-most-once delivery gate.
 * Project code MUST always go through this function — never call
 * `prisma.adminAlert.create` inline. Typed wrappers live in `templates.ts`.
 *
 * Unlike Notification, an AdminAlert has no owning userId — it's a
 * platform-wide signal visible to every ADMIN/SUPERADMIN, acknowledged by
 * whichever admin handles it (see PATCH /api/admin/alerts/[id]).
 */
import type { PrismaClient, AdminAlert, Prisma } from '@prisma/client';

export type AdminAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface CreateAdminAlertInput {
  type: string;
  severity: AdminAlertSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Caller-supplied — must be deterministic for the dedup window. */
  dedupeKey: string;
}

/**
 * Returns the created AdminAlert row, or `null` if the dedupeKey already
 * exists (silently deduplicated).
 *
 * Other Prisma errors are re-thrown so callers can decide whether to retry.
 */
export async function createAdminAlert(
  prisma: PrismaClient,
  input: CreateAdminAlertInput,
): Promise<AdminAlert | null> {
  try {
    return await prisma.adminAlert.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
        data: (input.data ?? null) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    });
  } catch (err) {
    // Duck-typed P2002 catch (Prisma unique violation) — same pattern as
    // notifications/index.ts::createNotification.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    ) {
      return null;
    }
    throw err;
  }
}
