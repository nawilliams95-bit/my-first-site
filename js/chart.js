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
    type: "line", // Define the chart type as line
    data: {
      labels: points.map(p => p.date), // X-axis labels from the data
      datasets: [{
        label: "10-Year Treasury Yield", // Label for the chart
        data: points.map(p => p.value), // Y-axis data values
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
