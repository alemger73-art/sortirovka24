import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader2, Video, CloudUpload, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { ensureBucket, uploadFile } from '@/lib/storage';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FORMATS = '.mp4,.mov,.webm';
const ACCEPTED_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

interface VideoUploadProps {
  value?: string;
  onChange: (objectKey: string) => void;
  folder?: string;
  className?: string;
}

export default function VideoUpload({ value, onChange, folder = 'general', className = '' }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleUpload = useCallback(async (file: File) => {
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error('Поддерживаются только MP4, MOV, WebM');
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast.error('Максимальный размер видео — 50 МБ');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSuccess(false);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 8, 85));
    }, 200);

    try {
      const result = await uploadFile(file, folder);

      clearInterval(progressInterval);
      setUploadProgress(100);

      onChange(result.objectKey);
      setUploadSuccess(true);
      toast.success('Видео загружено');
      setTimeout(() => setUploadSuccess(false), 2000);
    } catch (err) {
      console.error('Video upload error:', err);
      toast.error('Ошибка загрузки видео');
      clearInterval(progressInterval);
    } finally {
      setUploading(false);
    }
  }, [folder, onChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleRemove = () => {
    onChange('');
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FORMATS}
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="relative bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Video className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">{value.split('/').pop()}</p>
            <p className="text-xs text-green-600">Видео загружено ✓</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRemove}>
            <X className="h-4 w-4 text-gray-400" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current <= 0) setIsDragOver(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
            isDragOver ? 'border-blue-400 bg-blue-50' :
            uploading ? 'border-gray-200 bg-gray-50 cursor-wait' :
            'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          {uploading ? (
            <div className="space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
              <p className="text-sm text-gray-500">Загрузка видео... {uploadProgress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : uploadSuccess ? (
            <div className="space-y-1">
              <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto" />
              <p className="text-sm text-green-600 font-medium">Загружено!</p>
            </div>
          ) : (
            <div className="space-y-1">
              <CloudUpload className="h-6 w-6 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-500">Нажмите или перетащите видео</p>
              <p className="text-xs text-gray-400">MP4, MOV, WebM до 50 МБ</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}