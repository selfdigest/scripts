// ==UserScript==
// @name         AnimeBytes Dual Audio Highlighter
// @namespace    https://github.com/selfdigest/scripts
// @version      1.0
// @description  Makes "Dual Audio" text bold and white on torrent and series pages.
// @author       selfdigest
// @homepageURL  https://github.com/selfdigest/scripts
// @downloadURL  https://raw.githubusercontent.com/selfdigest/scripts/refs/heads/main/animebytes-dual-audio-highlighter.user.js
// @updateURL    https://raw.githubusercontent.com/selfdigest/scripts/refs/heads/main/animebytes-dual-audio-highlighter.user.js
// @match        https://animebytes.tv/torrents.php*
// @match        https://animebytes.tv/series.php*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const TABLE_SELECTOR = '.torrent_table';
  const TARGET_SELECTOR = `${TABLE_SELECTOR} a`;
  const TARGET_TEXT = 'Dual Audio';
  const STYLED_TEXT = `<b><span style="color: white;">${TARGET_TEXT}</span></b>`;

  function highlightDualAudio() {
    const links = document.querySelectorAll(TARGET_SELECTOR);
    for (const link of links) {
      if (link.dataset.dualAudioStyled) continue;
      if (link.innerHTML.includes(TARGET_TEXT)) {
        link.innerHTML = link.innerHTML.replaceAll(TARGET_TEXT, STYLED_TEXT);
        link.dataset.dualAudioStyled = 'true';
      }
    }
  }

  function observePageChanges() {
    const table = document.querySelector(TABLE_SELECTOR);
    const targetNode = table || document.body;
    if (!targetNode) {
      window.setTimeout(observePageChanges, 100);
      return;
    }
    const observer = new MutationObserver(highlightDualAudio);
    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  highlightDualAudio();
  observePageChanges();
})();
