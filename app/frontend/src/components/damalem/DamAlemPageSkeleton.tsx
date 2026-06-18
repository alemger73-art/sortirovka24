export default function DamAlemPageSkeleton() {
  return (
    <div className="dam-page min-h-[60vh] px-4 py-6 space-y-4 max-w-lg mx-auto">
      <div className="dam-skeleton h-48 w-full rounded-[28px]" />
      <div className="dam-skeleton h-12 w-full" />
      <div className="flex gap-2">
        <div className="dam-skeleton h-10 w-24 rounded-full" />
        <div className="dam-skeleton h-10 w-28 rounded-full" />
        <div className="dam-skeleton h-10 w-20 rounded-full" />
      </div>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="dam-skeleton h-24 w-full" />
      ))}
    </div>
  );
}
