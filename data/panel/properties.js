/* Copyright (C) 2014-2017 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* globals tree, notify */
'use strict';

var properties = document.querySelector('#properties');
properties.addEventListener('keyup', e => {
  const target = e.target;
  const tr = target.closest('tr');
  if (tr) {
    tr.querySelector('[type=submit]').disabled = !(target && target.dataset.value !== target.value && target.value);
  }
});
properties.addEventListener('submit', e => {
  e.preventDefault();
  e.stopPropagation();

  const form = e.target;
  const tr = properties.querySelector('[form=' + form.id + ']').closest('tr');
  const id = properties.dataset.id;
  const input = tr.querySelector('input');
  const prp = {};
  prp[form.id] = input.value;

  chrome.bookmarks.update(id, prp, () => {
    input.dataset.value = input.value;
    tr.querySelector('[type=submit]').disabled = true;
    // updating search view
    const results = document.querySelector('#results tbody');
    const rtr = results.querySelector(`[data-id="${id}"]`);
    if (rtr) {
      rtr.querySelector('td:nth-child(' + (form.id === 'title' ? 1 : 2) + ')').textContent = input.value;
    }
    // updating tree view
    if (form.id === 'title') {
      tree.jstree('set_text', id, tree.string.escape(prp.title));
    }
    // reseting fuse
    window.dispatchEvent(new Event('search:reset-fuse'));
    //
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      notify.inline('[Refresh Required] ' + lastError.message);
    }
  });
});

window.addEventListener('properties:select-title', () => {
  const title = properties.querySelector('tr:nth-child(1) input');
  title.focus();
  title.select();
});
window.addEventListener('properties:select-link', () => {
  const url = properties.querySelector('tr:nth-child(2) input');
  url.focus();
  url.select();
});

tree.on('select_node.jstree', (e, data) => {
  properties.dataset.id = data.node.id;

  const title = properties.querySelector('tr:nth-child(1) input');
  title.dataset.value = title.value =
    tree.string.uscape(data.node.text);
  title.dispatchEvent(new Event('keyup', {
    bubbles: true
  }));
  const url = properties.querySelector('tr:nth-child(2) input');
  url.disabled = data.node.type === 'folder';
  url.dataset.value = url.value = data.node.data.url;
  url.dispatchEvent(new Event('keyup', {
    bubbles: true
  }));

  const d = new Date(data.node.data.dateAdded);
  properties.querySelector('tr:nth-child(3) span').textContent = d.toDateString() + ' ' + d.toLocaleTimeString();

  // disable on multiple select
  // properties.dataset.enable = data.selected.length === 1;
});
