export default function DamAlemPageSkeleton() {
  return (
    <div className="dam-page min-h-[60vh]">
      <div className="dam-skeleton h-9 w-full rounded-none" />
      <div className="dam-skeleton h-[320px] w-full rounded-none sm:h-[380px] lg:h-[420px]" />
      <div className="dam-page-shell w-full space-y-5 px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-2">
              <div className="dam-skeleton h-[4.75rem] w-[4.75rem] rounded-full" />
              <div className="dam-skeleton h-3 w-14 rounded-full" />
            </div>
          ))}
        </div>
        <div className="dam-skeleton h-20 w-full rounded-[22px]" />
        <div className="flex gap-2 overflow-hidden">
          <div className="dam-skeleton h-14 w-40 shrink-0 rounded-2xl" />
          <div className="dam-skeleton h-14 w-36 shrink-0 rounded-2xl" />
          <div className="dam-skeleton h-14 w-32 shrink-0 rounded-2xl" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          <div className="dam-skeleton h-10 w-20 shrink-0 rounded-full" />
          <div className="dam-skeleton h-10 w-24 shrink-0 rounded-full" />
          <div className="dam-skeleton h-10 w-16 shrink-0 rounded-full" />
          <div className="dam-skeleton h-10 w-20 shrink-0 rounded-full" />
        </div>
        <div className="dam-product-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="dam-skeleton aspect-[4/3] w-full rounded-[20px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
