document.addEventListener("DOMContentLoaded", async () => {
  const API_KEY = "dcc865cd79fab774a29ff8469d345622";

  // Fetch data from the FRED API
  async function fetchFredSeries(seriesId, limit = 180) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    try {
      const res = await fetch(proxy, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch failed for ${seriesId}: ${res.statusText}`);

      const data = await res.json();
      return Array.isArray(data.observations) ? data.observations : [];
    } catch (error) {
      console.error("Error fetching data:", error);
      return []; // Return an empty array in case of error
    }
  }

  // Extract the latest numeric value from the observations
  function latestNumericValue(observations) {
    for (const obs of observations) {
      const v = Number(obs.value);
      console.log(`Raw value: ${obs.value}, Parsed value: ${v}`); // Log raw and parsed values
      // Check if the value is valid, i.e., it's a number and not a placeholder (like ".")
      if (obs.value !== "." && !isNaN(v)) {
        console.log(`Valid value found: ${v} for date: ${obs.date}`);
        return v;
      }
    }
    console.log("No valid value found.");
    return null; // Return null if no valid value is found
  }

  // Format the value as a percentage
  function pct(v) {
    if (v === null) {
      return "N/A"; // Return "N/A" if the value is null
    }
    return `${v.toFixed(2)}%`; // Format value as percentage
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

    // Log the raw data for debugging
    console.log("Data for 30-Year Mortgage:", obs30);
    console.log("Data for 15-Year Mortgage:", obs15);
    console.log("Data for Conforming:", obsConf);
    console.log("Data for Jumbo:", obsJumbo);
    console.log("Data for FHA:", obsFHA);
    console.log("Data for Treasury:", obsTreasury);

    // Weekly PMMS Rates
    const rate30 = latestNumericValue(obs30);
    const rate15 = latestNumericValue(obs15);
    const rateConf = latestNumericValue(obsConf);
    const rateJumbo = latestNumericValue(obsJumbo);
    const rateFHA = latestNumericValue(obsFHA);
    const treasuryLatest = latestNumericValue(obsTreasury);

    console.log(`rate30: ${rate30}, rate15: ${rate15}, rateConf: ${rateConf}, rateJumbo: ${rateJumbo}, rateFHA: ${rateFHA}`);
    console.log(`Treasury 10-year rate: ${treasuryLatest}`);

    // Update the page with these rates
    document.getElementById("rate30").textContent = pct(rate30);
    document.getElementById("rate15").textContent = pct(rate15);
    document.getElementById("rateConforming").textContent = pct(rateConf);
    document.getElementById("rateJumbo").textContent = pct(rateJumbo);
    document.getElementById("rateFHA").textContent = pct(rateFHA);
    document.getElementById("treasury10").textContent = pct(treasuryLatest);

    // Treasury Chart Data: last 30 numeric points, chronological order
    const treasuryPoints = obsTreasury
      .filter(o => o && o.value !== "." && !isNaN(Number(o.value)))  // Filter for valid data
      .slice(0, 30)  // Limit to last 30 data points
      .reverse()     // Reverse order so it's chronological
      .map(o => ({ date: o.date, value: Number(o.value) }));

    // If we have valid data points, update the chart
    if (treasuryPoints.length) {
      updateTreasuryChart(treasuryPoints);
    }

  } catch (e) {
    console.error("Rates JS failed:", e);
    document.getElementById("dataError").textContent = "Sorry, we couldn't load the latest data at the moment. Please try again later.";
  }
});
