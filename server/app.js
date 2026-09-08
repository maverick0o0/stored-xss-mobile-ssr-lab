import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStorage } from "./storage.js";
import { isSsrRequest, renderMobileSsrPage } from "./ssr.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, "..");

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createApp(options = {}) {
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(projectRoot, "data", "ads.json");
  const distDirectory = options.distDirectory || path.join(projectRoot, "dist");
  const storage = createStorage(dataFile);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/ads", (_request, response) => {
    response.json(storage.list());
  });

  app.post("/api/ads", (request, response) => {
    const title = cleanString(request.body?.title);
    const category = cleanString(request.body?.category);
    const description = cleanString(request.body?.description);

    if (!title || !category || !description) {
      return response.status(400).json({ error: "نام، دسته‌بندی و توضیحات الزامی هستند." });
    }
    if (title.length > 120 || category.length > 80 || description.length > 5000) {
      return response.status(400).json({ error: "طول یکی از فیلدها بیشتر از حد مجاز است." });
    }

    return response.status(201).json(storage.create({ title, category, description }));
  });

  app.get("/ads/:id", (request, response, next) => {
    const ad = storage.find(request.params.id);
    if (!ad) return response.status(404).send("Ad not found");

    if (isSsrRequest(request.get("user-agent"))) {
      const canonicalUrl = `${request.protocol}://${request.get("host")}${request.originalUrl}`;

      // INTENTIONALLY VULNERABLE: CSP allows 'unsafe-inline' — any injected
      // <script> tag executes without a nonce or hash.  This matches the
      // original finding where divar.ir had script-src 'unsafe-inline'.
      response.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src *"
      );

      // INTENTIONAL DEFECT: No Vary: User-Agent header.
      // The response body differs by User-Agent (SPA shell vs. full SSR), but
      // the server only declares Vary: Accept, Accept-Encoding.  Any shared
      // cache (CDN, corporate proxy) may store the SSR variant and serve it to
      // desktop clients — widening the XSS audience beyond mobile/crawlers.
      // See report addendum (a): "Vary: User-Agent missing".
      response.set("Vary", "Accept, Accept-Encoding");

      return response.type("html").send(renderMobileSsrPage(ad, canonicalUrl));
    }

    // Desktop: serve the React SPA shell (client-rendered, React auto-escapes).
    response.set("Vary", "Accept, Accept-Encoding");
    return response.sendFile(path.join(distDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use(express.static(distDirectory));
  app.use((_request, response, next) => {
    response.sendFile(path.join(distDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  return app;
}
