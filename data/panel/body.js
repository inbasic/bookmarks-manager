'use strict';

chrome.storage.local.get({
  width: 400,
  height: 600
}, prefs => {
  document.body.style.width = prefs.width + 'px';
  document.body.style.height = prefs.height + 'px';
});
