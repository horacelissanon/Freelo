// AppSettings — single-row, site-wide config editable from Super Admin →
// Paramètres → Général (mirrors billing/plans.ts's getPlanConfig
// upsert-on-read pattern, just for one global row instead of one per plan).
import 'server-only';
import type { PrismaClient } from '@prisma/client';

const SINGLETON_ID = 'default';

export interface AppSettingsShape {
  communityWhatsappUrl: string | null;
  updatedAt: string;
}

export async function getAppSettings(prisma: PrismaClient): Promise<AppSettingsShape> {
  const row = await prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
  return {
    communityWhatsappUrl: row.communityWhatsappUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}
