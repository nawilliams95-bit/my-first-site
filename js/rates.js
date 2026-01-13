document.addEventListener("DOMContentLoaded", function () {

  // Mortgage Rates Snapshot (Dynamic fetching)
  function fetchMortgageRates() {
    const apiKey = 'dcc865cd79fab774a29ff8469d345622';  // Replace with your FRED API key or another API key
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=IR14290&api_key=${apiKey}&file_type=json`;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        console.log("Mortgage Rates API Response:", data); // Log the API response

        // Check if data exists and has the expected structure
        if (data && data.observations && data.observations.length > 0) {
          const rate30 = data.observations[0].value;  // Get the latest 30-year mortgage rate
          document.getElementById('rate30').textContent = rate30 + '%';

          const rate15 = data.observations[1].value;  // Get the latest 15-year mortgage rate
          document.getElementById('rate15').textContent = rate15 + '%';

          const rateARM = data.observations[2].value;  // Get the latest 5/1 ARM rate
          document.getElementById('rateARM').textContent = rateARM + '%';
        } else {
          console.error('No valid mortgage rate data received.');
          document.getElementById('rate30').textContent = 'N/A';
          document.getElementById('rate15').textContent = 'N/A';
          document.getElementById('rateARM').textContent = 'N/A';
        }
      })
      .catch(error => {
        console.error('Error fetching mortgage rates:', error);
        document.getElementById('rate30').textContent = 'N/A';
        document.getElementById('rate15').textContent = 'N/A';
        document.getElementById('rateARM').textContent = 'N/A';
      });
  }

  // Fetch the 10-Year Treasury Yield Data
  function fetchTreasuryData() {
    const apiKey = 'dcc865cd79fab774a29ff8469d345622';  // FRED API key
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${apiKey}&file_type=json`;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        console.log("Treasury Data API Response:", data); // Log the API response

        // Check if data exists and has the expected structure
        if (data && data.observations && data.observations.length > 0) {
          const latestTreasuryYield = data.observations[0].value;  // Get the latest 10-year yield

          // Update the displayed yield
          const treasuryValue = document.getElementById('treasury10');
          if (treasuryValue) treasuryValue.textContent = `${latestTreasuryYield}%`;  // Display the yield value

          // Example data for chart (last 30 data points)
          const dataPoints = data.observations.slice(0, 30).map(obs => parseFloat(obs.value));  // Get the last 30 data points

          // Update the chart with the new data
          updateTreasuryChart(dataPoints);
        } else {
          console.error('No valid Treasury data received.');
          document.getElementById('treasury10').textContent = 'N/A';
        }
      })
      .catch(error => {
        console.error('Error fetching Treasury data:', error);
        document.getElementById('treasury10').textContent = 'N/A';
      });
  }

  // Update the Treasury Yield Chart
  function updateTreasuryChart(data) {
    const ctx = document.getElementById('treasuryChart').getContext('2d');

    // Destroy the old chart if it exists
    if (window.myChart) {
      window.myChart.destroy();  // Destroy existing chart instance
    }

    // Create a new chart instance with updated data
    window.myChart = new Chart(ctx, {
      type: 'line',
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

  // Fetch data when the page loads
  fetchMortgageRates();
  fetchTreasuryData();

  // Update data every hour (3600000 milliseconds = 1 hour)
  setInterval(function () {
    fetchMortgageRates();
    fetchTreasuryData();
  }, 3600000);  // Update every hour

});
