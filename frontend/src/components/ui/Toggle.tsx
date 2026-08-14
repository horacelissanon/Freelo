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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-toggle-track'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-toggle-thumb shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
