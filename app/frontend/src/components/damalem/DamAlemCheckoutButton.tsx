import { ChevronRight, Loader2 } from 'lucide-react';

interface Props {
  label: string;
  sublabel?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  testId?: string;
}

export default function DamAlemCheckoutButton({
  label,
  sublabel,
  disabled,
  loading,
  onClick,
  testId,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      data-testid={testId}
      className={`dam-checkout-cta ${disabled && !loading ? 'dam-checkout-cta--disabled' : ''}`}
    >
      <span className="dam-checkout-cta__text">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            {label}
          </span>
        ) : (
          <>
            <span className="dam-checkout-cta__label">{label}</span>
            {sublabel ? <span className="dam-checkout-cta__sub">{sublabel}</span> : null}
          </>
        )}
      </span>
      {!loading && !disabled ? (
        <span className="dam-checkout-cta__icon" aria-hidden>
          <ChevronRight className="h-5 w-5" />
        </span>
      ) : null}
    </button>
  );
}
