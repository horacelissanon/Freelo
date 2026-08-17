// DELETE /api/auth/account — Compte → Zone dangereuse "Supprimer mon compte".
// Hard delete (no soft-delete pattern exists anywhere in this schema).
// Pre-flight blocks on the schema's 3 `onDelete: Restrict` relations to
// User (Withdrawal.userId, AdminAction.actorId, Organization.ownerId) so
// the FK violation surfaces as a clean 4xx instead of an unhandled 500.
// Also blocks on any non-DRAFT Invoice: Invoice.user cascades from User,
// and the schema's own "no hard delete of invoices exists anywhere in this
// app by design" invariant (see schema.prisma, Invoice model) would
// otherwise be silently violated by deleting the account that owns them —
// a credit note is supposed to be the only way to void a sent invoice.
// Everything else cascades or SetNulls automatically (Client → Project →
// ProjectStep/ProjectComment, DRAFT Invoices, OAuthAccount, VerificationCode,
// Notification, NotificationPreferences, Subscription → SubscriptionTransaction).
//
// Deliberately does NOT go through logAdminAction: an AdminAction row has
// actorId → User with onDelete: Restrict, so writing one for this user's
// OWN deletion would immediately re-trigger the exact FK block this route
// exists to avoid. A structured log line is the audit trail instead —
// consistent with how other non-back-office security events are recorded.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf, clearAuthCookies, clearCsrfCookie } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const userId = auth.user.sub;

    const [withdrawalCount, adminActionCount, ownedOrgCount, nonDraftInvoiceCount] =
      await Promise.all([
        prisma.withdrawal.count({ where: { userId } }),
        prisma.adminAction.count({ where: { actorId: userId } }),
        prisma.organization.count({ where: { ownerId: userId } }),
        prisma.invoice.count({ where: { userId, status: { not: 'DRAFT' } } }),
      ]);

    if (withdrawalCount > 0) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_HAS_WITHDRAWALS',
          message:
            'Impossible de supprimer ce compte : un historique de retraits existe. Contacte le support.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (adminActionCount > 0) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_IS_ADMIN',
          message:
            'Impossible de supprimer ce compte administrateur depuis cette page. Contacte le support.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (ownedOrgCount > 0) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_OWNS_ORGANIZATION',
          message:
            "Impossible de supprimer ce compte : il possède une organisation. Transfère-la d'abord.",
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (nonDraftInvoiceCount > 0) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_HAS_INVOICES',
          message:
            'Impossible de supprimer ce compte : des devis ou factures envoyés existent. Exporte tes données puis contacte le support.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const email = auth.user.email;
    await prisma.user.delete({ where: { id: userId } });

    log.warn('user self-deleted their account', { userId, email });

    await clearAuthCookies();
    await clearCsrfCookie();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
