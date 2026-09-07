export default function AdminLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="mx-auto min-h-[100dvh] w-full max-w-[96rem] px-4 py-12 text-foreground sm:px-7 lg:px-10"
    >
      <p className="font-sans text-sm text-foreground/70">Loading usage aggregates…</p>
      <div
        aria-hidden="true"
        className="mt-8 h-24 animate-pulse border-y border-border-subtle bg-foreground/[0.025] motion-reduce:animate-none"
      />
    </main>
  );
}
