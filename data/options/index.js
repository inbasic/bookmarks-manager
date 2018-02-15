/* Copyright (C) 2014-2017 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

'use strict';

var log = document.getElementById('status');

function restore() {
  document.getElementById('css').value = localStorage.getItem('css') || '';
  chrome.storage.local.get({
    width: 400,
    height: 600
  }, prefs => {
    Object.keys(prefs).forEach(name => {
      document.getElementById(name)[typeof prefs[name] === 'boolean' ? 'checked' : 'value'] = prefs[name];
    });
  });
}

function save() {
  localStorage.setItem('css', document.getElementById('css').value || '');
  const prefs = {
    width: Math.max(300, document.getElementById('width').value),
    height: Math.max(400, document.getElementById('height').value)
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
