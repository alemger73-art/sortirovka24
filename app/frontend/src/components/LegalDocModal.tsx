import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Section = { heading: string; body: string };

type Props = {
  open: boolean;
  title: string;
  updated: string;
  sections: Section[];
  onClose: () => void;
  onAccept: () => void;
  acceptLabel?: string;
};

export default function LegalDocModal({
  open,
  title,
  updated,
  sections,
  onClose,
  onAccept,
  acceptLabel = "Я прочитал(а) и согласен(на)",
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  useEffect(() => {
    if (!open) {
      setScrolledToEnd(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
      setScrolledToEnd(atEnd);
    };
    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Обновлено: {updated}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {sections.map((s) => (
            <div key={s.heading}>
              <h3 className="font-semibold text-gray-900 dark:text-white">{s.heading}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          {!scrolledToEnd ? (
            <p className="mb-3 text-center text-xs text-amber-600 dark:text-amber-400">
              Прокрутите текст до конца, чтобы принять
            </p>
          ) : null}
          <button
            type="button"
            disabled={!scrolledToEnd}
            onClick={() => {
              onAccept();
              onClose();
            }}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
