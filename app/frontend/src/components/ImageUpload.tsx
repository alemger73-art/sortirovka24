import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, X, Loader2, ImageIcon, CheckCircle2, CloudUpload, RefreshCw, Link2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  ensureBucket,
  resolveImageUrl,
  uploadFile,
  isDirectUrl,
  getCachedUrl,
  setCachedUrl,
  clearCachedUrl,
} from '@/lib/storage';

// Re-export for backward compatibility
export { resolveImageUrl } from '@/lib/storage';

interface ImageUploadProps {
  value?: string;
  onChange: (objectKey: string) => void;
  folder?: string;
  className?: string;
  compact?: boolean;
  /** Allow pasting a URL link instead of uploading */
  allowUrl?: boolean;
}

export default function ImageUpload({ value, onChange, folder = 'general', className = '', compact = false, allowUrl = true }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const loadDownloadUrl = useCallback(async (objectKey: string) => {
    if (!objectKey) return;

    // If it's a direct URL, use it directly
    if (isDirectUrl(objectKey)) {
      setDownloadUrl(objectKey);
      return;
    }

    // Check cache first
    const cached = getCachedUrl(objectKey);
    if (cached) {
      setDownloadUrl(cached);
      return;
    }

    setLoadingPreview(true);
    try {
      const url = await resolveImageUrl(objectKey);
      setDownloadUrl(url);
    } catch (err) {
      console.warn('Failed to load image preview:', err);
      setDownloadUrl(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (value) {
      loadDownloadUrl(value);
      // If current value is a URL, show it in URL input
      if (isDirectUrl(value)) {
        setUrlInput(value);
      }
    }
  }, [value, loadDownloadUrl]);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Максимальный размер файла — 5 МБ');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploading(true);
    setUploadProgress(0);
    setUploadSuccess(false);

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 85) { clearInterval(progressInterval); return prev; }
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      const result = await uploadFile(file, folder);

      clearInterval(progressInterval);
      setUploadProgress(100);

      setDownloadUrl(result.downloadUrl);
      // Save the permanent download URL if available (never expires),
      // otherwise fall back to the objectKey (requires resolution on display)
      onChange(result.downloadUrl || result.objectKey);
      setUploadSuccess(true);
      toast.success('Изображение загружено');

      setTimeout(() => setUploadSuccess(false), 2000);
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Ошибка загрузки файла. Попробуйте вставить URL-ссылку на изображение.');
      setPreviewUrl(null);
      clearInterval(progressInterval);
      // Auto-switch to URL mode on upload failure
      if (allowUrl) {
        setMode('url');
      }
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error('Введите URL изображения');
      return;
    }
    if (!isDirectUrl(trimmed)) {
      toast.error('URL должен начинаться с http:// или https://');
      return;
    }
    // Test if the URL is a valid image by trying to load it
    const img = new Image();
    img.onload = () => {
      onChange(trimmed);
      setDownloadUrl(trimmed);
      setPreviewUrl(null);
      toast.success('Изображение добавлено по ссылке');
      setMode('upload');
    };
    img.onerror = () => {
      // Still save the URL even if we can't verify it (might be CORS)
      onChange(trimmed);
      setDownloadUrl(trimmed);
      setPreviewUrl(null);
      toast.success('Ссылка сохранена');
      setMode('upload');
    };
    img.src = trimmed;
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setDownloadUrl(null);
    setUploadProgress(0);
    setUrlInput('');
    onChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const displayUrl = previewUrl || downloadUrl;
  const hasImage = !!value || !!previewUrl;

  const dragProps = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  // URL input mode
  if (mode === 'url' && allowUrl && !hasImage) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2 mb-1">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Загрузить файл
          </button>
        </div>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="flex-1 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUrlSubmit(); } }}
          />
          <Button type="button" size="sm" onClick={handleUrlSubmit} className="bg-blue-600 hover:bg-blue-700 shrink-0">
            <Link2 className="h-4 w-4 mr-1" /> Вставить
          </Button>
        </div>
        <p className="text-xs text-gray-400">Вставьте прямую ссылку на изображение (JPG, PNG, WebP)</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
        {hasImage && displayUrl ? (
          <div className="relative inline-block group animate-in fade-in zoom-in-95 duration-300">
            <img
              src={displayUrl}
              alt="Превью"
              className="w-full max-w-xs h-32 object-cover rounded-xl border border-gray-200 shadow-sm transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {uploading && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div className="w-3/4 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            {uploadSuccess && (
              <div className="absolute inset-0 bg-green-500/20 backdrop-blur-[2px] rounded-xl flex items-center justify-center animate-in fade-in duration-300">
                <CheckCircle2 className="h-8 w-8 text-green-600 animate-in zoom-in-50 duration-300" />
              </div>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 w-7 p-0 bg-white/95 hover:bg-white shadow-md backdrop-blur-sm rounded-lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 w-7 p-0 bg-white/95 hover:bg-red-50 shadow-md backdrop-blur-sm text-red-500 rounded-lg"
                onClick={handleRemove}
                disabled={uploading}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : loadingPreview ? (
          <div className="w-full max-w-xs h-32 rounded-xl border border-dashed border-gray-300 flex items-center justify-center bg-gray-50/50">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Загрузка...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`
                w-full max-w-xs h-32 rounded-xl border-2 border-dashed transition-all duration-300 ease-out
                flex flex-col items-center justify-center gap-1.5 cursor-pointer
                ${isDragOver
                  ? 'border-blue-500 bg-blue-50 text-blue-600 scale-[1.02] shadow-lg shadow-blue-100'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 text-gray-400 hover:text-blue-500'
                }
              `}
              {...dragProps}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <CloudUpload className={`h-6 w-6 transition-transform duration-300 ${isDragOver ? 'scale-110 -translate-y-0.5' : ''}`} />
                  <span className="text-xs font-medium">
                    {isDragOver ? 'Отпустите для загрузки' : 'Перетащите или нажмите'}
                  </span>
                </>
              )}
            </button>
            {allowUrl && (
              <button
                type="button"
                onClick={() => setMode('url')}
                className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
              >
                <Link2 className="h-3 w-3" /> Или вставьте URL-ссылку
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      {hasImage && displayUrl ? (
        <div className="relative group animate-in fade-in zoom-in-95 duration-300">
          <img
            src={displayUrl}
            alt="Превью"
            className="w-full rounded-xl max-h-52 object-cover border border-gray-200 shadow-sm transition-all duration-300 group-hover:shadow-md"
          />
          {/* Hover overlay with actions */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-xl flex items-end justify-center pb-4 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="bg-white/95 hover:bg-white shadow-lg backdrop-blur-sm rounded-lg translate-y-2 group-hover:translate-y-0 transition-all duration-300"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Заменить
            </Button>
            {allowUrl && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="bg-white/95 hover:bg-white shadow-lg backdrop-blur-sm rounded-lg translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-[25ms]"
                onClick={() => { handleRemove(); setMode('url'); }}
                disabled={uploading}
              >
                <Link2 className="h-4 w-4 mr-1.5" /> URL
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="bg-white/95 hover:bg-red-50 text-red-600 shadow-lg backdrop-blur-sm rounded-lg translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-75"
              onClick={handleRemove}
              disabled={uploading}
            >
              <X className="h-4 w-4 mr-1.5" /> Удалить
            </Button>
          </div>
          {/* Upload progress overlay */}
          {uploading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
              <div className="relative">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-700">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
              <div className="w-2/3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 font-medium">Загрузка изображения...</span>
            </div>
          )}
          {/* Success flash */}
          {uploadSuccess && (
            <div className="absolute inset-0 bg-green-500/15 backdrop-blur-[2px] rounded-xl flex items-center justify-center animate-in fade-in duration-300">
              <div className="bg-white/90 rounded-full p-3 shadow-lg animate-in zoom-in-50 duration-500">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
          )}
        </div>
      ) : loadingPreview ? (
        <div className="w-full h-44 rounded-xl border border-dashed border-gray-300 flex items-center justify-center bg-gray-50/50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="text-sm text-gray-400">Загрузка превью...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`
              w-full h-44 rounded-xl border-2 border-dashed transition-all duration-300 ease-out
              flex flex-col items-center justify-center gap-3 cursor-pointer relative overflow-hidden
              ${isDragOver
                ? 'border-blue-500 bg-blue-50/80 text-blue-600 scale-[1.02] shadow-xl shadow-blue-100/50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gradient-to-b hover:from-blue-50/50 hover:to-transparent text-gray-400 hover:text-blue-500'
              }
            `}
            {...dragProps}
          >
            {/* Animated background rings on drag */}
            {isDragOver && (
              <>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-32 rounded-full border-2 border-blue-300/40 animate-ping" style={{ animationDuration: '2s' }} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-20 h-20 rounded-full border-2 border-blue-400/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                </div>
              </>
            )}
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm font-medium">Загрузка...</span>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 relative z-10">
                <div className={`
                  p-3 rounded-2xl transition-all duration-300
                  ${isDragOver
                    ? 'bg-blue-100 scale-110 -translate-y-1'
                    : 'bg-gray-100 group-hover:bg-blue-100'
                  }
                `}>
                  <CloudUpload className={`h-7 w-7 transition-all duration-300 ${isDragOver ? 'text-blue-600 animate-bounce' : ''}`} />
                </div>
                <div className="text-center">
                  <span className="text-sm font-semibold block">
                    {isDragOver ? 'Отпустите для загрузки' : 'Перетащите изображение сюда'}
                  </span>
                  {!isDragOver && (
                    <span className="text-xs text-gray-400 mt-0.5 block">
                      или <span className="text-blue-500 underline underline-offset-2">выберите файл</span> · JPG, PNG, WebP до 5 МБ
                    </span>
                  )}
                </div>
              </div>
            )}
          </button>
          {allowUrl && (
            <button
              type="button"
              onClick={() => setMode('url')}
              className="w-full text-xs text-blue-500 hover:text-blue-600 flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" /> Или вставьте URL-ссылку на изображение
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hook-friendly image component that resolves object_key to URL automatically.
 * Supports direct URLs (http/https) and storage object keys.
 */
export function StorageImage({ objectKey, alt = '', className = '' }: { objectKey?: string | null; alt?: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadUrl = useCallback(async (key: string) => {
    if (!key) return;

    // Direct URL — no resolution needed
    if (isDirectUrl(key)) {
      setUrl(key);
      setLoading(false);
      setError(false);
      return;
    }

    // Check cache first
    const cached = getCachedUrl(key);
    if (cached) {
      setUrl(cached);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    setImageLoaded(false);

    try {
      const resolved = await resolveImageUrl(key);
      if (!mountedRef.current) return;
      if (resolved) {
        setUrl(resolved);
        setError(false);
      } else {
        setUrl(null);
        setError(true);
      }
    } catch {
      if (!mountedRef.current) return;
      setUrl(null);
      setError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!objectKey) {
      setUrl(null);
      setLoading(false);
      setError(false);
      return;
    }
    loadUrl(objectKey);
  }, [objectKey, loadUrl, retryCount]);

  const handleRetry = useCallback(() => {
    if (objectKey && !isDirectUrl(objectKey)) {
      clearCachedUrl(objectKey);
    }
    setRetryCount(c => c + 1);
  }, [objectKey]);

  const handleImgError = useCallback(() => {
    if (objectKey && !isDirectUrl(objectKey)) {
      clearCachedUrl(objectKey);
    }
    setImageLoaded(false);
    setError(true);
  }, [objectKey]);

  if (loading) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || (!url && objectKey)) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
        <button
          type="button"
          onClick={handleRetry}
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors p-2"
          title="Нажмите для повторной загрузки"
        >
          <RefreshCw className="h-5 w-5" />
          <span className="text-[10px] font-medium">Повторить</span>
        </button>
      </div>
    );
  }

  if (!url) {
    return (
      <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
        <ImageIcon className="h-6 w-6 text-gray-300" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!imageLoaded && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-gray-300" />
        </div>
      )}
      <img
        src={url}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setImageLoaded(true)}
        onError={handleImgError}
      />
    </div>
  );
}