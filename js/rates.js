document.addEventListener("DOMContentLoaded", () => {
  const FRED_API_KEY = "dcc865cd79fab774a29ff8469d345622";

  // Use official FRED series IDs
  // 30Y fixed: MORTGAGE30US, 15Y fixed: MORTGAGE15US (Freddie Mac PMMS via FRED)
  // 10Y treasury: DGS10
  // Note: Freddie Mac ARM series were discontinued in Nov 2022, so we will show N/A for ARM.
  const SERIES = {
    mortgage30: "MORTGAGE30US",
    mortgage15: "MORTGAGE15US",
    treasury10: "DGS10"
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setInputValue(id, value) {
    const el = $(id);
    if (!el) return;

    // Only overwrite if blank OR explicitly allowed
    const allowAutofill = el.dataset.autofill === "true";
    if (allowAutofill || String(el.value || "").trim() === "") {
      el.value = value;
    }
  }

  function buildFredUrl(seriesId, { limit = 1, sortOrder = "desc" } = {}) {
    const base = "https://api.stlouisfed.org/fred/series/observations";
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: FRED_API_KEY,
      file_type: "json",
      sort_order: sortOrder,
      limit: String(limit)
    });
    return `${base}?${params.toString()}`;
  }

  async function fetchJsonWithFallback(url) {
    // Try direct first (may fail due to CORS), then try public CORS fallbacks.
    const attempts = [
      url,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`
      // Keep cors-anywhere LAST because it often requires manual enabling
      // `https://cors-anywhere.herokuapp.com/${url}`
    ];

    let lastErr = null;

    for (const attemptUrl of attempts) {
      try {
        const res = await fetch(attemptUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("All fetch attempts failed.");
  }

  function pickLatestNumericObservation(observations) {
    if (!Array.isArray(observations)) return null;
    for (const obs of observations) {
      const v = obs && obs.value;
      const num = Number(v);
      if (v !== "." && Number.isFinite(num)) return { value: num, date: obs.date };
    }
    return null;
  }

  function toPct(x) {
    if (!Number.isFinite(x)) return "N/A";
    return `${x.toFixed(2)}%`;
  }

  async function fetchMortgageRates() {
    try {
      const [m30, m15] = await Promise.all([
        fetchJsonWithFallback(buildFredUrl(SERIES.mortgage30, { limit: 1, sortOrder: "desc" })),
        fetchJsonWithFallback(buildFredUrl(SERIES.mortgage15, { limit: 1, sortOrder: "desc" }))
      ]);

      const latest30 = pickLatestNumericObservation(m30.observations);
      const latest15 = pickLatestNumericObservation(m15.observations);

      if (latest30) {
        setText("rate30", toPct(latest30.value));
        // If you have an "interest rate" input for a calculator, populate it.
        setInputValue("interestRate", latest30.value.toFixed(3));
      } else {
        setText("rate30", "N/A");
      }

      if (latest15) {
        setText("rate15", toPct(latest15.value));
      } else {
        setText("rate15", "N/A");
      }

      // ARM series is discontinued from Freddie Mac PMMS (FRED shows it discontinued),
      // so do not show stale data.
      setText("rateARM", "N/A");
    } catch (error) {
      console.error("Error fetching mortgage rates:", error);
      setText("rate30", "N/A");
      setText("rate15", "N/A");
      setText("rateARM", "N/A");
    }
  }

  async function fetchTreasuryData() {
    try {
      // Pull more points for chart, latest is first due to desc.
      const data = await fetchJsonWithFallback(buildFredUrl(SERIES.treasury10, { limit: 90, sortOrder: "desc" }));
      const obs = Array.isArray(data.observations) ? data.observations : [];

      const latest = pickLatestNumericObservation(obs);
      setText("treasury10", latest ? toPct(latest.value) : "N/A");

      // Build last 30 numeric points (chronological order for chart)
      const numeric = obs
        .filter(o => o && o.value !== "." && Number.isFinite(Number(o.value)))
        .map(o => ({ date: o.date, value: Number(o.value) }));

      const last30Desc = numeric.slice(0, 30);       // newest-first
      const last30 = last30Desc.reverse();           // oldest-first for chart

      updateTreasuryChart(last30);
    } catch (error) {
      console.error("Error fetching Treasury data:", error);
      setText("treasury10", "N/A");
      updateTreasuryChart([]);
    }
  }

  function updateTreasuryChart(points) {
    const canvas = $("treasuryChart");
    if (!canvas) return;

    // Avoid runtime errors if Chart.js is not loaded
    if (typeof Chart === "undefined") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reuse/destroy existing chart instance
    if (window.treasuryChartInstance) {
      window.treasuryChartInstance.destroy();
    }

    const labels = points.map(p => p.date);
    const values = points.map(p => p.value);

    window.treasuryChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { ticks: { callback: v => `${v}%` } }
        }
      }
    });
  }

  function refreshAll() {
    fetchMortgageRates();
    fetchTreasuryData();
  }

  // Initial load
  refreshAll();

  // Refresh every hour
  setInterval(refreshAll, 3600000);
});
