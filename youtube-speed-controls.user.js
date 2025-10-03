// ==UserScript==
// @name         YouTube Speed Controls
// @namespace    https://github.com/selfdigest/scripts
// @version      1.1
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
  const BUTTON_SIZE_PX = 48;
  const DISPLAY_HEIGHT_PX = 40;

  const rewindIconSVG = `<svg height="100%" viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M6,12l8,6v-5l8,5V6l-8,5V6L6,12z" fill="currentColor"></path></svg>`;
  const fastForwardIconSVG = `<svg height="100%" viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M18,12L10,6v5L2,6v12l8-5v5L18,12z" fill="currentColor"></path></svg>`;

  let controllerEl = null;
  let displayEl = null;
  let ratechangeTarget = null;
  let refreshTimerId = null;
  let pendingSetup = false;
  let anchorResizeObserver = null;
  let observedAnchor = null;

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

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }

  function findControlsAnchor() {
    return Array.from(document.querySelectorAll(ANCHOR_SELECTOR)).find(isElementVisible) || null;
  }

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
    updateDisplay();
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

  function updateDisplay() {
    if (displayEl) displayEl.textContent = getCurrentRate().toFixed(2) + 'x';
  }

  function bindRatechangeListener() {
    const video = getVideo();
    if (ratechangeTarget === video) return;
    if (ratechangeTarget) {
      ratechangeTarget.removeEventListener('ratechange', updateDisplay);
      ratechangeTarget = null;
    }
    if (video) {
      ratechangeTarget = video;
      video.addEventListener('ratechange', updateDisplay, { passive: true });
    }
  }

  function startRefreshTimer() {
    if (refreshTimerId) clearInterval(refreshTimerId);
    refreshTimerId = setInterval(() => {
      if (!controllerEl || !controllerEl.isConnected) {
        clearInterval(refreshTimerId);
        refreshTimerId = null;
        return;
      }
      updateDisplay();
      bindRatechangeListener();
    }, 1000);
  }

  function injectControls() {
    const anchor = findControlsAnchor();
    if (!anchor || !anchor.parentElement) return;

    const host = anchor.parentElement;

    if (controllerEl && controllerEl.isConnected) {
      if (controllerEl.nextElementSibling !== anchor) host.insertBefore(controllerEl, anchor);
      applyLayout(anchor);
      ensureAnchorObserver(anchor);
      updateDisplay();
      bindRatechangeListener();
      startRefreshTimer();
      return;
    }

    controllerEl = document.createElement('div');
    controllerEl.id = CONTROLLER_ID;
    controllerEl.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'margin-right:12px',
      'padding:0 18px',
      'background:rgba(0,0,0,0.3)'
    ].join(' !important; ') + ' !important;';

    displayEl = document.createElement('span');
    displayEl.title = 'Click to reset to 1.00x';
    displayEl.setAttribute('role', 'button');
    displayEl.setAttribute('tabindex', '0');
    displayEl.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:16px',
      'font-weight:600',
      'color:white',
      `height:${DISPLAY_HEIGHT_PX}px`,
      'min-width:72px',
      'padding:0 18px',
      'font-variant-numeric:tabular-nums',
      'cursor:pointer',
      'user-select:none',
      `border-radius:${Math.round(DISPLAY_HEIGHT_PX / 2)}px`,
      'background:rgba(0,0,0,0.4)'
    ].join(' !important; ') + ' !important;';

    const resizeButtonSvg = (btn) => {
      const svg = btn.querySelector('svg');
      if (!svg) return;
      svg.style.maxWidth = 'none';
      svg.style.maxHeight = 'none';
    };

    const mkBtn = (title, svg, onClick) => {
      const btn = document.createElement('button');
      btn.className = 'ytp-button';
      btn.type = 'button';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${BUTTON_SIZE_PX}px`,
        `height:${BUTTON_SIZE_PX}px`,
        'color:white',
        'border:none',
        'background:transparent',
        `border-radius:${Math.round(BUTTON_SIZE_PX / 2)}px`,
        'padding:0'
      ].join(' !important; ') + ' !important;';
      btn.innerHTML = svg;
      resizeButtonSvg(btn);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      return btn;
    };

    const decBtn = mkBtn('Decrease speed', rewindIconSVG, () => stepRate('down'));
    const incBtn = mkBtn('Increase speed', fastForwardIconSVG, () => stepRate('up'));

    controllerEl.appendChild(decBtn);
    controllerEl.appendChild(displayEl);
    controllerEl.appendChild(incBtn);

    displayEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setRate(1);
    });
    displayEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setRate(1);
      }
    });

    host.insertBefore(controllerEl, anchor);

    applyLayout(anchor);
    ensureAnchorObserver(anchor);
    updateDisplay();
    bindRatechangeListener();
    startRefreshTimer();
  }

  function ensureAnchorObserver(anchor) {
    if (!('ResizeObserver' in window)) {
      observedAnchor = anchor;
      return;
    }
    if (observedAnchor === anchor) return;
    if (anchorResizeObserver) anchorResizeObserver.disconnect();
    anchorResizeObserver = new ResizeObserver(() => {
      if (controllerEl && anchor.isConnected) applyLayout(anchor);
    });
    anchorResizeObserver.observe(anchor);
    observedAnchor = anchor;
  }

  function applyLayout(anchor) {
    if (!controllerEl) return;
    const anchorStyles = window.getComputedStyle(anchor);
    const anchorHeight = anchorStyles ? parseFloat(anchorStyles.height) : NaN;
    const pillHeight = Number.isFinite(anchorHeight) && anchorHeight > 0 ? anchorHeight : 48;
    const buttonSize = Math.max(32, Math.min(BUTTON_SIZE_PX, pillHeight - 6));
    const buttonRadius = Math.round(buttonSize / 2);
    const displayHeight = Math.max(32, Math.min(pillHeight - 4, pillHeight));
    const displayRadius = Math.round(displayHeight / 2);

    controllerEl.style.setProperty('height', `${pillHeight}px`, 'important');
    controllerEl.style.setProperty('border-radius', `${Math.round(pillHeight / 2)}px`, 'important');

    const topMargin = anchorStyles ? anchorStyles.marginTop : null;
    const bottomMargin = anchorStyles ? anchorStyles.marginBottom : null;
    if (topMargin && topMargin !== '0px') controllerEl.style.setProperty('margin-top', topMargin, 'important');
    if (bottomMargin && bottomMargin !== '0px') controllerEl.style.setProperty('margin-bottom', bottomMargin, 'important');

    const buttons = controllerEl.querySelectorAll('.ytp-button');
    buttons.forEach((btn) => {
      btn.style.setProperty('width', `${buttonSize}px`, 'important');
      btn.style.setProperty('height', `${buttonSize}px`, 'important');
      btn.style.setProperty('border-radius', `${buttonRadius}px`, 'important');
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.style.width = `${Math.round(buttonSize * 0.58)}px`;
        svg.style.height = `${Math.round(buttonSize * 0.58)}px`;
      }
    });

    if (displayEl) {
      displayEl.style.setProperty('height', `${displayHeight}px`, 'important');
      displayEl.style.setProperty('border-radius', `${displayRadius}px`, 'important');
    }
  }

  function applySavedRate() {
    const saved = parseFloat(readStoredRate());
    if (!isNaN(saved)) {
      setRate(saved, false);
    }
  }

  function scheduleSetup() {
    if (pendingSetup) return;
    pendingSetup = true;
    requestAnimationFrame(() => {
      pendingSetup = false;
      injectControls();
      applySavedRate();
    });
  }

  function ensureOnceLoaded() {
    if (mutationObserver) mutationObserver.disconnect();
    mutationObserver = new MutationObserver(() => {
      if (document.querySelector(ANCHOR_SELECTOR) && getVideo()) {
        scheduleSetup();
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    scheduleSetup();
  }

  window.addEventListener('yt-navigate-finish', scheduleSetup);
  window.addEventListener('resize', () => {
    if (!controllerEl) return;
    requestAnimationFrame(() => {
      const anchor = findControlsAnchor();
      if (anchor) applyLayout(anchor);
    });
  });
  document.addEventListener('DOMContentLoaded', ensureOnceLoaded, { once: true });
  ensureOnceLoaded();
})();
