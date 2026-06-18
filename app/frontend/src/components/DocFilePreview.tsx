import { useEffect, useState } from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { isDirectUrl, isPdf, resolveImageUrl } from '@/lib/storage';

interface DocFilePreviewProps {
  /** Stored value — a direct URL or a storage object key. */
  value: string;
  alt?: string;
  className?: string;
}

/**
 * Renders an uploaded document. Images are shown via StorageImg; PDF files
 * are shown as a clickable card that opens the document in a new tab.
 */
export default function DocFilePreview({ value, alt = '', className = '' }: DocFilePreviewProps) {
  const pdf = isPdf(value);
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    isDirectUrl(value) ? value : null
  );

  useEffect(() => {
    if (!pdf || isDirectUrl(value)) {
      if (isDirectUrl(value)) setPdfUrl(value);
      return;
    }
    let alive = true;
    resolveImageUrl(value)
      .then((url) => {
        if (alive) setPdfUrl(url);
      })
      .catch(() => {
        /* keep null — link simply won't open */
      });
    return () => {
      alive = false;
    };
  }, [value, pdf]);

  if (!pdf) {
    return <StorageImg objectKey={value} alt={alt} className={className} />;
  }

  return (
    <a
      href={pdfUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!pdfUrl) e.preventDefault();
        e.stopPropagation();
      }}
      className={`flex flex-col items-center justify-center gap-1 bg-red-50 text-red-600 hover:bg-red-100 transition-colors ${className}`}
      title={alt || 'Открыть PDF'}
    >
      <FileText className="h-7 w-7" />
      <span className="text-[10px] font-semibold inline-flex items-center gap-0.5">
        PDF <ExternalLink className="h-2.5 w-2.5" />
      </span>
    </a>
  );
}
