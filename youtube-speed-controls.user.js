// ==UserScript==
// @name         YouTube Speed Controls
// @namespace    https://github.com/selfdigest/scripts
// @version      1.0
// @description  Adds +/- buttons with a centered speed readout that adjusts playback via YouTube's API, and saves playback speed between videos.
// @author       selfdigest
// @homepageURL  https://github.com/selfdigest/scripts
// @downloadURL  https://raw.githubusercontent.com/selfdigest/scripts/refs/heads/main/youtube-speed-controls.user.js
// @updateURL    https://raw.githubusercontent.com/selfdigest/scripts/refs/heads/main/youtube-speed-controls.user.js
// @match        https://www.youtube.com/watch*
// @grant        none
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function() {
  'use strict';

  const CONTROLLER_ID = 'yt-native-speed-controller';
  const ANCHOR_SELECTOR = '.ytp-right-controls';
  const STEP_RATES_FALLBACK = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
  const STORAGE_KEY = 'yt-native-speed';

  const rewindIconSVG = `<svg height="100%" viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M6,12l8,6v-5l8,5V6l-8,5V6L6,12z" fill="currentColor"></path></svg>`;
  const fastForwardIconSVG = `<svg height="100%" viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M18,12L10,6v5L2,6v12l8-5v5L18,12z" fill="currentColor"></path></svg>`;

  function readStoredRate() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function writeStoredRate(rate) {
    try {
      window.localStorage.setItem(STORAGE_KEY, rate);
    } catch (_) {}
  }

  let mutationObserver = null;

  function getPlayer() {
    return document.getElementById('movie_player') || document.querySelector('#movie_player');
  }

  function getVideo() {
    return document.querySelector('#movie_player video') || document.querySelector('ytd-player video');
  }

  function getRates() {
    const player = getPlayer();
    try {
      const r = player && typeof player.getAvailablePlaybackRates === 'function' ? player.getAvailablePlaybackRates() : null;
      if (Array.isArray(r) && r.length) {
        return [...new Set(r)].sort((a,b) => a - b);
      }
    } catch (_) {}
    return STEP_RATES_FALLBACK;
  }

  function getCurrentRate() {
    const player = getPlayer();
    try {
      if (player && typeof player.getPlaybackRate === 'function') return player.getPlaybackRate();
    } catch (_) {}
    const v = getVideo();
    return v ? v.playbackRate : 1;
  }

  function setRate(rate, save = true) {
    const rates = getRates();
    // clamp to nearest valid rate in YouTube's list
    const clamped = rates.reduce((prev, curr) => Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev, rates[0]);
    const player = getPlayer();
    try {
      if (player && typeof player.setPlaybackRate === 'function') {
        player.setPlaybackRate(clamped);
      } else {
        const v = getVideo();
        if (v) v.playbackRate = clamped;
      }
    } catch (_) {}
    if (save) writeStoredRate(clamped);
  }

  function stepRate(direction) {
    const rates = getRates();
    const current = getCurrentRate();
    const idx = rates.findIndex(r => Math.abs(r - current) < 1e-6);
    let newIdx = idx === -1 ? rates.indexOf(1) : idx + (direction === 'up' ? 1 : -1);
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= rates.length) newIdx = rates.length - 1;
    setRate(rates[newIdx]);
  }

  function injectControls() {
    if (document.getElementById(CONTROLLER_ID)) return;

    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (!anchor || !anchor.parentElement) return;

    const wrapper = document.createElement('div');
    wrapper.id = CONTROLLER_ID;
    wrapper.style.cssText = [
      'display:flex',
      'align-items:center',
      'margin-right:8px',
      'gap:6px'
    ].join(' !important; ') + ' !important;';

    const mkBtn = (title, svg, onClick) => {
      const btn = document.createElement('button');
      btn.className = 'ytp-button';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:36px;height:36px;color:white;';
      btn.innerHTML = svg;
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
      return btn;
    };

    const display = document.createElement('span');
    display.style.cssText = [
      'font-size:16px',
      'font-weight:600',
      'color:white',
      'min-width:48px',
      'text-align:center',
      'font-variant-numeric:tabular-nums',
      'cursor:pointer',
      'user-select:none'
    ].join(' !important; ') + ' !important;';
    display.title = 'Click to reset to 1.00x';

    const decBtn = mkBtn('Decrease speed', rewindIconSVG, () => stepRate('down'));
    const incBtn = mkBtn('Increase speed', fastForwardIconSVG, () => stepRate('up'));

    wrapper.appendChild(decBtn);
    wrapper.appendChild(display);
    wrapper.appendChild(incBtn);

    anchor.parentElement.insertBefore(wrapper, anchor);

    const refresh = () => { display.textContent = getCurrentRate().toFixed(2); };
    refresh();

    const v = getVideo();
    if (v) v.addEventListener('ratechange', refresh, { passive: true });

    display.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRate(1);
      refresh();
    });

    const pollId = setInterval(() => {
      if (!document.body.contains(wrapper)) { clearInterval(pollId); return; }
      refresh();
    }, 1000);
  }

  function applySavedRate() {
    const saved = parseFloat(readStoredRate());
    if (!isNaN(saved)) {
      setRate(saved, false);
    }
  }

  function ensureOnceLoaded() {
    if (mutationObserver) mutationObserver.disconnect();
    mutationObserver = new MutationObserver(() => {
      if (document.querySelector(ANCHOR_SELECTOR) && getVideo()) {
        injectControls();
        applySavedRate();
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    injectControls();
    applySavedRate();
  }

  window.addEventListener('yt-navigate-finish', ensureOnceLoaded);
  document.addEventListener('DOMContentLoaded', ensureOnceLoaded, { once: true });
  ensureOnceLoaded();
})();
