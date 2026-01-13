document.addEventListener("DOMContentLoaded", async () => {
  const API_KEY = "dcc865cd79fab774a29ff8469d345622"; // Your FRED API Key

  // Function to fetch data from the FRED API
  async function fetchFred(seriesId) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${API_KEY}&file_type=json&sort_order=desc&limit=1`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    try {
      const res = await fetch(proxy);
      const data = await res.json();
      const latestValue = data.observations[0]?.value;
      return latestValue ? `${Number(latestValue).toFixed(2)}%` : "N/A";
    } catch (error) {
      console.error("Error fetching rates data:", error);
      return "N/A";
    }
  }

  // Function to update the mortgage rates and 10-Year Treasury Yield
  async function updateRates() {
    // Fetching the 30-Year and 15-Year mortgage rates
    const r30 = await fetchFred("MORTGAGE30US"); // 30-Year Fixed Rate
    const r15 = await fetchFred("MORTGAGE15US"); // 15-Year Fixed Rate

    // Updating the HTML with fetched rates
    document.getElementById("rate30").textContent = r30;
    document.getElementById("rate15").textContent = r15;

    // Fetching the 10-Year Treasury Yield for the chart
    const t10 = await fetchFred("DGS10"); // 10-Year Treasury Yield
    document.getElementById("treasury10").textContent = t10;

    // Call function to display 10-Year Treasury Chart (using Chart.js)
    displayTreasuryChart();
  }

  // Function to display the 10-Year Treasury Yield chart
  function displayTreasuryChart() {
    const ctx = document.getElementById('treasuryChart').getContext('2d');

    // Example chart data for demonstration purposes (use real data for actual implementation)
    const chartData = {
      labels: ['1', '2', '3', '4', '5'], // Example data labels for X-axis (dates)
      datasets: [{
        label: '10-Year Treasury Yield (%)',
        data: [4.18, 4.21, 4.15, 4.10, 4.12], // Example data points for the chart
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      }]
    };

    const chartOptions = {
      scales: {
        y: {
          beginAtZero: false
        }
      }
    };

    // Create the chart
    new Chart(ctx, {
      type: 'line', // Line chart
      data: chartData,
      options: chartOptions
    });
  }

  // Call the function to update rates when the page loads
  updateRates();
});
