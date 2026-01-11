document.addEventListener("DOMContentLoaded", function () {

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

  const treasuryValue = document.getElementById("treasury10");
  const treasuryCanvas = document.getElementById("treasuryChart");

  if (!treasuryValue || !treasuryCanvas || typeof Chart === "undefined") return;

  treasuryValue.textContent = "4.12%";

  const ctx = treasuryCanvas.getContext("2d");

  const data = [
    4.05, 4.06, 4.07, 4.08, 4.09,
    4.10, 4.11, 4.12, 4.11, 4.12,
    4.13, 4.12, 4.11, 4.10, 4.12
  ];

  new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => i + 1),
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

});
