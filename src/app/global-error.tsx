"use client";

/**
 * Global error boundary.
 *
 * Replaces the whole document when the root layout itself fails, so it must
 * render its own <html> and <body>. Deliberately self-contained: no design
 * system imports, no Radix, no Tailwind classes that depend on the stylesheet
 * having loaded — if the root layout blew up, the stylesheet may not be there
 * either. Inline styles are the right call exactly once, and this is it.
 *
 * The clinic's phone number is hardcoded here for the same reason: this file
 * must not depend on any module that could be the thing that failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.25rem",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#fdfcfa",
          color: "#132238",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.75rem", lineHeight: 1.2 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1.5rem", lineHeight: 1.6, color: "#4c5b6e" }}>
            This is a problem at our end. Please try again, or call the clinic — if you were booking
            an appointment, calling makes sure it is not missed.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: "none",
                border: "none",
                borderRadius: "999px",
                background: "#1d53d8",
                color: "#fff",
                fontSize: "0.9375rem",
                fontWeight: 600,
                padding: "0.75rem 1.5rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>

            <a
              href="tel:+919855123236"
              style={{
                display: "inline-block",
                borderRadius: "999px",
                border: "1px solid #c7d5e4",
                color: "#1f3149",
                fontSize: "0.9375rem",
                fontWeight: 600,
                padding: "0.75rem 1.5rem",
                textDecoration: "none",
              }}
            >
              Call +91 98551 23236
            </a>
          </div>

          {error.digest ? (
            <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#6b7a8d" }}>
              Reference for our team: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
