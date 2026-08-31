export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">This module hasn't been built yet.</p>
    </div>
  );
}
