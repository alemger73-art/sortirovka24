export default function DamAlemPageSkeleton() {
  return (
    <div className="dam-page min-h-[60vh]">
      <div className="dam-skeleton h-9 w-full rounded-none" />
      <div className="dam-page-shell w-full space-y-4 px-4 py-4 sm:px-6 lg:px-10">
        <div className="dam-skeleton h-[7.5rem] w-full rounded-[1.25rem]" />
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
