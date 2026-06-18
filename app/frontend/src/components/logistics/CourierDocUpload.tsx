import { useRef, useState } from 'react';
import { Bike, Camera, Car, CheckCircle2, FileText, Footprints, Loader2, Upload } from 'lucide-react';
import { uploadFile, resolveImageSrc } from '@/lib/storage';
import StorageImg from '@/components/StorageImg';

type DocKind = 'photo' | 'id' | 'vehicle';

const LABELS: Record<DocKind, { title: string; hint: string; icon: typeof Camera }> = {
  photo: { title: 'Ваше фото', hint: 'Лицо хорошо видно', icon: Camera },
  id: { title: 'Удостоверение личности', hint: 'Лицевая сторона УД / паспорт', icon: FileText },
  vehicle: { title: 'Фото транспорта', hint: 'Велосипед или авто с номером', icon: Bike },
};

export type CourierDocField = 'photo_url' | 'id_photo_url' | 'vehicle_photo_url';

type Props = {
  photoUrl?: string;
  idUrl?: string;
  vehicleUrl?: string;
  vehicleType?: string;
  onChange: (field: CourierDocField, value: string) => void;
  readOnly?: boolean;
};

export default function CourierDocUpload({
  photoUrl,
  idUrl,
  vehicleUrl,
  vehicleType = 'bike',
  onChange,
  readOnly,
}: Props) {
  const [uploading, setUploading] = useState<DocKind | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const vehicleRef = useRef<HTMLInputElement>(null);
  const refs: Record<DocKind, React.RefObject<HTMLInputElement>> = {
    photo: photoRef,
    id: idRef,
    vehicle: vehicleRef,
  };

  const values: Record<DocKind, string | undefined> = {
    photo: photoUrl,
    id: idUrl,
    vehicle: vehicleUrl,
  };

  const fieldMap: Record<DocKind, CourierDocField> = {
    photo: 'photo_url',
    id: 'id_photo_url',
    vehicle: 'vehicle_photo_url',
  };

  const kinds: DocKind[] = vehicleType === 'foot' ? ['photo', 'id'] : ['photo', 'id', 'vehicle'];

  async function handleFile(kind: DocKind, file: File) {
    setUploading(kind);
    try {
      const { objectKey } = await uploadFile(file, 'courier-documents');
      onChange(fieldMap[kind], objectKey);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {kinds.map((kind) => {
        const { title, hint, icon: Icon } = LABELS[kind];
        const val = values[kind];
        const src = val ? resolveImageSrc(val) : '';
        const VehicleIcon = vehicleType === 'car' ? Car : vehicleType === 'foot' ? Footprints : Bike;
        const DisplayIcon = kind === 'vehicle' ? VehicleIcon : Icon;
        return (
          <div key={kind} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <DisplayIcon className="h-4 w-4 text-orange-600" />
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
                  className="w-full py-2 rounded-xl text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-60"
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
