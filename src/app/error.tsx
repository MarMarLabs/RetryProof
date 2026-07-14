"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="fatal-error">
      <div className="status-icon status-icon--fail" aria-hidden="true">!</div>
      <h1>RetryProof could not open this lab.</h1>
      <p>Your workflow was not executed and no external action was performed.</p>
      <button className="button button--primary" onClick={reset}>Try again</button>
    </main>
  );
}
