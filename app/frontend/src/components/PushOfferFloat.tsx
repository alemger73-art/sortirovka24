import { useEffect, useState } from 'react';
import PushPromptCard from '@/components/PushPromptCard';
import InstallAppBanner from '@/components/InstallAppBanner';
import { getAccountToken } from '@/lib/accountApi';
import { getPushPermissionState } from '@/lib/pushNotifications';

/**
 * A signed-in visitor whose notifications are off is offered them once, in the corner where the install banner sits:
 * most people register on the home page and never open the cabinet, where the offer used to live.
 * Same card and rules as in the cabinet: orders and bonuses with the button, news and offers only with their own
 * unticked box; «×» hides it for a week. Waits 10 seconds into the page. Everyone else gets the install banner.
 */
const DISMISS_KEY = 's24_push_prompt_dismissed_at';
const ASK_AGAIN_DAYS = 7;
const DELAY_MS = 10000;

function recentlyDismissed(): boolean {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY)) < ASK_AGAIN_DAYS * 86_400_000; } catch { return false; }
}

export default function PushOfferFloat() {
  const [offer, setOffer] = useState<boolean | null>(null);
  useEffect(() => {
    if (!getAccountToken() || recentlyDismissed()) { setOffer(false); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      getPushPermissionState().then((s) => { if (alive) setOffer(s === 'disabled'); }).catch(() => { if (alive) setOffer(false); });
    }, DELAY_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);
  if (offer === false) return <InstallAppBanner />;
  if (!offer) return null;
  return (
    <div data-testid="push-offer" className="fixed inset-x-0 z-[46] p-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-3">
      <div className="mx-auto max-w-md">
        <PushPromptCard reason="cabinet" className="shadow-2xl" />
      </div>
    </div>
  );
}
