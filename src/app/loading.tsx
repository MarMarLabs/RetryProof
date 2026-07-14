export default function Loading() {
  return (
    <main className="app-loading" aria-live="polite" aria-busy="true">
      <div className="brand-mark" aria-hidden="true">RP</div>
      <p>Preparing the flight lab…</p>
    </main>
  );
}
