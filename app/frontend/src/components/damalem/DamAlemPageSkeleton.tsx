export default function DamAlemPageSkeleton() {
  return (
    <div className="dam-page min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100">
          <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_auto_1fr_auto] items-center px-4 sm:px-6 lg:px-8 py-3 gap-3">
            <div className="dam-skeleton h-10 w-10 rounded-xl" />
            <div className="space-y-1.5">
              <div className="dam-skeleton h-5 w-32 rounded-full" />
              <div className="dam-skeleton h-2.5 w-24 rounded-full" />
            </div>
            <div className="dam-skeleton sm:order-last h-10 w-12 rounded-xl" />
            <div className="dam-skeleton order-last sm:order-none col-span-3 sm:col-span-1 h-11 rounded-xl" />
          </div>
          <div className="h-10 w-full dam-skeleton rounded-none opacity-60" />
        </div>
        <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-5">
          <div className="dam-skeleton h-20 w-full rounded-2xl" />
          <div className="flex gap-2 overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="dam-skeleton h-10 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="space-y-2">
            <div className="dam-skeleton h-3 w-20 rounded-full" />
            <div className="dam-skeleton h-7 w-40 rounded-full" />
          </div>
          <div className="dam-product-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white border border-gray-100">
                <div className="dam-skeleton aspect-[4/3] w-full rounded-none" />
                <div className="p-3 space-y-2">
                  <div className="dam-skeleton h-4 w-3/4 rounded-full" />
                  <div className="dam-skeleton h-3 w-full rounded-full" />
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
