// Client relationship status, derived from the client's real projects/devis
// rather than freelance-picked — see lib/constants.ts's ClientStatus for the
// one-way new -> pending -> active progression. 'archived' is the one
// manually-chosen value and is never touched by this function; callers
// (PATCH /api/clients/[id]'s un-archive path) only reach for this once
// they've already decided the client isn't archiving.
import 'server-only';
import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'project' | 'invoice'>;

export async function deriveClientStatus(
  db: Db,
  clientId: string,
): Promise<'new' | 'pending' | 'active'> {
  const hasProject = await db.project.count({
    where: { clientId, status: { not: 'DRAFT' } },
  });
  if (hasProject > 0) return 'active';

  const hasAcceptedQuote = await db.invoice.count({
    where: { clientId, docType: 'QUOTE', status: 'ACCEPTED' },
  });
  return hasAcceptedQuote > 0 ? 'pending' : 'new';
}
