/** Frosted glass panel with a snow cap on its top edge. `tone` picks the ice-blue or the burgundy festive glass. */
import { ElementType, ReactNode } from 'react';

type Tone = 'ice' | 'berry' | 'night';

export default function FrostedCard({ as: Tag = 'div', tone = 'night', className = '', children, ...rest }: {
  as?: ElementType; tone?: Tone; className?: string; children: ReactNode; [key: string]: unknown;
}) {
  return <Tag className={`ny-frost ny-frost-${tone} ${className}`.trim()} {...rest}>{children}</Tag>;
}
