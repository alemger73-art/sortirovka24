export default function DamAlemPageSkeleton() {
  return (
    <div className="dam-page min-h-[60vh] bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border-b border-gray-100">
          <div className="h-9 w-full dam-skeleton rounded-none" />
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 md:py-4 gap-4">
            <div className="dam-skeleton h-8 w-8 rounded-lg" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="dam-skeleton h-6 w-40 rounded-full" />
              <div className="dam-skeleton h-2.5 w-28 rounded-full" />
            </div>
            <div className="dam-skeleton h-8 w-8 rounded-lg" />
          </div>
          <div className="h-10 w-full dam-skeleton rounded-none" />
        </div>
        <div className="px-4 sm:px-6 lg:px-8 py-4 md:py-6 space-y-6">
          <div className="dam-skeleton h-48 sm:h-56 md:h-64 w-full rounded-2xl md:rounded-3xl" />
          <div className="flex gap-3 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex shrink-0 flex-col items-center gap-2">
                <div className="dam-skeleton h-[4.25rem] w-[4.25rem] rounded-2xl" />
                <div className="dam-skeleton h-3 w-14 rounded-full" />
              </div>
            ))}
          </div>
          <div className="dam-product-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white border border-gray-100">
                <div className="dam-skeleton aspect-square w-full rounded-none" />
                <div className="p-3 space-y-2">
                  <div className="dam-skeleton h-4 w-3/4 rounded-full" />
                  <div className="dam-skeleton h-4 w-1/3 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
