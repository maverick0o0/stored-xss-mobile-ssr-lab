import { useEffect, useMemo, useState } from "react";

const emptyForm = { title: "", description: "", category: "" };

const SAMPLE_PAYLOAD_SCRIPT = `</script><script>alert('Stored XSS via JSON-LD breakout')</script>`;
const SAMPLE_PAYLOAD_IMG = `</script><img src=x onerror=alert('Stored XSS via JSON-LD breakout')>`;

const CATEGORIES = [
  "کالای دیجیتال",
  "خودرو",
  "املاک",
  "خدمات",
  "لوازم خانگی",
  "سایر"
];

function currentAdId() {
  const match = window.location.pathname.match(/^\/ads\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [ads, setAds] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const adId = currentAdId();
  const selectedAd = useMemo(
    () => ads.find((ad) => ad.id === adId),
    [ads, adId]
  );

  useEffect(() => {
    fetch("/api/ads")
      .then(async (response) => {
        if (!response.ok) throw new Error("دریافت آگهی‌ها ناموفق بود.");
        return response.json();
      })
      .then(setAds)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  function updateField(event) {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value
    }));
  }

  function fillPayload(payload) {
    setForm((previous) => ({
      ...previous,
      description: payload
    }));
  }

  async function submitAd(event) {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "ثبت آگهی ناموفق بود.");
      return;
    }

    window.location.assign(`/ads/${encodeURIComponent(payload.id)}`);
  }

  if (adId) {
    return (
      <main className="page-shell">
        <header className="hero compact">
          <div>
            <span className="eyebrow">Stored XSS Training Lab</span>
            <h1>جزئیات آگهی</h1>
          </div>
          <span className="mode safe">React SPA · امن ✓</span>
        </header>

        {loading && <p className="status">در حال بارگذاری…</p>}
        {!loading && !selectedAd && (
          <section className="card empty-state">
            <h2>آگهی پیدا نشد</h2>
            <a className="button-link" href="/">بازگشت</a>
          </section>
        )}
        {selectedAd && (
          <article className="card ad-detail">
            <span className="category">{selectedAd.category}</span>
            <h2>{selectedAd.title}</h2>
            <p className="description">{selectedAd.description}</p>
            <p className="hint safe-hint">
              ✅ این مقدار توسط React به‌صورت متن render شده و HTML آن اجرا نمی‌شود.
            </p>
            <a className="button-link secondary" href="/">همه آگهی‌ها</a>
          </article>
        )}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">Stored XSS Training Lab</span>
          <h1>آگهی‌خانه</h1>
        </div>
        <span className="mode safe">React SPA · امن ✓</span>
      </header>

      <section className="grid">
        <form className="card form-card" onSubmit={submitAd}>
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>ثبت آگهی</h2>
              <p>هر سه فیلد الزامی هستند.</p>
            </div>
          </div>

          <label>
            نام آگهی
            <input
              required
              maxLength="120"
              name="title"
              value={form.title}
              onChange={updateField}
              placeholder="مثلاً لپ‌تاپ دست دوم"
            />
          </label>

          <label>
            دسته‌بندی
            <select
              required
              name="category"
              value={form.category}
              onChange={updateField}
            >
              <option value="">انتخاب دسته‌بندی…</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label>
            توضیحات
            <textarea
              required
              maxLength="5000"
              rows="7"
              name="description"
              value={form.description}
              onChange={updateField}
              placeholder="توضیحات آگهی یا payload آزمایشی…"
            />
          </label>

          <div className="payload-buttons">
            <button
              type="button"
              className="fill-payload-btn"
              onClick={() => fillPayload(SAMPLE_PAYLOAD_SCRIPT)}
            >
              🎯 پی‌لود اسکریپت (توصیه‌شده)
            </button>
            <button
              type="button"
              className="fill-payload-btn secondary-payload-btn"
              onClick={() => fillPayload(SAMPLE_PAYLOAD_IMG)}
            >
              🖼️ پی‌لود تگ img
            </button>
          </div>


          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit">ثبت و مشاهده آگهی</button>
        </form>

        <section className="card list-card">
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>آگهی‌های ثبت‌شده</h2>
              <p>{ads.length} مورد</p>
            </div>
          </div>

          {loading && <p className="status">در حال بارگذاری…</p>}
          {!loading && ads.length === 0 && (
            <p className="empty">هنوز آگهی‌ای ثبت نشده است.</p>
          )}
          <div className="ad-list">
            {ads.map((ad) => (
              <a className="ad-row" href={`/ads/${encodeURIComponent(ad.id)}`} key={ad.id}>
                <div>
                  <strong>{ad.title}</strong>
                  <span>{ad.category}</span>
                </div>
                <span aria-hidden="true">←</span>
              </a>
            ))}
          </div>
        </section>
      </section>

      <footer>
        ⚠️ عمداً آسیب‌پذیر · فقط برای آموزش و اجرای محلی · از قرار دادن روی شبکه عمومی خودداری کنید
      </footer>
    </main>
  );
}
