import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { track } from '@/lib/analytics';
import { inLang, loadInstructions, type Instruction } from '@/lib/instructions';
import '@/styles/instructions.css';

/** One quiet line «▶ Как это работает — видео» linking to the section's video guide; renders nothing until a guide exists. */
export default function SectionGuideLink({ section, className = '' }: { section: string; className?: string }) {
  const kz = useLanguage().lang === 'kz';
  const [guide, setGuide] = useState<Instruction | null>(null);
  useEffect(() => { loadInstructions().then(items => setGuide(items.find(item => item.section === section) ?? null)); }, [section]);
  if (!guide) return null;
  const { title, duration } = inLang(guide, kz ? 'kz' : 'ru');
  return <Link to={`/instructions/${guide.slug}`} className={`ins-guide-link ${className}`}
    onClick={() => track('instruction_open', { guide: guide.slug, from: section })}>
    <PlayCircle size={18} aria-hidden />
    <span>{title}</span>
    {duration && <small>{kz ? 'бейне' : 'видео'} {duration}</small>}
  </Link>;
}
