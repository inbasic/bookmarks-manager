/*******************************************************************************
    Bookmark Manager and Viewer - An elegant bookmark manager with fuzzy search and more

    Copyright (C) 2014-2017 InBasic

    This program is free software: you can redistribute it and/or modify
    it under the terms of the Mozilla Public License as published by
    the Mozilla Foundation, either version 2 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    Mozilla Public License for more details.
    You should have received a copy of the Mozilla Public License
    along with this program.  If not, see {https://www.mozilla.org/en-US/MPL/}.

    Home: http://add0n.com/bookmarks-manager.html
    GitHub: https://github.com/inbasic/bookmarks-manager/
*/

'use strict';

var notify = (function() {
  const div = document.getElementById('notification');
  const p = div.querySelector('p');
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
