import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { taxiApi, type TaxiAddressSuggestion } from '@/lib/taxiApi';
import { Loader2, MapPin, Navigation, Search } from 'lucide-react';

export type TaxiResolvedPoint = {
  lat: number;
  lng: number;
  address: string;
};

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onResolved: (point: TaxiResolvedPoint | null) => void;
  onGps?: () => void;
  loading?: boolean;
  examples: string[];
  accent: 'yellow' | 'gray';
  showGps?: boolean;
};

export default function TaxiAddressInput({
  label,
  value,
  onChange,
  onResolved,
  onGps,
  loading = false,
  examples,
  accent,
  showGps = true,
}: Props) {
  const ring = accent === 'yellow' ? 'focus-visible:ring-yellow-400' : 'focus-visible:ring-gray-400';
  const [suggestions, setSuggestions] = useState<TaxiAddressSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setSuggestLoading(true);
    try {
      const { suggestions: items } = await taxiApi.suggest(trimmed);
      setSuggestions(items);
      setOpen(items.length > 0);
      setActiveIdx(-1);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setSuggestLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(item: TaxiAddressSuggestion) {
    const address = item.full_address || item.address;
    onChange(address);
    onResolved({ lat: item.lat, lng: item.lng, address });
    setOpen(false);
    setSuggestions([]);
  }

  async function searchByText() {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    if (suggestions.length > 0) {
      pick(suggestions[0]);
      return;
    }
    try {
      const loc = await taxiApi.geocode({ address: trimmed });
      if (loc?.lat && loc?.lng) {
        onChange(loc.address);
        onResolved({ lat: loc.lat, lng: loc.lng, address: loc.address });
      }
    } catch {
      onResolved(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIdx >= 0 && suggestions[activeIdx]) {
        pick(suggestions[activeIdx]);
      } else {
        searchByText();
      }
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const busy = loading || suggestLoading;

  return (
    <div className="space-y-2" ref={wrapRef}>
      <label className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <MapPin className={`h-4 w-4 ${accent === 'yellow' ? 'text-yellow-500' : 'text-gray-500'}`} />
        {label}
      </label>
      <div className="relative">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              onResolved(null);
            }}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Улица, дом — начните вводить"
            className={`rounded-xl h-12 flex-1 ${ring}`}
            autoComplete="off"
          />
          {showGps && onGps && (
            <Button
              type="button"
              variant="outline"
              onClick={onGps}
              disabled={loading}
              className="h-12 w-12 shrink-0 rounded-xl p-0"
              title="Моё местоположение"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="button"
            onClick={searchByText}
            disabled={busy || value.trim().length < 2}
            className={`h-12 w-12 shrink-0 rounded-xl p-0 ${accent === 'yellow' ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900' : ''}`}
            title="Найти"
          >
            {busy && !loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            {suggestions.map((item, idx) => (
              <li key={`${item.lat}-${item.lng}-${idx}`}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-yellow-50 transition-colors ${
                    idx === activeIdx ? 'bg-yellow-50' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                >
                  <span className="font-medium text-gray-900">{item.address}</span>
                  {item.full_address && item.full_address !== item.address && (
                    <span className="block text-xs text-gray-500 truncate mt-0.5">{item.full_address}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              onChange(ex);
              onResolved(null);
            }}
            className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-yellow-100 hover:text-gray-900 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
