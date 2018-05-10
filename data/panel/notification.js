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

var notify = (function() {
  const div = document.getElementById('notification');
  const p = div.querySelector('pre');
  let callback = function() {};

  div.querySelector('[data-cmd=yes]').addEventListener('click', () => {
    div.style.display = 'none';
    callback(true);
  });
  div.querySelector('[data-cmd=no]').addEventListener('click', () => {
    div.style.display = 'none';
    callback(false);
  });
  div.querySelector('[data-cmd=ok]').addEventListener('click', () => {
    div.style.display = 'none';
  });

  const ts = document.querySelector('#toolbar span');
  let id;

  return {
    confirm: function(msg, c) {
      p.title = p.textContent = msg;
      div.style.display = 'flex';
      div.dataset.type = 'confirm';
      callback = c;
    },
    warning: function(msg) {
      p.title = p.textContent = msg;
      div.style.display = 'flex';
      div.dataset.type = 'warning';
    },
    inline: function(msg) {
      window.clearTimeout(id);
      ts.title = ts.textContent = msg;
      id = window.setTimeout(() => ts.title = ts.textContent = '', 5000);
    }
  };
})();

chrome.runtime.onMessage.addListener(request => {
  if (request.cmd === 'notify.inline') {
    notify.inline(request.msg);
  }
});
