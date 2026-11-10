import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader2, Video, CloudUpload, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadVideo } from '@/lib/storage';
import { formatPublicText } from '@/i18n/publicLocale';

const ACCEPTED_FORMATS = '.mp4,.mov,.webm';
const ACCEPTED_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

interface VideoUploadProps {
  value?: string;
  onChange: (objectKey: string) => void;
  folder?: string;
  className?: string;
  /** Size limit in MB (the server takes videos up to 90 MB). */
  maxMb?: number;
  /** Longest allowed video; read in the browser from the file's metadata. */
  maxSeconds?: number;
  /** Open the camera right away on a phone; off — the person can also pick a saved video. */
  camera?: boolean;
}

/** Duration in seconds from a hidden <video>; 0 when the browser cannot read this file's metadata. */
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (seconds: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(seconds) ? seconds : 0); };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(0);
    video.src = url;
  });
}

export default function VideoUpload({ value, onChange, folder = 'general', className = '', maxMb = 50, maxSeconds, camera = true }: VideoUploadProps) {
  const { t: publicT } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleUpload = useCallback(async (file: File) => {
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error(publicT("public.VideoUpload.text363"));
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(formatPublicText(publicT, "public.VideoUpload.text364", { v0: maxMb }));
      return;
    }
    if (maxSeconds && (await videoDuration(file)) > maxSeconds + 1) {
      toast.error(formatPublicText(publicT, "public.VideoUpload.tooLong", { v0: maxSeconds }));
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSuccess(false);

    try {
      const objectKey = await uploadVideo(file, folder, setUploadProgress);
      setUploadProgress(100);

      onChange(objectKey);
      setUploadSuccess(true);
      toast.success(publicT("public.VideoUpload.text365"));
      setTimeout(() => setUploadSuccess(false), 2000);
    } catch (err) {
      console.error('Video upload error:', err);
      toast.error(publicT("public.VideoUpload.text366"));
    } finally {
      setUploading(false);
    }
  }, [folder, onChange, publicT, maxMb, maxSeconds]);

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
        capture={camera ? 'environment' : undefined}
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
            <p className="text-xs text-green-600">{publicT("public.VideoUpload.text367")}</p>
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
              <p className="text-sm text-gray-500">{publicT("public.VideoUpload.text368")} {uploadProgress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : uploadSuccess ? (
            <div className="space-y-1">
              <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto" />
              <p className="text-sm text-green-600 font-medium">{publicT("public.VideoUpload.text369")}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <CloudUpload className="h-6 w-6 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-500">{publicT("public.VideoUpload.text370")}</p>
              <p className="text-xs text-gray-400">{formatPublicText(publicT, "public.VideoUpload.text371", { v0: maxMb })}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}