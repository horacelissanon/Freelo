import 'server-only';
import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';

/** Every route that accepts `currency` needs this to validate exchangeRateToDefault. */
export async function getDefaultCurrency(prisma: PrismaClient, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  return user?.defaultCurrency ?? 'XOF';
}

/**
 * Mirrors the imperative PLAN_LIMIT_CURRENCY check pattern already used in
 * these same routes (post-Zod-parse, not a Zod .refine — the check needs
 * the user's defaultCurrency, which isn't known at parse time). Returns a
 * 400 response when a non-default currency is picked without a rate, null
 * otherwise.
 */
export function exchangeRateValidationError(
  currency: string,
  defaultCurrency: string,
  exchangeRateToDefault: number | null | undefined,
  requestId: string,
): NextResponse | null {
  if (currency === defaultCurrency) return null;
  if (exchangeRateToDefault != null && exchangeRateToDefault > 0) return null;
  return NextResponse.json(
    {
      error: 'VALIDATION_FAILED',
      message:
        'exchangeRateToDefault is required when currency differs from your default currency.',
      issues: [{ path: ['exchangeRateToDefault'], message: 'Required' }],
    },
    { status: 400, headers: { 'x-request-id': requestId } },
  );
}
