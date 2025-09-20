/* Copyright (C) 2014-2025 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* global tree, notify */
'use strict';

const properties = document.querySelector('#properties');
properties.addEventListener('keyup', e => {
  const target = e.target;
  const tr = target.closest('tr');
  if (tr) {
    tr.querySelector('[type=submit]').disabled = !(target && target.dataset.value !== target.value && target.value);
  }
});
properties.addEventListener('submit', async e => {
  e.preventDefault();
  e.stopPropagation();

  const form = e.target;
  const tr = properties.querySelector('[form=' + form.id + ']').closest('tr');
  const id = properties.dataset.id;
  const input = tr.querySelector('input');
  const prp = {};
  prp[form.id] = input.value;

  const ids = e.shiftKey ? tree.jstree('get_selected') : [id];

  for (const id of ids) {
    try {
      await chrome.bookmarks.update(id, prp);

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
    }
    catch (e) {
      console.error(e);
      notify.inline('[Refresh Required] ' + e.message);
    }
  }
  // resetting fuse
  window.dispatchEvent(new Event('search:reset-fuse'));
});
// add support for shiftKey to submit
{
  const fix = e => {
      e.preventDefault();
      e.stopPropagation();
      const ev = new Event('submit', {
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(ev, 'shiftKey', {
        value: true
      });
      e.target.form.dispatchEvent(ev);
  };
  properties.addEventListener('keydown', e => {
    if (e.shiftKey) {
      if (e.key === 'Enter' && e.target?.form?.id === 'title') {
        fix(e);
      }
    }
  });
  properties.addEventListener('mousedown', e => {
    if (e.shiftKey) {
      if (e.target?.form?.id === 'title') {
        fix(e);
      }
    }
  });
}

addEventListener('properties:select-title', () => {
  const title = properties.querySelector('tr:nth-child(1) input');
  title.focus();
  title.select();
});
addEventListener('properties:select-link', () => {
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

  title.disabled = data.node.id.startsWith('feed-') || data.node.data.drag === false;
  const url = properties.querySelector('tr:nth-child(2) input');
  url.disabled = data.node.data.drag === false || data.node.data.url === '';
  url.dataset.value = url.value = data.node.data.url;
  url.dispatchEvent(new Event('keyup', {
    bubbles: true
  }));

  const d = new Date(data.node.data.dateAdded);
  properties.querySelector('tr:nth-child(3) span').textContent = d.toDateString() + ' ' + d.toLocaleTimeString();

  // disable on multiple select
  // properties.dataset.enable = data.selected.length === 1;
});
