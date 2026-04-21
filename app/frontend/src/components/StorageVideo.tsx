import { useState, useEffect } from 'react';
import { Video, Loader2 } from 'lucide-react';
import { resolveImageUrl, isDirectUrl } from '@/lib/storage';

interface StorageVideoProps {
  objectKey: string;
  className?: string;
}

export default function StorageVideo({ objectKey, className = '' }: StorageVideoProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!objectKey) return;

    // Direct URLs don't need resolution
    if (isDirectUrl(objectKey)) {
      setUrl(objectKey);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // Use the centralized resolver with retry logic
        const resolved = await resolveImageUrl(objectKey);
        setUrl(resolved || '');
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [objectKey]);

  if (!objectKey) return null;

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg p-4 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={`flex items-center gap-2 bg-gray-100 rounded-lg p-3 text-sm text-gray-500 ${className}`}>
        <Video className="h-4 w-4" /> Видео недоступно
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      preload="metadata"
      className={`w-full rounded-lg max-h-64 ${className}`}
    >
      Ваш браузер не поддерживает воспроизведение видео.
    </video>
  );
}