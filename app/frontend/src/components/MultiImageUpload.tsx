import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2, ImageIcon, CloudUpload, GripVertical, Plus, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ensureBucket,
  resolveImageUrl,
  resolveImageSrc,
  uploadFile,
  isDirectUrl,
} from '@/lib/storage';

// Re-export for backward compatibility
export { resolveImageUrl } from '@/lib/storage';

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface MultiImageUploadProps {
  value?: string;
  onChange: (keys: string) => void;
  folder?: string;
  className?: string;
  maxImages?: number;
  allowUrl?: boolean;
}

interface ImageItem {
  key: string;
  url: string | null;
  uploading?: boolean;
  progress?: number;
  localPreview?: string;
}

export default function MultiImageUpload({
  value = '',
  onChange,
  folder = 'general',
  className = '',
  maxImages = MAX_IMAGES,
  allowUrl = true,
}: MultiImageUploadProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Parse value string into keys and resolve URLs
  useEffect(() => {
    const keys = value ? value.split(',').map(k => k.trim()).filter(Boolean) : [];
    setImages(prev => {
      const prevKeys = prev.filter(i => !i.uploading).map(i => i.key);
      const uploadingItems = prev.filter(i => i.uploading);
      if (JSON.stringify(prevKeys) === JSON.stringify(keys) && uploadingItems.length === 0) return prev;

      const newItems: ImageItem[] = keys.map(key => {
        const existing = prev.find(i => i.key === key);
        if (existing) return existing;
        // Direct URLs don't need resolution
        if (isDirectUrl(key)) {
          return { key, url: key };
        }
        return { key, url: null };
      });

      // Resolve URLs for items without them (non-direct URLs)
      newItems.forEach((item, idx) => {
        if (!item.url && !isDirectUrl(item.key)) {
          resolveImageUrl(item.key).then(url => {
            setImages(curr => curr.map((img, i) => i === idx && img.key === item.key ? { ...img, url } : img));
          });
        }
      });

      return [...newItems, ...uploadingItems];
    });
  }, [value]);

  const emitChange = useCallback((items: ImageItem[]) => {
    const keys = items.filter(i => !i.uploading && i.key).map(i => i.key).join(',');
    onChange(keys);
  }, [onChange]);

  const handleFiles = async (files: File[]) => {
    const currentCount = images.filter(i => !i.uploading).length;
    const available = maxImages - currentCount;
    if (available <= 0) {
      toast.error(`Максимум ${maxImages} изображений`);
      return;
    }

    const filesToUpload = files.slice(0, available);
    if (files.length > available) {
      toast.warning(`Загружено только ${available} из ${files.length} файлов (лимит: ${maxImages})`);
    }

    // Validate files
    const validFiles = filesToUpload.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: не является изображением`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: превышает 5 МБ`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const placeholders: ImageItem[] = validFiles.map(file => ({
      key: `uploading-${Date.now()}-${Math.random()}`,
      url: null,
      uploading: true,
      progress: 0,
      localPreview: URL.createObjectURL(file),
    }));

    setImages(prev => [...prev, ...placeholders]);

    const results = await Promise.all(
      validFiles.map(async (file, idx) => {
        const progressInterval = setInterval(() => {
          setImages(prev => prev.map((img) => {
            if (img.key === placeholders[idx].key) {
              const newProgress = Math.min((img.progress || 0) + Math.random() * 20, 90);
              return { ...img, progress: newProgress };
            }
            return img;
          }));
        }, 300);

        let result: ImageItem | null = null;
        try {
          const uploadResult = await uploadFile(file, folder);
          // Save the permanent download URL if available (never expires),
          // otherwise fall back to the objectKey (requires resolution on display)
          const savedKey = uploadResult.downloadUrl || uploadResult.objectKey;
          result = { key: savedKey, url: uploadResult.downloadUrl };
        } catch (err) {
          console.error('Upload failed:', err);
          toast.error(`Ошибка загрузки ${file.name}. Попробуйте вставить URL.`);
        }

        clearInterval(progressInterval);

        if (placeholders[idx].localPreview) {
          URL.revokeObjectURL(placeholders[idx].localPreview!);
        }

        return { placeholder: placeholders[idx], result };
      })
    );

    setImages(prev => {
      const updated = prev.filter(img => !results.some(r => r.placeholder.key === img.key));
      const successful = results.filter(r => r.result).map(r => r.result!);
      const final = [...updated, ...successful];
      const keys = final.filter(i => !i.uploading && i.key).map(i => i.key).join(',');
      onChange(keys);
      return final;
    });

    const successCount = results.filter(r => r.result).length;
    const failCount = results.length - successCount;
    if (successCount > 0) {
      toast.success(`Загружено ${successCount} ${successCount === 1 ? 'изображение' : 'изображений'}`);
    }
    if (failCount > 0 && allowUrl) {
      setShowUrlInput(true);
    }
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error('Введите URL изображения');
      return;
    }
    if (!isDirectUrl(trimmed)) {
      toast.error('URL должен начинаться с http:// или https://');
      return;
    }

    const currentCount = images.filter(i => !i.uploading).length;
    if (currentCount >= maxImages) {
      toast.error(`Максимум ${maxImages} изображений`);
      return;
    }

    // Add URL directly as an image
    const newItem: ImageItem = { key: trimmed, url: trimmed };
    setImages(prev => {
      const updated = [...prev, newItem];
      emitChange(updated);
      return updated;
    });
    setUrlInput('');
    toast.success('Изображение добавлено по ссылке');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      const updated = prev.filter((_, i) => i !== index);
      emitChange(updated);
      return updated;
    });
  };

  // Drag & drop from file system
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) handleFiles(files);
  };

  // Drag & drop for reordering
  const handleItemDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  };

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleItemDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      setImages(prev => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(dragOverIndex, 0, moved);
        emitChange(updated);
        return updated;
      });
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const fileDragProps = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  const nonUploadingImages = images.filter(i => !i.uploading);
  const uploadingImages = images.filter(i => i.uploading);
  const canAddMore = nonUploadingImages.length + uploadingImages.length < maxImages;

  return (
    <div className={`space-y-3 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Gallery grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img, index) => (
            <div
              key={img.key}
              draggable={!img.uploading}
              onDragStart={e => handleItemDragStart(e, index)}
              onDragOver={e => handleItemDragOver(e, index)}
              onDragEnd={handleItemDragEnd}
              className={`
                relative group aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200
                ${img.uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-400'}
                ${dragIndex === index ? 'opacity-40 scale-95' : ''}
                ${dragOverIndex === index && dragIndex !== index ? 'border-blue-500 ring-2 ring-blue-200 scale-105' : ''}
              `}
            >
              {(img.url || img.localPreview) ? (
                <img
                  src={img.localPreview || img.url || ''}
                  alt=""
                  className={`w-full h-full object-cover transition-all duration-300 ${img.uploading ? 'opacity-50 blur-[1px]' : ''}`}
                />
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-gray-300" />
                </div>
              )}

              {img.uploading && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <div className="w-3/4 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${img.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {!img.uploading && (
                <>
                  <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-grab active:cursor-grabbing">
                    <div className="bg-white/90 backdrop-blur-sm rounded-md p-0.5 shadow-sm">
                      <GripVertical className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/90 hover:bg-red-50 backdrop-blur-sm rounded-md p-0.5 shadow-sm"
                  >
                    <X className="h-3.5 w-3.5 text-red-500" />
                  </button>
                  {index === 0 && (
                    <div className="absolute bottom-1 left-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                      Обложка
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-blue-500 cursor-pointer"
            >
              <Plus className="h-5 w-5" />
              <span className="text-[10px] font-medium">Добавить</span>
            </button>
          )}
        </div>
      )}

      {/* Drop zone (shown when no images) */}
      {images.length === 0 && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`
            w-full h-40 rounded-xl border-2 border-dashed transition-all duration-300 ease-out
            flex flex-col items-center justify-center gap-2 cursor-pointer relative overflow-hidden
            ${isDragOver
              ? 'border-blue-500 bg-blue-50/80 text-blue-600 scale-[1.01] shadow-lg shadow-blue-100/50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gradient-to-b hover:from-blue-50/50 hover:to-transparent text-gray-400 hover:text-blue-500'
            }
          `}
          {...fileDragProps}
        >
          {isDragOver && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-28 h-28 rounded-full border-2 border-blue-300/40 animate-ping" style={{ animationDuration: '2s' }} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full border-2 border-blue-400/30 animate-ping" style={{ animationDuration: '1.5s' }} />
              </div>
            </>
          )}
          <div className="flex flex-col items-center gap-2 relative z-10">
            <div className={`p-3 rounded-2xl transition-all duration-300 ${isDragOver ? 'bg-blue-100 scale-110 -translate-y-1' : 'bg-gray-100'}`}>
              <CloudUpload className={`h-7 w-7 transition-all duration-300 ${isDragOver ? 'text-blue-600 animate-bounce' : ''}`} />
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold block">
                {isDragOver ? 'Отпустите для загрузки' : 'Перетащите изображения сюда'}
              </span>
              {!isDragOver && (
                <span className="text-xs text-gray-400 mt-0.5 block">
                  или <span className="text-blue-500 underline underline-offset-2">выберите файлы</span> · до {maxImages} фото, JPG/PNG/WebP до 5 МБ
                </span>
              )}
            </div>
          </div>
        </button>
      )}

      {/* URL input section */}
      {allowUrl && canAddMore && (
        <div className="space-y-2">
          {showUrlInput ? (
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 text-sm"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
              />
              <Button type="button" size="sm" onClick={handleAddUrl} className="bg-blue-600 hover:bg-blue-700 shrink-0">
                <Link2 className="h-4 w-4 mr-1" /> Добавить
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowUrlInput(false); setUrlInput(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="w-full text-xs text-blue-500 hover:text-blue-600 flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" /> Добавить по URL-ссылке
            </button>
          )}
        </div>
      )}

      {/* File drop overlay when images exist */}
      {images.length > 0 && canAddMore && (
        <div
          className={`
            w-full h-16 rounded-xl border-2 border-dashed transition-all duration-300
            flex items-center justify-center gap-2 cursor-pointer
            ${isDragOver
              ? 'border-blue-500 bg-blue-50 text-blue-600'
              : 'border-gray-200 hover:border-blue-300 text-gray-400 hover:text-blue-500'
            }
          `}
          onClick={() => fileInputRef.current?.click()}
          {...fileDragProps}
        >
          <CloudUpload className={`h-4 w-4 ${isDragOver ? 'animate-bounce' : ''}`} />
          <span className="text-xs font-medium">
            {isDragOver ? 'Отпустите для загрузки' : `Перетащите ещё фото (${nonUploadingImages.length}/${maxImages})`}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Gallery display component for viewing multiple images from comma-separated keys.
 */
export function StorageGallery({ keys, className = '' }: { keys?: string | null; className?: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const urls = useMemo(() => {
    if (!keys) return [];
    const keyList = keys.split(',').map(k => k.trim()).filter(Boolean);
    return keyList.map(key => ({
      key,
      url: isDirectUrl(key) ? key : resolveImageSrc(key),
    }));
  }, [keys]);

  if (urls.length === 0) return null;

  return (
    <>
      <div className={`grid grid-cols-3 sm:grid-cols-4 gap-1.5 ${className}`}>
        {urls.map((item, idx) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSelectedIndex(idx)}
            className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer"
          >
            {item.url ? (
              <img src={item.url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-gray-300" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {selectedIndex !== null && urls[selectedIndex]?.url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedIndex(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-2 text-white transition-colors"
            onClick={() => setSelectedIndex(null)}
          >
            <X className="h-6 w-6" />
          </button>

          {urls.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 rounded-full p-2 text-white transition-colors"
                onClick={e => { e.stopPropagation(); setSelectedIndex(prev => prev !== null ? (prev - 1 + urls.length) % urls.length : 0); }}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 rounded-full p-2 text-white transition-colors"
                onClick={e => { e.stopPropagation(); setSelectedIndex(prev => prev !== null ? (prev + 1) % urls.length : 0); }}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </>
          )}

          <img
            src={urls[selectedIndex].url!}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/20 text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm">
            {selectedIndex + 1} / {urls.length}
          </div>
        </div>
      )}
    </>
  );
}