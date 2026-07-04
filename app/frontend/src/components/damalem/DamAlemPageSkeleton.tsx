export default function DamAlemPageSkeleton() {
  return (
    <div className="dam-page min-h-[60vh]">
      <div className="dam-skeleton dam-hero-media w-full rounded-none" />
      <div className="dam-page-shell w-full space-y-5 px-4 py-5 sm:px-6 lg:px-10">
        <div className="dam-skeleton h-14 w-full rounded-2xl" />
        <div className="flex gap-2 overflow-hidden">
          <div className="dam-skeleton h-10 w-24 shrink-0 rounded-full" />
          <div className="dam-skeleton h-10 w-28 shrink-0 rounded-full" />
          <div className="dam-skeleton h-10 w-20 shrink-0 rounded-full" />
        </div>
        <div className="dam-product-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="dam-skeleton aspect-square w-full rounded-[20px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
