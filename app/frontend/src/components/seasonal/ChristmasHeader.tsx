/** Festive layer of the top bar: the garland under its bottom edge. The bar itself is restyled in seasonal.css. */
import Garland from './Garland';
import { useSeasonal } from './SeasonalThemeProvider';

export default function ChristmasHeader() {
  const { active } = useSeasonal();
  if (!active) return null;
  return <Garland />;
}
