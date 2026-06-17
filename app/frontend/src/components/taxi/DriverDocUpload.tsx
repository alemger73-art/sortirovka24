import { useRef, useState } from 'react';
import { Camera, Car, CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { uploadFile, resolveImageSrc } from '@/lib/storage';
import StorageImg from '@/components/StorageImg';

type DocKind = 'photo' | 'license' | 'tech_passport' | 'car';

const LABELS: Record<DocKind, { title: string; hint: string; icon: typeof Camera }> = {
  photo: { title: 'Ваше фото', hint: 'Лицо хорошо видно', icon: Camera },
  license: { title: 'Водительские права', hint: 'Обе стороны или разворот', icon: FileText },
  tech_passport: { title: 'Техпаспорт авто', hint: 'СТС / техпаспорт', icon: FileText },
  car: { title: 'Фото автомобиля', hint: 'Машина с номером', icon: Car },
};

export type DriverDocField =
  | 'photo_url'
  | 'license_photo_url'
  | 'tech_passport_photo_url'
  | 'car_photo_url';

type Props = {
  photoUrl?: string;
  licenseUrl?: string;
  techPassportUrl?: string;
  carPhotoUrl?: string;
  onChange: (field: DriverDocField, value: string) => void;
  readOnly?: boolean;
};

export default function DriverDocUpload({
  photoUrl,
  licenseUrl,
  techPassportUrl,
  carPhotoUrl,
  onChange,
  readOnly,
}: Props) {
  const [uploading, setUploading] = useState<DocKind | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const licenseRef = useRef<HTMLInputElement>(null);
  const techRef = useRef<HTMLInputElement>(null);
  const carRef = useRef<HTMLInputElement>(null);
  const refs: Record<DocKind, React.RefObject<HTMLInputElement>> = {
    photo: photoRef,
    license: licenseRef,
    tech_passport: techRef,
    car: carRef,
  };

  const values: Record<DocKind, string | undefined> = {
    photo: photoUrl,
    license: licenseUrl,
    tech_passport: techPassportUrl,
    car: carPhotoUrl,
  };

  const fieldMap: Record<DocKind, DriverDocField> = {
    photo: 'photo_url',
    license: 'license_photo_url',
    tech_passport: 'tech_passport_photo_url',
    car: 'car_photo_url',
  };

  async function handleFile(kind: DocKind, file: File) {
    setUploading(kind);
    try {
      const { objectKey } = await uploadFile(file, 'taxi-documents');
      onChange(fieldMap[kind], objectKey);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(Object.keys(LABELS) as DocKind[]).map((kind) => {
        const { title, hint, icon: Icon } = LABELS[kind];
        const val = values[kind];
        const src = val ? resolveImageSrc(val) : '';
        return (
          <div key={kind} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Icon className="h-4 w-4 text-yellow-600" />
              {title}
            </div>
            <p className="text-xs text-gray-500">{hint}</p>
            <div className="relative aspect-[4/3] rounded-xl bg-white border border-dashed border-gray-300 overflow-hidden flex items-center justify-center">
              {src ? (
                <StorageImg src={val!} alt={title} className="h-full w-full object-cover" />
              ) : (
                <Upload className="h-8 w-8 text-gray-300" />
              )}
              {val && <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-green-500 bg-white rounded-full" />}
            </div>
            {!readOnly && (
              <>
                <input
                  ref={refs[kind]}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(kind, f);
                  }}
                />
                <button
                  type="button"
                  disabled={uploading === kind}
                  onClick={() => refs[kind].current?.click()}
                  className="w-full py-2 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {uploading === kind ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : val ? 'Заменить' : 'Загрузить'}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
