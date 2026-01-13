document.addEventListener("DOMContentLoaded", function () {

  // Mortgage Rates Snapshot (static example for now)
  const PMMS_SNAPSHOT = {
    rate30: "6.62%",
    rate15: "5.89%",
    rateARM: "6.10%"
  };

  const r30 = document.getElementById("rate30");
  const r15 = document.getElementById("rate15");
  const rARM = document.getElementById("rateARM");

  if (r30) r30.textContent = PMMS_SNAPSHOT.rate30;
  if (r15) r15.textContent = PMMS_SNAPSHOT.rate15;
  if (rARM) rARM.textContent = PMMS_SNAPSHOT.rateARM;

  // 10-Year Treasury Yield (dynamic value)
  const treasuryValue = document.getElementById("treasury10");
  const treasuryCanvas = document.getElementById("treasuryChart");

  if (!treasuryValue || !treasuryCanvas || typeof Chart === "undefined") return;

  // Fetch latest Treasury Yield from a dynamic source
  function fetchTreasuryData() {
    // Example: Fetching Treasury Yield data from a static file or dynamic source
    // In a real scenario, you would fetch this from an API or scrape it from a financial website
    const latestTreasuryYield = "4.12%";  // This should be updated dynamically

    // Update the displayed yield
    if (treasuryValue) treasuryValue.textContent = latestTreasuryYield;

    // Example data for chart (should be updated based on the latest data)
    const data = [
      4.05, 4.06, 4.07, 4.08, 4.09,
      4.10, 4.11, 4.12, 4.11, 4.12,
      4.13, 4.12, 4.11, 4.10, 4.12
    ];

    // Update the chart
    updateTreasuryChart(data);
  }

  // Update the Treasury Yield Chart
  function updateTreasuryChart(data) {
    const ctx = treasuryCanvas.getContext("2d");

    // Redraw the chart with new data
    new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((_, i) => `Day ${i + 1}`),  // Example labels: Day 1, Day 2, etc.
        datasets: [{
          data,
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
            ticks: { callback: v => v + "%" }
          }
        }
      }
    });
  }

  // Initial fetch of Treasury Yield data
  fetchTreasuryData();

  // Update every hour (3600000 milliseconds = 1 hour)
  setInterval(fetchTreasuryData, 3600000);  // Update every hour

});
