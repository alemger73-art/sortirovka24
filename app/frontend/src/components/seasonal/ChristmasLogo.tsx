/** Santa hat over the S24 mark; the mark itself stays untouched and recognisable. */
import { useSeasonal } from './SeasonalThemeProvider';

export default function ChristmasLogo() {
  const { active } = useSeasonal();
  if (!active) return null;
  return <img src="/seasonal/santa-hat.webp" alt="" aria-hidden="true" className="ny-hat" width={110} height={84} decoding="async" />;
}
