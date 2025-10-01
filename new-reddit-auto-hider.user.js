// ==UserScript==
// @name         New Reddit Auto Hider
// @namespace    https://github.com/selfdigest/scripts
// @version      1.1
// @description  Hides previously voted/hidden posts on page load and navigation.
// @author       selfdigest
// @homepageURL  https://github.com/selfdigest/scripts
// @downloadURL  https://raw.githubusercontent.com/selfdigest/scripts/refs/heads/main/new-reddit-auto-hider.user.js
// @updateURL    https://raw.githubusercontent.com/selfdigest/scripts/refs/heads/main/new-reddit-auto-hider.user.js
// @match        https://www.reddit.com/r/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // --- Configuration ---
  const defaultConfig = {
    hideUpvoted: true,
    hideDownvoted: true,
    hideRedditHidden: true
  };
  const config = {
    hideUpvoted: GM_getValue('hideUpvoted', defaultConfig.hideUpvoted),
    hideDownvoted: GM_getValue('hideDownvoted', defaultConfig.hideDownvoted),
    hideRedditHidden: GM_getValue('hideRedditHidden', defaultConfig.hideRedditHidden)
  };
  const toggleSetting = (key) => {
    const nextValue = !config[key];
    config[key] = nextValue;
    GM_setValue(key, nextValue);
    location.reload();
  };
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(`${config.hideUpvoted ? '[x]' : '[ ]'} Hide upvoted posts`, () => toggleSetting('hideUpvoted'));
    GM_registerMenuCommand(`${config.hideDownvoted ? '[x]' : '[ ]'} Hide downvoted posts`, () => toggleSetting('hideDownvoted'));
    GM_registerMenuCommand(`${config.hideRedditHidden ? '[x]' : '[ ]'} Hide posts Reddit marks hidden`, () => toggleSetting('hideRedditHidden'));
  }
  // --- End Configuration ---

  console.log('Reddit Hider v1.1 (Simplified): Script active. Instant-hide on click is disabled.');

  let feedObserver = null;

  const shouldProcess = () => /^\/r\//.test(window.location.pathname);

  const processPost = (post) => {
    if (!post || post.hasAttribute('data-script-hidden')) {
      return;
    }

    let shouldHide = false;

    const voteType = post.getAttribute('vote-type');
    const overflowMenu = post.querySelector('unpacking-overflow-menu');

    if (config.hideUpvoted && voteType === 'upvote') {
      shouldHide = true;
    } else if (config.hideDownvoted && voteType === 'downvote') {
      shouldHide = true;
    } else if (config.hideRedditHidden && overflowMenu && overflowMenu.hasAttribute('is-post-hidden')) {
      shouldHide = true;
    }

    if (shouldHide) {
      post.style.display = 'none';
      post.setAttribute('data-script-hidden', 'true');
    }
  };

  const scanPostsInScope = (scope) => {
    const posts = scope.querySelectorAll('shreddit-post:not([data-script-hidden="true"])');
    posts.forEach(processPost);
  };

  const setupFeedListeners = (feed) => {
    if (!shouldProcess()) {
      if (feedObserver) feedObserver.disconnect();
      return;
    }

    console.log('Reddit Hider (v11): New feed detected. Scanning posts.');

    if (feedObserver) {
      feedObserver.disconnect();
    }

    scanPostsInScope(feed);

    feedObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (node.matches('shreddit-post')) {
                processPost(node);
              } else {
                scanPostsInScope(node);
              }
            }
          });
        }
      }
    });
    feedObserver.observe(feed, { childList: true, subtree: true });
  };

  const initialize = () => {
    const pageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (node.matches('shreddit-feed')) {
                setupFeedListeners(node);
              } else if (node.querySelector) {
                const feed = node.querySelector('shreddit-feed');
                if (feed) {
                  setupFeedListeners(feed);
                }
              }
            }
          });
        }
      }
    });

    pageObserver.observe(document.body, { childList: true, subtree: true });

    const initialFeed = document.querySelector('shreddit-feed');
    if (initialFeed) {
      setupFeedListeners(initialFeed);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
