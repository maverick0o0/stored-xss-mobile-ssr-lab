import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mobile browsers that receive the SSR variant (matches the original report).
const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i;

// Crawlers and link-preview bots that also receive the SSR variant.
// Per the original finding: Googlebot, bingbot, facebookexternalhit, TelegramBot,
// WhatsApp all received the server-rendered page with raw JSON-LD.
const crawlerUserAgent =
  /Googlebot|bingbot|Slurp|DuckDuckBot|facebookexternalhit|Twitterbot|TelegramBot|WhatsApp|LinkedInBot|Discordbot|Applebot/i;

/**
 * Determines whether the request should receive the server-side-rendered (SSR)
 * variant instead of the React SPA shell.
 *
 * In the original vulnerability, mobile browsers and crawlers/link-preview bots
 * received a fully server-rendered page whose JSON-LD <script> block contained
 * unescaped user input — creating a stored XSS sink.  Desktop browsers received
 * a React SPA shell where React's auto-escaping kept the description safe.
 */
export function isSsrRequest(userAgent = "") {
  return mobileUserAgent.test(userAgent) || crawlerUserAgent.test(userAgent);
}

/**
 * Safely JSON-serializes a value for embedding inside an HTML <script> element.
 * Escapes <, >, and & so that the browser's HTML parser cannot be tricked into
 * closing the script block prematurely.
 *
 * This is what a CORRECT implementation looks like.  The vulnerable function
 * below intentionally omits this step for the `description` field.
 */
function safeJsonString(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => ({
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026"
  })[character]);
}

/**
 * INTENTIONALLY VULNERABLE JSON-LD SERIALIZER
 *
 * `name` and `category` are safely escaped (safeJsonString).
 * `description` uses raw JSON.stringify — which does NOT escape <, >, or &.
 * A stored </script> sequence in the description therefore terminates the
 * JSON-LD <script> block during HTML parsing, and the remaining payload
 * becomes live markup on the page.
 *
 * Combined with the CSP that allows 'unsafe-inline' scripts (see app.js),
 * this is a direct stored XSS.
 */
export function serializeVulnerableJsonLd(ad, canonicalUrl) {
  return `{"@context":"https://schema.org","@type":"Product","name":${safeJsonString(ad.title)},"category":${safeJsonString(ad.category)},"description":${JSON.stringify(ad.description)},"url":${safeJsonString(canonicalUrl)}}`;
}

function MobileAd({ ad }) {
  return React.createElement(
    "main",
    { className: "ssr-shell" },
    React.createElement(
      "header",
      { className: "ssr-header" },
      React.createElement(
        "div",
        null,
        React.createElement("span", { className: "eyebrow" }, "Stored XSS Training Lab"),
        React.createElement("h1", null, "جزئیات آگهی")
      ),
      React.createElement("span", { className: "mode vulnerable" }, "SSR · آسیب‌پذیر")
    ),
    React.createElement(
      "div",
      { className: "warning" },
      "⚠️ این صفحه عمداً آسیب‌پذیر است. سورس صفحه را مشاهده کنید — JSON-LD بدون escape داخل ",
      React.createElement("code", null, "<script type=\"application/ld+json\">"),
      " قرار گرفته."
    ),
    React.createElement(
      "article",
      { className: "card" },
      React.createElement("span", { className: "category" }, ad.category),
      React.createElement("h2", null, ad.title),
      React.createElement("p", { className: "description" }, ad.description),
      React.createElement(
        "p",
        { className: "hint" },
        "بدنه با React امن render شده؛ sink آسیب‌پذیر، JSON-LD داخل ",
        React.createElement("code", null, "<head>"),
        " صفحه است. ",
        React.createElement("strong", null, "View Page Source"),
        " را بزنید و ",
        React.createElement("code", null, "application/ld+json"),
        " را پیدا کنید."
      ),
      React.createElement("a", { className: "button", href: "/" }, "بازگشت به لیست آگهی‌ها")
    )
  );
}

/**
 * Renders the full SSR HTML page for mobile/crawler clients.
 *
 * Notable intentional defects (matching the original report):
 *
 * 1. JSON-LD description is not HTML-safe escaped → stored XSS via </script> breakout.
 * 2. CSP allows 'unsafe-inline' → injected <script> executes without nonce/hash.
 * 3. og:description contains the raw description in a meta content="" attribute
 *    (secondary reflection, but " is JSON-escaped by JSON.stringify so the meta
 *    attribute itself does not break — the primary vector is JSON-LD).
 * 4. No Vary: User-Agent header (set in app.js) → cache poisoning risk.
 */
export function renderMobileSsrPage(ad, canonicalUrl) {
  const body = renderToStaticMarkup(React.createElement(MobileAd, { ad }));
  const jsonLd = serializeVulnerableJsonLd(ad, canonicalUrl);

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(ad.title)} · لابراتوار</title>
    <meta name="description" content="${escapeHtml(ad.description.slice(0, 160))}">
    <meta property="og:title" content="${escapeHtml(ad.title)}">
    <meta property="og:description" content="${escapeHtml(ad.description.slice(0, 300))}">
    <meta property="og:type" content="product">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta name="twitter:title" content="${escapeHtml(ad.title)}">
    <meta name="twitter:description" content="${escapeHtml(ad.description.slice(0, 200))}">
    <link rel="stylesheet" href="/ssr.css">
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body data-render-mode="mobile-ssr">${body}</body>
</html>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}
