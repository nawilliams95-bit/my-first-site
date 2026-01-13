document.addEventListener("DOMContentLoaded", async () => {
  const API_KEY = "dcc865cd79fab774a29ff8469d345622";

  // Fetch data from the FRED API
  async function fetchFredSeries(seriesId, limit = 180) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    const res = await fetch(proxy, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed for ${seriesId}`);

    const data = await res.json();

    // Return full observations so we can reuse for charts
    return Array.isArray(data.observations) ? data.observations : [];
  }

  // Extract the latest numeric value from the observations
  function latestNumericValue(observations) {
    for (const obs of observations) {
      const v = Number(obs.value);
      if (obs.value !== "." && Number.isFinite(v)) {
        return v;
      }
    }
    return null;
  }

  // Format the value as a percentage
  function pct(v) {
    return Number.isFinite(v) ? `${v.toFixed(2)}%` : "N/A";
  }

  // Update the treasury chart with the data points
  function updateTreasuryChart(points) {
    const canvas = document.getElementById("treasuryChart");
    if (!canvas || typeof Chart === "undefined") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Destroy the previous chart instance if it exists
    if (window.treasuryChartInstance) {
      window.treasuryChartInstance.destroy();
    }

    // Create a new chart instance with the fetched data
    window.treasuryChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: points.map(p => p.date),
        datasets: [{
          data: points.map(p => p.value),
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            ticks: { callback: v => `${v}%` }
          }
        }
      }
    });
  }

  try {
    // Fetch all required data series concurrently
    const [
      obs30,
      obs15,
      obsConf,
      obsJumbo,
      obsFHA,
      obsTreasury
    ] = await Promise.all([
      fetchFredSeries("MORTGAGE30US"),
      fetchFredSeries("MORTGAGE15US"),
      fetchFredSeries("OBMMI30YF"),
      fetchFredSeries("OBMMI30YJ"),
      fetchFredSeries("OBMMI30YFHA"),
      fetchFredSeries("DGS10")
    ]);

    // Weekly PMMS Rates
    document.getElementById("rate30").textContent = pct(latestNumericValue(obs30));
    document.getElementById("rate15").textContent = pct(latestNumericValue(obs15));

    // Daily Market Rates
    document.getElementById("rateConforming").textContent = pct(latestNumericValue(obsConf));
    document.getElementById("rateJumbo").textContent = pct(latestNumericValue(obsJumbo));
    document.getElementById("rateFHA").textContent = pct(latestNumericValue(obsFHA));

    // Treasury Value
    const treasuryLatest = latestNumericValue(obsTreasury);
    document.getElementById("treasury10").textContent = pct(treasuryLatest);

    // Treasury Chart Data: last 30 numeric points, chronological order
    const treasuryPoints = obsTreasury
      .filter(o => o && o.value !== "." && Number.isFinite(Number(o.value)))
      .slice(0, 30)
      .reverse()
      .map(o => ({ date: o.date, value: Number(o.value) }));

    // If we have valid data points, update the chart
    if (treasuryPoints.length) {
      updateTreasuryChart(treasuryPoints);
    }

  } catch (e) {
    console.error("Rates JS failed:", e);
  }
});
