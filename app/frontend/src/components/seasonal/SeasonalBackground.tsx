/** Hero photo that switches to the seasonal banner chosen in the admin panel while the theme is on. */
import { useSeasonal } from './SeasonalThemeProvider';

export default function SeasonalBackground({ fallback, className }: { fallback: string; className?: string }) {
  const { active, settings } = useSeasonal();
  const src = active && settings.hero_image ? settings.hero_image : fallback;
  return <img key={src} src={src} alt="" fetchPriority="high" className={className} />;
}
