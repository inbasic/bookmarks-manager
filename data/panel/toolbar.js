/* Copyright (C) 2014-2017 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* globals tree, notify, utils */
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
    console.log(nodes);
    notify.confirm(`Are you sure you want to delete:
  ${nodes.map((node, i) => (i + 1) + '. "' + (node.data.url || node.text) + '"').join('\n  ')}`, a => {
      if (a) {
        nodes.forEach(node => chrome.bookmarks[node.type === 'folder' ? 'removeTree' : 'remove'](node.id, () => {
          // jstree
          tree.jstree('select_node', node.parent);
          tree.jstree('delete_node', node.id);
          console.log(node.id);
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
});

chrome.runtime.onMessage.addListener(request => {
  if (request.cmd === 'title-info') {
    const ids = tree.jstree('get_selected');
    const id = ids[0];
    if (request.id === id) {
      const input = document.querySelector('#properties input[form=title]');
      if (input.value !== request.title) {
        input.value = request.title;
        input.dispatchEvent(new Event('keyup', {
          bubbles: true
        }));
      }
      else {
        chrome.runtime.sendMessage({
          cmd: 'notify.inline',
          msg: '"title" is up-do-date'
        });
      }
    }
  }
});
