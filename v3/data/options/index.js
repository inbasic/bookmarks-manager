/* Copyright (C) 2014-2022 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

'use strict';

var log = document.getElementById('status');

function restore() {
  document.getElementById('css').value = localStorage.getItem('css') || '';
  document.getElementById('sort').checked = localStorage.getItem('sort') === 'true';
  document.getElementById('searchfocus').checked = localStorage.getItem('searchfocus') === 'true';
  document.getElementById('resolve').checked = localStorage.getItem('resolve') === 'true';
  document.getElementById('theme-source').value = localStorage.getItem('theme-source') || 'auto';
  document.getElementById('rss-support').checked = localStorage.getItem('rss-support') || 'true';

  chrome.storage.local.get({
    width: 500,
    height: 600,
    context: '',
    mode: 'popup'
  }, prefs => {
    document.getElementById('width').value = prefs.width;
    document.getElementById('height').value = prefs.height;
    document.getElementById('context').value = prefs.context;
    document.getElementById('mode').value = prefs.mode;
  });
}

function save() {
  localStorage.setItem('css', document.getElementById('css').value || '');
  localStorage.setItem('sort', document.getElementById('sort').checked);
  localStorage.setItem('searchfocus', document.getElementById('searchfocus').checked);
  localStorage.setItem('resolve', document.getElementById('resolve').checked);
  localStorage.setItem('theme-source', document.getElementById('theme-source').value);
  localStorage.setItem('rss-support', document.getElementById('rss-support').checked);

  chrome.runtime.sendMessage({
    cmd: 'theme-source'
  });

  const prefs = {
    width: Math.max(300, document.getElementById('width').value),
    height: Math.max(400, document.getElementById('height').value),
    context: document.getElementById('context').value,
    mode: document.getElementById('mode').value
  };

  chrome.storage.local.set(prefs, () => {
    log.textContent = 'Options saved.';
    setTimeout(() => log.textContent = '', 750);
    restore();
  });
}

document.addEventListener('DOMContentLoaded', restore);
document.getElementById('save').addEventListener('click', () => {
  try {
    save();
  }
  catch (e) {
    log.textContent = e.message;
    setTimeout(() => log.textContent = '', 750);
  }
});

document.getElementById('reset').addEventListener('click', e => {
  if (e.detail === 1) {
    window.setTimeout(() => log.textContent = '', 750);
    log.textContent = 'Double-click to reset!';
  }
  else {
    localStorage.clear();
    chrome.storage.local.clear(() => {
      chrome.runtime.reload();
      window.close();
    });
  }
});

document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

if (navigator.userAgent.indexOf('Firefox') !== -1) {
  document.getElementById('rate').href =
    'https://addons.mozilla.org/en-US/firefox/addon/bookmarks-manager-and-viewer/reviews/';
}
else if (navigator.userAgent.indexOf('OPR') !== -1) {
  document.getElementById('rate').href =
    'https://addons.opera.com/en/extensions/details/bookmarks-manager-and-viewer/#feedback-container';
}

// links
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    a.href = chrome.runtime.getManifest().homepage_url + '#' + a.dataset.href;
  }
}
