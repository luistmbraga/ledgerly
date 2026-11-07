export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-8 md:px-8">
      <div className="h-8 w-48 rounded bg-stone-200" />
      <div className="mt-2 h-4 w-72 rounded bg-stone-100" />
      <div className="mt-6 h-20 rounded-md bg-stone-100" />
      <div className="mt-6 h-32 rounded-md bg-stone-100" />
      <div className="mt-6 h-32 rounded-md bg-stone-100" />
    </div>
  );
}
