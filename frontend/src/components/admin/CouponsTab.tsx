'use client';

// Super Admin → Coupons. Lists coupons (GET /api/admin/coupons, ADMIN-readable)
// and creates new ones (POST, SUPERADMIN-only — a discount is a real-money
// change, same precedent as PlansTab.tsx). Coupons are immutable after
// creation (code/percentOff never change) — the only edit is the active
// toggle (PATCH /api/admin/coupons/[id]), so there's no "Modifier" modal
// here, just "Activer"/"Désactiver" per row. Styled like PlansTab.tsx:
// hardcoded slate/emerald, not the ZeFacto workspace theme tokens.
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { LoadingState, ErrorState } from '@/components/ui/PageStates';
import { formatLongDate, formatPrice } from '@/lib/utils';

interface Coupon {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
  maxRedemptions: number | null;
  active: boolean;
  expiresAt: string | null;
  redemptionCount: number;
  createdAt: string;
}

interface CouponsResponse {
  items: Coupon[];
  nextCursor: string | null;
}

const COUPONS_PATH = '/api/admin/coupons';
const cardClass = 'rounded-xl border border-border bg-canvas shadow-card';
const inputClass =
  'rounded-md border border-border bg-canvas px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/30 focus:outline-none';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'COUPON_CODE_TAKEN') return 'Un coupon avec ce code existe déjà.';
    return err.message;
  }
  return 'Une erreur est survenue.';
}

export function CouponsTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, refresh } = useApi<CouponsResponse>(COUPONS_PATH);
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [percentOff, setPercentOff] = useState(10);
  const [amountOff, setAmountOff] = useState(500);
  const [billingCycle, setBillingCycle] = useState<'BOTH' | 'MONTHLY' | 'YEARLY'>('BOTH');
  const [unlimitedUses, setUnlimitedUses] = useState(true);
  const [maxRedemptions, setMaxRedemptions] = useState(100);
  const [expiresAt, setExpiresAt] = useState('');

  function openCreate() {
    setCode('');
    setDiscountType('PERCENT');
    setPercentOff(10);
    setAmountOff(500);
    setBillingCycle('BOTH');
    setUnlimitedUses(true);
    setMaxRedemptions(100);
    setExpiresAt('');
    setCreating(true);
  }

  async function submitCreate() {
    setSubmitting(true);
    try {
      await api(COUPONS_PATH, {
        method: 'POST',
        body: {
          code,
          discountType,
          ...(discountType === 'PERCENT' ? { percentOff } : { amountOff }),
          ...(billingCycle === 'BOTH' ? {} : { billingCycle }),
          ...(unlimitedUses ? {} : { maxRedemptions }),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        },
      });
      invalidateCache(COUPONS_PATH);
      await refresh();
      toast('Coupon créé.', 'success');
      setCreating(false);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    setTogglingId(coupon.id);
    try {
      await api(`${COUPONS_PATH}/${coupon.id}`, {
        method: 'PATCH',
        body: { active: !coupon.active },
      });
      invalidateCache(COUPONS_PATH);
      await refresh();
      toast(coupon.active ? 'Coupon désactivé.' : 'Coupon activé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  return (
    <div>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Icon i="plus" size={14} />
            Créer un coupon
          </button>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className={`${cardClass} p-8 text-center`}>
          <p className="font-body text-sm text-muted-foreground">Aucun coupon pour le moment.</p>
        </div>
      ) : (
        <div className={`${cardClass} divide-y divide-border`}>
          {data.items.map((coupon) => (
            <div
              key={coupon.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50">
                  <Icon i="tag" size={15} className="text-emerald-600" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 font-body text-sm font-medium text-foreground">
                    {coupon.code}
                    <span
                      className={`rounded-full px-2 py-0.5 font-body text-[11px] font-medium ${
                        coupon.active
                          ? 'bg-tag-green text-tag-green-fg'
                          : 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {coupon.active ? 'Actif' : 'Inactif'}
                    </span>
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {coupon.discountType === 'AMOUNT'
                      ? `-${formatPrice(coupon.amountOff ?? 0, 'FCFA')}`
                      : `-${coupon.percentOff}%`}{' '}
                    · {coupon.redemptionCount}
                    {coupon.maxRedemptions !== null ? `/${coupon.maxRedemptions}` : ''} utilisation
                    {coupon.redemptionCount !== 1 ? 's' : ''}
                    {coupon.billingCycle
                      ? ` · ${coupon.billingCycle === 'MONTHLY' ? 'Mensuel' : 'Annuel'} uniquement`
                      : ''}
                    {coupon.expiresAt ? ` · Expire le ${formatLongDate(coupon.expiresAt)}` : ''}
                  </span>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void toggleActive(coupon)}
                  disabled={togglingId === coupon.id}
                  className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 font-body text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {togglingId === coupon.id
                    ? 'Enregistrement…'
                    : coupon.active
                      ? 'Désactiver'
                      : 'Activer'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Créer un coupon" onClose={() => setCreating(false)}>
          <div className="mb-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">
                Code (ex: SAVE10)
              </span>
              <input
                type="text"
                value={code}
                maxLength={30}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={inputClass}
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">
                Type de réduction
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setDiscountType('PERCENT')}
                  className={`flex-1 rounded-md border px-3 py-2 font-body text-sm font-medium ${
                    discountType === 'PERCENT'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-border text-foreground'
                  }`}
                >
                  Taux (%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('AMOUNT')}
                  className={`flex-1 rounded-md border px-3 py-2 font-body text-sm font-medium ${
                    discountType === 'AMOUNT'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-border text-foreground'
                  }`}
                >
                  Montant fixe
                </button>
              </div>
            </div>

            {discountType === 'PERCENT' ? (
              <label className="flex flex-col gap-1">
                <span className="font-body text-xs font-medium text-muted-foreground">
                  Réduction (%)
                </span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={percentOff}
                  onChange={(e) => setPercentOff(Number(e.target.value))}
                  className={inputClass}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="font-body text-xs font-medium text-muted-foreground">
                  Montant de réduction (FCFA)
                </span>
                <input
                  type="number"
                  min={1}
                  value={amountOff}
                  onChange={(e) => setAmountOff(Number(e.target.value))}
                  className={inputClass}
                />
              </label>
            )}

            <div className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">
                Cycle de facturation
              </span>
              <div className="flex gap-1.5">
                {(['BOTH', 'MONTHLY', 'YEARLY'] as const).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    className={`flex-1 rounded-md border px-3 py-2 font-body text-sm font-medium ${
                      billingCycle === cycle
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                        : 'border-border text-foreground'
                    }`}
                  >
                    {cycle === 'BOTH' ? 'Les deux' : cycle === 'MONTHLY' ? 'Mensuel' : 'Annuel'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">
                Nombre d&rsquo;utilisations
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setUnlimitedUses(true)}
                  className={`flex-1 rounded-md border px-3 py-2 font-body text-sm font-medium ${
                    unlimitedUses
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-border text-foreground'
                  }`}
                >
                  Illimité
                </button>
                <button
                  type="button"
                  onClick={() => setUnlimitedUses(false)}
                  className={`flex-1 rounded-md border px-3 py-2 font-body text-sm font-medium ${
                    !unlimitedUses
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-border text-foreground'
                  }`}
                >
                  Nombre limité
                </button>
              </div>
              {!unlimitedUses && (
                <input
                  type="number"
                  min={1}
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(Number(e.target.value))}
                  className={`${inputClass} mt-1.5`}
                  aria-label="Nombre maximal d'utilisations au total"
                />
              )}
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-body text-xs font-medium text-muted-foreground">
                Date d&rsquo;expiration (optionnel)
              </span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputClass}
              />
            </label>

            <p className="rounded-md bg-secondary/50 px-3 py-2.5 font-body text-xs text-muted-foreground">
              Chaque coupon est utilisable une seule fois par utilisateur. Le nombre
              d&rsquo;utilisations choisi ci-dessus s&rsquo;applique au total, tous utilisateurs
              confondus.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={
                submitting ||
                code.trim().length < 3 ||
                (discountType === 'PERCENT' ? percentOff < 1 || percentOff > 99 : amountOff < 1) ||
                (!unlimitedUses && maxRedemptions < 1)
              }
              onClick={() => void submitCreate()}
              className="rounded-md bg-emerald-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Création…' : 'Créer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
