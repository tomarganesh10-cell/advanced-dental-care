/**
 * Renders a JSON-LD block.
 *
 * The payload is serialised with `<` escaped so a string inside the data can
 * never close the script tag early — the standard injection route for anything
 * rendered into a script element.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
