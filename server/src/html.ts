export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Minimal server-rendered page shell. No client-side JavaScript. */
export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Atlas</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         max-width: 42rem; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; }
  h1 { font-size: 1.6rem; }
  code { background: rgb(127 127 127 / 0.15); padding: .1rem .3rem; border-radius: 4px; }
  .box { border: 1px solid rgb(127 127 127 / 0.4); border-radius: 10px; padding: 1rem; }
  .muted { opacity: .75; }
  ul { padding-left: 1.2rem; }
  a { color: inherit; }
  button { font: inherit; padding: .5rem .9rem; border-radius: 8px;
           border: 1px solid rgb(127 127 127 / 0.5); background: transparent; cursor: pointer; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
