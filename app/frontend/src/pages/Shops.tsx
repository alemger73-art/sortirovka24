/** /shops — all partner shops of the district, plus the invitation to open one. */
import Layout from '@/components/Layout';
import HomeShops from '@/components/HomeShops';
import { usePageSeo } from '@/hooks/usePageSeo';
import '@/styles/home-a.css';

export default function Shops() {
  usePageSeo({ title: 'Магазины района — заказ с доставкой, Сортировка 24', description: 'Магазины Сортировки с онлайн-заказом и доставкой до двери.' });
  return <Layout><div className="homeA" style={{ minHeight: 0 }}><div className="a-wrap"><HomeShops full /></div></div></Layout>;
}
