import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { loadInstructions, type Instruction } from '@/lib/instructions';
import { InstructionItem } from '@/pages/Instructions';
import '@/styles/instructions.css';

/** Home: the main video guide (install and sign-up) right under the hero, so newcomers find it at once. */
export default function HomeInstructions() {
  const [items, setItems] = useState<Instruction[]>([]);
  useEffect(() => { loadInstructions().then(setItems); }, []);
  if (!items.length) return null;
  return <section className="ins-home a-section" aria-label="Инструкции">
    <div className="a-head"><div><span className="a-kicker">Как пользоваться</span><h2>📺 Инструкции</h2></div>
      {items.length > 1 && <Link to="/instructions" className="a-more">Все<ArrowRight size={15} /></Link>}</div>
    <InstructionItem item={items[0]} />
  </section>;
}
