<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Realty Data Labs | Real Estate Intelligence</title>

  <!-- GLOBAL + HOME CSS -->
  <link rel="stylesheet" href="css/base.css" />
  <link rel="stylesheet" href="css/home.css" />
  
  <!-- Add optional error message styling -->
  <style>
    .error-message {
      display: none;
      color: red;
      font-size: 16px;
      padding: 10px;
      background-color: #fdd;
      border: 1px solid red;
      border-radius: 4px;
      margin-top: 20px;
    }
  </style>
</head>

<body>

  <!-- HEADER -->
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="index.html">
        <img class="brand-logo" src="images/logo.jpg" alt="Realty Data Labs logo" />
        <span class="brand-name">Realty Data Labs</span>
      </a>

      <nav class="nav">
        <a href="index.html" class="active">Home</a>
        <a href="auth.html" class="nav-cta">Sign In / Sign Up</a>
        <a href="analyzer.html">Property Analyzer</a>
        <a href="about.html">About</a>
        <a href="contact.html">Contact</a>
      </nav>
    </div>
  </header>

  <main>

    <!-- HERO -->
    <section class="hero">
      <div class="container hero-inner">
        <h1>Real Estate Intelligence, Updated Daily</h1>
        <p class="subhead">
          Live market context, mortgage rate benchmarks, and economic signals
          built for buyers, owners, investors, and agents.
        </p>
      </div>
    </section>

    <!-- INTELLIGENCE -->
    <section class="home-intelligence">
      <div class="container">

        <!-- NEWS -->
        <section class="news-section">
          <h2>Today’s Real Estate and Economic News</h2>

          <div class="news-feed">
            <article class="news-item">
              <span class="news-source">Loading</span>
              <h3>Fetching the latest housing and economic headlines…</h3>
              <time>—</time>
            </article>
          </div>
        </section>

        <!-- MARKET DATA -->
        <section class="market-section">

          <!-- MORTGAGE RATES -->
          <div class="market-box">
            <h2>National Mortgage Rate Averages</h2>

            <p class="data-disclaimer">
              Rates shown are Freddie Mac Primary Mortgage Market Survey (PMMS)
              national averages and Optimal Blue daily indices.
              Rates are benchmarks only and not loan offers.
            </p>

            <p class="data-note">
              Weekly PMMS benchmarks and daily market indices.
            </p>

            <table class="rates-table">
              <tbody>
                <!-- Weekly Benchmarks -->
                <tr>
                  <td>30-Year Fixed (PMMS)</td>
                  <td id="rate30">Loading...</td>
                </tr>
                <tr>
                  <td>15-Year Fixed (PMMS)</td>
                  <td id="rate15">Loading...</td>
                </tr>

                <!-- Daily Market Rates -->
                <tr>
                  <td>30-Year Fixed (Conforming, Daily)</td>
                  <td id="rateConforming">Loading...</td>
                </tr>
                <tr>
                  <td>30-Year Fixed (Jumbo, Daily)</td>
                  <td id="rateJumbo">Loading...</td>
                </tr>
                <tr>
                  <td>30-Year Fixed (FHA, Daily)</td>
                  <td id="rateFHA">Loading...</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- TREASURY -->
          <div class="market-box">
            <h2>10-Year Treasury Yield</h2>

            <div class="treasury-value" id="treasury10">Loading...</div>

            <div class="treasury-chart-wrap">
              <canvas id="treasuryChart"></canvas>
            </div>

            <p class="data-note">
              30-day yield trend. Source: U.S. Treasury via FRED.
            </p>
          </div>

        </section>

      </div>
    </section>

    <!-- Error Message -->
    <div id="dataError" class="error-message"></div>

  </main>

  <!-- FOOTER -->
  <footer class="site-footer">
    <div class="container footer-inner">

      <nav class="footer-nav">
        <a href="index.html">Home</a>
        <a href="auth.html">Sign In / Sign Up</a>
        <a href="analyzer.html">Property Analyzer</a>
        <a href="about.html">About</a>
        <a href="contact.html">Contact</a>
      </nav>

      <div class="footer-disclaimer">
        <p>
          Realty Data Labs provides general real estate, housing market,
          and economic information for educational purposes only.
        </p>
        <p>
          The author of this site is a licensed real estate agent in the State of Georgia.
        </p>
      </div>

      <p class="footer-meta">
        © <span id="year"></span> Realty Data Labs. All rights reserved.
      </p>

    </div>
  </footer>

  <!-- FOOTER YEAR -->
  <script>
    document.getElementById("year").textContent = new Date().getFullYear();
  </script>

  <!-- SCRIPTS -->
  <script src="js/news.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

  <!-- Live Data Script -->
  <script>
    document.addEventListener("DOMContentLoaded", async () => {
      const API_KEY = "dcc865cd79fab774a29ff8469d345622";

      // Fetch data from the FRED API
      async function fetchFredSeries(seriesId, limit = 180) {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
        const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

        try {
          const res = await fetch(proxy, { cache: "no-store" });
          if (!res.ok) throw new Error(`Fetch failed for ${seriesId}`);
          
          const data = await res.json();
          return Array.isArray(data.observations) ? data.observations : [];
        } catch (error) {
          console.error(`Error fetching ${seriesId}:`, error);
          document.getElementById("dataError").textContent = "Sorry, we couldn't load the latest data at the moment. Please try again later.";
          document.getElementById("dataError").style.display = "block"; // Show error message
          return []; // Return an empty array in case of an error
        }
      }

      function latestNumericValue(observations) {
        for (const obs of observations) {
          const v = Number(obs.value);
          if (obs.value !== "." && !isNaN(v)) {
            return v;
          }
        }
        return null;
      }

      function pct(v) {
        return v !== null ? `${v.toFixed(2)}%` : "N/A";
      }

      function updateTreasuryChart(points) {
        const canvas = document.getElementById("treasuryChart");
        const ctx = canvas.getContext("2d");

        if (window.treasuryChartInstance) {
          window.treasuryChartInstance.destroy();
        }

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
        // Fetch data concurrently for different rates
        const [
          obs30,
          obs15,
          obsConf,
          obsJumbo,
          obsFHA,
          obsTreasury
        ] = await Promise.all([
          fetchFredSeries("MORTGAGE30US"), // 30-Year Fixed
          fetchFredSeries("MORTGAGE15US"), // 15-Year Fixed
          fetchFredSeries("OBMMI30YF"),    // 30-Year Fixed Conforming
          fetchFredSeries("OBMMI30YJ"),    // 30-Year Fixed Jumbo
          fetchFredSeries("OBMMI30YFHA"),  // 30-Year Fixed FHA
          fetchFredSeries("DGS10")         // 10-Year Treasury
        ]);

        // Extract the latest valid data and update the page
        document.getElementById("rate30").textContent = pct(latestNumericValue(obs30));
        document.getElementById("rate15").textContent = pct(latestNumericValue(obs15));
        document.getElementById("rateConforming").textContent = pct(latestNumericValue(obsConf));
        document.getElementById("rateJumbo").textContent = pct(latestNumericValue(obsJumbo));
        document.getElementById("rateFHA").textContent = pct(latestNumericValue(obsFHA));
        document.getElementById("treasury10").textContent = pct(latestNumericValue(obsTreasury));

        // Update Treasury chart
        const treasuryPoints = obsTreasury
          .filter(o => o && o.value !== "." && !isNaN(Number(o.value)))
          .slice(0, 30)
          .reverse()
          .map(o => ({ date: o.date, value: Number(o.value) }));

        if (treasuryPoints.length) {
          updateTreasuryChart(treasuryPoints);
        }

      } catch (e) {
        console.error("Rates JS failed:", e);
        document.getElementById("dataError").textContent = "Sorry, we couldn't load the latest data at the moment. Please try again later.";
        document.getElementById("dataError").style.display = "block"; // Show error message
      }
    });
  </script>

</body>
</html>
