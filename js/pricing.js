/**
 * Mahadev Jewellers — Precious Metal Pricing Engine
 * ---------------------------------------------------
 * This module manages daily gold & silver rates, and computes
 * ornament prices using the industry-standard formula:
 *
 *   Ornament Price = (Metal Weight in grams × Rate per gram)
 *                    + (Metal Weight × Rate per gram × Wastage%)
 *                    + Making Charges (flat)
 *
 * Rates are stored in localStorage and refresh once per day.
 * An admin panel (accessible via ?admin=true) lets the store
 * owner update rates manually.
 */

const PricingEngine = (() => {

  // ─── Default Base Rates (₹ per gram) — Hyderabad June 2026 ───
  const DEFAULT_RATES = {
    gold_24k: 15622,    // Pure 24K gold per gram
    gold_22k: 14320,    // 22K gold per gram (jewellery standard)
    gold_18k: 11717,    // 18K gold per gram
    silver_999: 290,    // 999 fine silver per gram
    silver_925: 268,    // 925 sterling silver per gram
  };

  const STORAGE_KEY = 'mahadev_metal_rates';

  // ─── Rate Persistence ───
  function _loadRates() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if rates are from today
        const today = new Date().toDateString();
        if (parsed._date === today) {
          return parsed;
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function _saveRates(rates) {
    rates._date = new Date().toDateString();
    rates._timestamp = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  }

  function getRates() {
    const cached = _loadRates();
    if (cached) return cached;
    // First load — seed with defaults
    const fresh = { ...DEFAULT_RATES };
    _saveRates(fresh);
    return fresh;
  }

  function updateRate(key, value) {
    const rates = getRates();
    if (key in DEFAULT_RATES) {
      rates[key] = parseFloat(value);
      _saveRates(rates);
    }
  }

  function resetRates() {
    const fresh = { ...DEFAULT_RATES };
    _saveRates(fresh);
    return fresh;
  }

  // ─── Price Computation ───
  /**
   * @param {object} opts
   * @param {number} opts.weightGrams      — net weight of the ornament
   * @param {string} opts.metalType        — key in rate table, e.g. 'gold_22k'
   * @param {number} opts.wastagePercent   — e.g. 12 means 12%
   * @param {number} [opts.makingCharges]  — optional flat making charge
   * @returns {object} { metalCost, wastageCost, makingCharges, totalPrice, ratePerGram }
   */
  function computePrice(opts) {
    const rates = getRates();
    const ratePerGram = rates[opts.metalType] || 0;
    const metalCost = opts.weightGrams * ratePerGram;
    const wastageCost = metalCost * (opts.wastagePercent / 100);
    const making = opts.makingCharges || 0;
    const totalPrice = metalCost + wastageCost + making;

    return {
      ratePerGram,
      metalCost: Math.round(metalCost),
      wastageCost: Math.round(wastageCost),
      makingCharges: making,
      totalPrice: Math.round(totalPrice),
    };
  }

  // ─── Helper: Format Currency ───
  function formatINR(amount) {
    return '₹' + amount.toLocaleString('en-IN');
  }

  // ─── Rate Labels for UI ───
  const RATE_LABELS = {
    gold_24k: '24K Pure Gold',
    gold_22k: '22K Gold (Jewellery)',
    gold_18k: '18K Gold',
    silver_999: '999 Fine Silver',
    silver_925: '925 Sterling Silver',
  };

  // ─── Live Rates Banner Renderer ───
  function renderRatesTicker(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const rates = getRates();
    const items = [
      { label: '22K Gold', value: rates.gold_22k, unit: '/g', icon: '🥇' },
      { label: '24K Gold', value: rates.gold_24k, unit: '/g', icon: '✦' },
      { label: 'Silver 925', value: rates.silver_925, unit: '/g', icon: '🥈' },
      { label: 'Silver 999', value: rates.silver_999, unit: '/g', icon: '◆' },
    ];

    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    el.innerHTML = `
      <div class="rates-ticker-inner">
        ${items.map(i => `
          <span class="ticker-item">
            <span class="ticker-icon">${i.icon}</span>
            <span class="ticker-label">${i.label}:</span>
            <span class="ticker-value">${formatINR(i.value)}${i.unit}</span>
          </span>
        `).join('<span class="ticker-divider">|</span>')}
        <span class="ticker-divider">|</span>
        <span class="ticker-date">Updated: ${dateStr}</span>
        <span class="ticker-warning" data-tooltip="Prices fluctuate daily. Refresh the page to see live prices.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg> Live Rates
        </span>
      </div>
    `;
  }

  // ─── Hyderabad Live Rates API Integration ───
  // Fetches live Hyderabad retail pricing from our PHP scraping API (falls back to global with Hyderabad multiplier if offline)
  async function fetchLiveRates() {
    try {
      const res = await fetch('api/rates.php');
      if (!res.ok) throw new Error("Server API returned status " + res.status);
      const data = await res.json();
      
      const rates = getRates();
      rates.gold_24k = Math.round(data.gold_24k);
      rates.gold_22k = Math.round(data.gold_22k);
      rates.gold_18k = Math.round(data.gold_18k);
      rates.silver_999 = Math.round(data.silver_999);
      rates.silver_925 = Math.round(data.silver_925);
      
      _saveRates(rates);
      renderRatesTicker('rates-ticker');
    } catch (error) {
      console.warn("Could not fetch live Hyderabad rates from server API, trying global spot price fallback.", error);
      try {
        const [goldRes, silverRes] = await Promise.all([
          fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json'),
          fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xag.json')
        ]);
        
        const goldData = await goldRes.json();
        const silverData = await silverRes.json();
        
        const troyOunceInGrams = 31.1034768;
        
        // As of today, Hyderabad retail gold price is ~₹15,622 and global spot is ~₹13,793.
        // We apply a premium multiplier of 1.1326 for gold and 1.2609 for silver to accurately reflect customs duty, GST, and local premiums.
        const GOLD_MULTIPLIER = 1.1326;
        const SILVER_MULTIPLIER = 1.2609;
        
        const gold24kGram = (goldData.xau.inr / troyOunceInGrams) * GOLD_MULTIPLIER;
        const silver999Gram = (silverData.xag.inr / troyOunceInGrams) * SILVER_MULTIPLIER;
        
        const rates = getRates();
        rates.gold_24k = Math.round(gold24kGram);
        rates.gold_22k = Math.round(gold24kGram * 0.9167);
        rates.gold_18k = Math.round(gold24kGram * 0.7500);
        rates.silver_999 = Math.round(silver999Gram);
        rates.silver_925 = Math.round(silver999Gram * 0.925);
        
        _saveRates(rates);
        renderRatesTicker('rates-ticker');
      } catch (fallbackError) {
        console.warn("All metal price API fetches failed. Sourcing from cached rates.", fallbackError);
      }
    }
  }

  // Call the auto-fetch immediately when the script loads
  fetchLiveRates();

  // ─── Admin Panel for Rate Updates ───
  function renderAdminPanel(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const rates = getRates();

    el.innerHTML = `
      <div class="admin-rates-panel">
        <h3 class="playfair">Daily Metal Rates — Editor</h3>
        <p class="admin-subtitle">Update today's Hyderabad retail rates below. Changes reflect <strong>immediately</strong> on all product prices across the website.</p>
        <div class="admin-rates-grid">
          ${Object.keys(RATE_LABELS).map(key => `
            <div class="admin-rate-field">
              <label for="rate-${key}">${RATE_LABELS[key]}</label>
              <div class="admin-input-wrap">
                <span class="admin-currency">₹</span>
                <input type="number" id="rate-${key}" value="${rates[key]}" min="0" step="0.01" class="input-control admin-rate-input" data-rate-key="${key}">
                <span class="admin-unit">/gram</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="admin-actions">
          <button class="btn btn-primary" id="save-rates-btn">💾 Save Rates</button>
          <button class="btn btn-outline" id="fetch-live-btn">🔄 Fetch Live Rates</button>
          <button class="btn btn-outline" id="reset-rates-btn">↩ Reset to Defaults</button>
        </div>
        <div class="admin-status" id="admin-status" style="display:none;"></div>
      </div>
    `;

    // Helper: refresh all dependent UI after rate change
    function _refreshAfterRateChange() {
      renderRatesTicker('rates-ticker');
      // If admin table rendering functions exist (defined in admin.html), call them
      if (typeof renderTable === 'function') renderTable();
      if (typeof updateStats === 'function') updateStats();
    }

    // Save Rates button
    document.getElementById('save-rates-btn').addEventListener('click', () => {
      const inputs = el.querySelectorAll('.admin-rate-input');
      inputs.forEach(input => {
        updateRate(input.dataset.rateKey, input.value);
      });
      _refreshAfterRateChange();
      const status = document.getElementById('admin-status');
      status.style.display = 'block';
      status.className = 'admin-status success';
      status.textContent = '✓ Rates saved successfully! All product prices have been updated.';
      setTimeout(() => { status.style.display = 'none'; }, 4000);
    });

    // Fetch Live Rates button
    document.getElementById('fetch-live-btn').addEventListener('click', async () => {
      const btn = document.getElementById('fetch-live-btn');
      const status = document.getElementById('admin-status');
      btn.disabled = true;
      btn.textContent = '⏳ Fetching...';
      status.style.display = 'block';
      status.className = 'admin-status info';
      status.textContent = 'Fetching live Hyderabad rates from API...';
      
      try {
        await fetchLiveRates();
        // Re-read updated rates and populate inputs
        const updatedRates = getRates();
        const inputs = el.querySelectorAll('.admin-rate-input');
        inputs.forEach(input => {
          input.value = updatedRates[input.dataset.rateKey];
        });
        _refreshAfterRateChange();
        status.className = 'admin-status success';
        status.textContent = '✓ Live rates fetched and applied! You can adjust them further before saving.';
      } catch (err) {
        status.className = 'admin-status error';
        status.textContent = '✗ Could not fetch live rates: ' + err.message;
      }
      btn.disabled = false;
      btn.textContent = '🔄 Fetch Live Rates';
      setTimeout(() => { status.style.display = 'none'; }, 5000);
    });

    // Reset to Defaults button
    document.getElementById('reset-rates-btn').addEventListener('click', () => {
      const freshRates = resetRates();
      const inputs = el.querySelectorAll('.admin-rate-input');
      inputs.forEach(input => {
        input.value = freshRates[input.dataset.rateKey];
      });
      _refreshAfterRateChange();
      const status = document.getElementById('admin-status');
      status.style.display = 'block';
      status.className = 'admin-status info';
      status.textContent = 'Rates reset to default Hyderabad values.';
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    });
  }

  return {
    getRates,
    updateRate,
    resetRates,
    computePrice,
    formatINR,
    renderRatesTicker,
    renderAdminPanel,
    RATE_LABELS,
  };

})();
