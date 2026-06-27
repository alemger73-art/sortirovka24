import { useState } from 'react';
import { Fingerprint, Lock, Loader2 } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { verifyCabinetPin, markCabinetUnlocked } from '@/lib/cabinetPreferences';
import { authenticateBiometric } from '@/lib/biometricAuth';

interface Props {
  biometricAvailable: boolean;
  biometricLabel: string;
  onUnlocked: () => void;
  title: string;
  subtitle: string;
  pinLabel: string;
  biometricButton: string;
  wrongPin: string;
}

export default function CabinetLockScreen({
  biometricAvailable,
  biometricLabel,
  onUnlocked,
  title,
  subtitle,
  pinLabel,
  biometricButton,
  wrongPin,
}: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function tryPin(value: string) {
    if (value.length < 4) return;
    setChecking(true);
    setError('');
    const ok = await verifyCabinetPin(value);
    setChecking(false);
    if (ok) {
      markCabinetUnlocked();
      onUnlocked();
      return;
    }
    setError(wrongPin);
    setPin('');
  }

  async function tryBiometric() {
    setChecking(true);
    setError('');
    const ok = await authenticateBiometric(title);
    setChecking(false);
    if (ok) {
      markCabinetUnlocked();
      onUnlocked();
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/20">
        <Lock className="h-8 w-8 text-amber-600 dark:text-amber-300" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-2 text-center text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>

      <div className="mt-8 w-full space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400">{pinLabel}</p>
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={pin}
            onChange={(v) => {
              setPin(v.replace(/\D/g, '').slice(0, 6));
              setError('');
              if (v.replace(/\D/g, '').length >= 4) void tryPin(v.replace(/\D/g, '').slice(0, 6));
            }}
            disabled={checking}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        {checking ? (
          <div className="flex justify-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : null}

        {biometricAvailable ? (
          <button
            type="button"
            onClick={() => void tryBiometric()}
            disabled={checking}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60 dark:border-[#2a3347] dark:bg-[#111827] dark:text-white dark:hover:bg-[#1a2336]"
          >
            <Fingerprint className="h-5 w-5" />
            {biometricButton.replace('{type}', biometricLabel)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
