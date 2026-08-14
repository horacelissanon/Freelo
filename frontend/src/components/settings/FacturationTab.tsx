// Static showcase only — no real subscription/billing system. Bictorys, the
// only payment provider wired into this app, supports redirect-per-charge
// mobile money only (no saved card/token), so silent recurring billing isn't
// achievable without a second provider (e.g. Stripe). Deliberately omits any
// "current plan" / card-on-file / billing-history section since none of that
// data is real — see the approved plan for this tradeoff.
import { Icon } from '@/components/ui/Icon';

interface Plan {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'Gratuit',
    description: "Pour démarrer et tester l'outil sur tes premiers clients.",
    features: [
      "Jusqu'à 5 clients",
      "Jusqu'à 3 projets actifs",
      'Devis & factures illimités',
      'Lien de suivi client',
    ],
  },
  {
    name: 'Pro',
    price: '15 000',
    period: 'FCFA / mois',
    description: 'Pour les freelances et studios avec un portefeuille actif.',
    features: [
      'Clients & projets illimités',
      'Branding personnalisé sur les documents',
      'Étapes de projet personnalisables',
      'Support prioritaire',
    ],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Sur devis',
    description: 'Pour les agences avec plusieurs collaborateurs et besoins sur mesure.',
    features: ['Tout Pro, plus', 'Multi-utilisateurs', 'Accès API', 'Accompagnement dédié'],
  },
];

export function FacturationTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-dashed border-border bg-canvas p-4">
        <p className="font-body text-sm text-muted-foreground">
          La facturation en ligne arrive bientôt. En attendant, ton compte reste gratuit et sans
          limite de fonctionnalités.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col gap-4 rounded-lg border p-5 shadow-card ${
              plan.highlighted ? 'border-primary bg-canvas' : 'border-border bg-canvas'
            }`}
          >
            <div className="flex flex-col gap-1">
              <span className="font-headings text-base font-semibold text-foreground">
                {plan.name}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headings text-2xl font-bold text-foreground">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="font-body text-xs text-muted-foreground">{plan.period}</span>
                )}
              </div>
              <p className="font-body text-xs text-muted-foreground">{plan.description}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 font-body text-sm text-foreground"
                >
                  <Icon i="check-circle" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="mt-auto rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground disabled:opacity-50"
            >
              {plan.name === 'Enterprise' ? 'Nous contacter' : 'Bientôt disponible'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
