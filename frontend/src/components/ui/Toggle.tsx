// Small on/off switch used by settings toggles (public portal link, paid
// invoices default, per-event notification channels). Deliberately not a
// native checkbox so the visual matches the rest of the design system.
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    // Outer button carries extra padding so the tap target is ~44px tall
    // even though the visible pill stays compact — a plain h-6 (24px) button
    // is both hard to see against a light card and under the WCAG touch
    // target minimum on mobile.
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex-shrink-0 rounded-full p-2.5 -m-2.5 disabled:opacity-50"
    >
      <span
        className={`relative flex h-6 w-11 items-center rounded-full border transition-colors ${
          checked ? 'border-primary bg-primary' : 'border-border bg-toggle-track'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-toggle-thumb shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
