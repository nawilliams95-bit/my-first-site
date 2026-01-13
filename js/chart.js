// Fresh version of rates.js with improved error handling and consolidated Treasury chart logic

document.addEventListener("DOMContentLoaded", async () => {
  const API_KEY = "dcc865cd79fab774a29ff8469d345622"; // Your API key for FRED API

  // Function to fetch data from FRED API
  async function fetchFred(seriesId, limit = 1) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    try {
      const res = await fetch(proxy);
      const data = await res.json();
      return data.observations || [];
    } catch (error) {
      console.error("Error fetching rates data:", error);
      return [];
    }
  }

  // Update the rates and Treasury chart on the page
  async function updateRatesAndChart() {
    // Fetch the latest rates
    const r30 = await fetchFred("MORTGAGE30US");
    const r15 = await fetchFred("MORTGAGE15US");
    const t10 = await fetchFred("DGS10", 12); // Get 12 months of Treasury yield data for the graph

    // Populate mortgage rates
    document.getElementById("rate30").textContent = r30[0]?.value ? `${Number(r30[0].value).toFixed(2)}%` : "N/A";
    document.getElementById("rate15").textContent = r15[0]?.value ? `${Number(r15[0].value).toFixed(2)}%` : "N/A";

    // Update the 10-year Treasury yield data
    document.getElementById("rate10").textContent = t10[0]?.value ? `${Number(t10[0].value).toFixed(2)}%` : "N/A";

    // Update the Treasury chart with 12 months of data
    updateTreasuryChart(t10);
  }

  // Initialize and update the Treasury Yield chart
  function updateTreasuryChart(data) {
    const labels = data.map(item => item.date); // Get the dates for the x-axis
    const treasuryValues = data.map(item => parseFloat(item.value)); // Get the values for the y-axis

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
      type: "line", // Define the chart type as line
      data: {
        labels: labels,
        datasets: [{
          label: "10-Year Treasury Yield", // Label for the chart
          data: treasuryValues, // Y-axis data values
          borderWidth: 2,
          borderColor: "rgba(75, 192, 192, 1)", // Line color
          tension: 0.35, // Smooth line curve
          pointRadius: 0 // Hide points on the line
        }]
      },
      options: {
        responsive: true, // Make the chart responsive
        maintainAspectRatio: false, // Maintain aspect ratio for responsiveness
        plugins: {
          legend: {
            display: false // Hide the legend
          }
        },
        scales: {
          x: {
            display: true, // Display the x-axis
            title: {
              display: true,
              text: "Date" // Title for the x-axis
            }
          },
          y: {
            display: true, // Display the y-axis
            title: {
              display: true,
              text: "Yield (%)" // Title for the y-axis
            },
            ticks: {
              callback: function(value) {
                return `${value}%`; // Format y-axis values as percentages
              }
            }
          }
        }
      }
    });
  }

  // Call the function to update rates and Treasury chart
  updateRatesAndChart();
});
