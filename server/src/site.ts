import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

/**
 * The marketing site is five hand-written files at the repository root. They
 * are read once at startup and served from memory, so the server only exposes
 * those five paths and never the rest of the directory (server code, .env,
 * migrations, docs).
 *
 * SITE_ROOT resolves to the repository root from server/src/site.ts.
 */
const SITE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const HTML = "text/html; charset=utf-8";

const SITE_FILES: ReadonlyArray<{
  urlPath: string;
  file: string;
  contentType: string;
}> = [
  { urlPath: "/", file: "index.html", contentType: HTML },
  { urlPath: "/index.html", file: "index.html", contentType: HTML },
  { urlPath: "/download.html", file: "download.html", contentType: HTML },
  { urlPath: "/signin.html", file: "signin.html", contentType: HTML },
  { urlPath: "/style.css", file: "style.css", contentType: "text/css; charset=utf-8" },
  {
    urlPath: "/script.js",
    file: "script.js",
    contentType: "text/javascript; charset=utf-8",
  },
];

export async function registerSite(app: FastifyInstance): Promise<void> {
  const loaded = await Promise.all(
    SITE_FILES.map(async (entry) => ({
      ...entry,
      body: await readFile(path.join(SITE_ROOT, entry.file), "utf8"),
    })),
  );

  for (const entry of loaded) {
    app.get(entry.urlPath, async (_request, reply) => {
      return reply
        .header("cache-control", "no-cache")
        .type(entry.contentType)
        .send(entry.body);
    });
  }
}
