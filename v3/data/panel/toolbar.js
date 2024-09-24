/* Copyright (C) 2014-2022 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* global tree, notify, utils */
'use strict';

document.addEventListener('click', e => {
  const cmd = e.target.dataset.cmd;
  if (cmd === 'collapse') {
    tree.jstree('deselect_all');
    tree.jstree('close_all');
  }
  else if (cmd === 'delete') {
    const ids = tree.jstree('get_selected');
    const nodes = ids.map(id => tree.jstree('get_node', id));

    notify.confirm(`Are you sure you want to delete:

  ${nodes.map((node, i) => (i + 1) + '. ' + (node.data.url || node.text)).join('\n  ')}`, a => {
      if (a) {
        nodes.forEach(node => chrome.bookmarks[node.type === 'folder' ? 'removeTree' : 'remove'](node.id, () => {
          // jstree
          tree.jstree('select_node', node.parent);
          if (tree.jstree('delete_node', node.id) === false) {
            notify.inline('Cannot delete nodes');
            throw Error('CANNOT_DELETE');
          }
          // results
          const results = document.querySelector('#results tbody');
          const rtr = results.querySelector(`[data-id="${node.id}"]`);
          if (rtr) {
            rtr.parentNode.removeChild(rtr);
          }
          // reseting fuse
          window.dispatchEvent(new Event('search:reset-fuse'));
        }));
      }
    });
  }
  else if (cmd === 'create-folder' || cmd === 'create-bookmark' || cmd === 'create-from-tab') {
    const ids = tree.jstree('get_selected');

    if (ids.length === 0) {
      return notify.inline('Please select a node first');
    }
    const id = ids[0];
    const node = tree.jstree('get_node', id);
    const parentId = node.type === 'folder' ? node.id : node.parent;

    const prp = {
      parentId
    };
    if (node.type === 'folder') {
      prp.index = 0;
    }
    else {
      const parent = tree.jstree('get_node', node.parent);
      prp.index = parent.children.indexOf(node.id) + 1;
    }
    (function(callback) {
      if (cmd === 'create-folder') {
        return callback(null, 'new directory');
      }
      else if (cmd === 'create-bookmark') {
        return callback('http://example.com', 'new bookmark');
      }
      else {
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, tabs => {
          callback(tabs[0].url, tabs[0].title);
        });
      }
    })(function(url, title) {
      prp.url = url;
      prp.title = title;
      chrome.bookmarks.create(prp, node => {
        tree.jstree('create_node', parentId, {
          text: node.title,
          id: node.id,
          type: url ? 'file' : 'folder',
          icon: url ? utils.favicon(url) : null,
          data: {
            dateGroupModified: node.dateGroupModified,
            dateAdded: node.dateAdded,
            url
          }
        }, node.index, node => {
          window.focus();
          tree.focus();
          tree.jstree('deselect_all');
          tree.jstree('select_node', node.id);
        });
        tree.jstree('open_node', parentId);
      });
    });
  }
  else if (cmd === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
  else if (cmd === 'open-in-tab') {
    chrome.tabs.create({
      url: '/data/panel/index.html?in=tab'
    });
  }
  else if (cmd === 'reset-root') {
    localStorage.removeItem('root');
    location.reload();
  }
  else if (cmd === 'bookmark-manager') {
    chrome.tabs.create({
      url: 'chrome://bookmarks/'
    }, () => chrome.runtime.lastError && notify.warning(chrome.runtime.lastError.message));
  }
  else if (cmd === 'update-title') {
    const name = e.target.textContent;

    const ids = tree.jstree('get_selected');
    const id = ids[0];
    const node = tree.jstree('get_node', id);

    if (node.data.url) {
      chrome.permissions.request({
        origins: [node.data.url]
      }, () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 6000);

        e.target.textContent = 'Please wait...';
        fetch(node.data.url, {
          signal: controller.signal
        }).then(r => r.text()).then(content => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');

          const e = doc.querySelector('title');
          if (e && e.textContent) {
            const input = document.querySelector('#properties input[form=title]');
            if (input.value === e.textContent) {
              throw Error('"title" is up-do-date');
            }
            else {
              input.value = e.textContent;
              input.dispatchEvent(new Event('keyup', {
                bubbles: true
              }));
              return;
            }
          }
          throw Error('Cannot find title');
        }).catch(e => {
          console.warn(e);
          notify.inline(e.message);
        }).finally(() => e.target.textContent = name);
      });
    }
    else {
      notify.inline('This bookmark is not representing a webpage');
    }
  }
});
// keyboard shortcut
document.addEventListener('keydown', e => {
  if (
    ((e.ctrlKey || e.metaKey) && e.shiftKey) ||
    e.code === 'Delete' ||
    e.code === 'Backspace'
  ) {
    switch (e.code) {
    case 'KeyC':
      document.querySelector('[data-cmd=collapse]').click();
      break;
    case 'KeyU':
      document.querySelector('[data-cmd=update-title]').click();
      break;
    case 'KeyO':
      document.querySelector('[data-cmd=open-options]').click();
      break;
    case 'KeyR':
      document.querySelector('[data-cmd=reset-root]').click();
      break;
    case 'KeyB':
      document.querySelector('[data-cmd=create-bookmark]').click();
      break;
    case 'KeyT':
      document.querySelector('[data-cmd=create-from-tab]').click();
      break;
    case 'KeyD':
      document.querySelector('[data-cmd=create-folder]').click();
      break;
    case 'KeyE':
      window.dispatchEvent(new Event('properties:select-title'));
      break;
    case 'KeyL':
      tree.activate();
      break;
    case 'Backspace':
    case 'Delete':
      if (e.target.tagName !== 'INPUT') {
        document.querySelector('#toolbar [data-cmd="delete"]').click();
      }
      break;
    }
    e.stopImmediatePropagation();
    return false;
  }
});
