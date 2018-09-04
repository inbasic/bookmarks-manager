/* Copyright (C) 2014-2017 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* globals $, utils, notify */
'use strict';

function getRoot() {
  if (localStorage.getItem('root')) {
    return localStorage.getItem('root');
  }
  return typeof InstallTrigger !== 'undefined' ? 'root________' : '0';
}

var tree = $('#tree');

tree.string = {};
tree.string.escape = str => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
tree.string.uscape = str => str
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, `'`)
  .replace(/&amp;/g, '&');

tree.jstree({
  'types': {
    'file': {
      'icon': 'item',
      'max_children': 0
    },
    'folder': {
      'icon': 'folder'
    },
    'd_folder': {
      'icon': 'd_folder'
    }
  },
  'plugins': ['state', 'dnd', 'types', 'contextmenu', 'conditionalselect'],
  'conditionalselect': node => node.parent !== '#',
  'core': {
    // Content Security Policy: The page’s settings blocked the loading of a resource at blob:moz-extension://
    'worker': !/Firefox/.test(navigator.userAgent),
    'check_callback': (operation, node, parent) => {
      if (operation === 'move_node') {
        // do not allow moving of the root elements
        // do not allow moving to the root
        if (node.parent === '#' || parent.id === '#') {
          return false;
        }
      }
      return true;
    },
    'multiple': true,
    'data': (obj, cb) => {
      chrome.bookmarks.getChildren(obj.id === '#' ? getRoot() : obj.id, nodes => {
        cb(nodes.map(node => {
          const children = !node.url;
          return {
            text: tree.string.escape(node.title),
            id: node.id,
            type: children ? (obj.id === '#' ? 'd_folder' : 'folder') : 'file',
            icon: children ? null : utils.favicon(node.url),
            children,
            a_attr: { // open with middle-click
              href: node.url || '#'
            },
            data: {
              dateGroupModified: node.dateGroupModified,
              dateAdded: node.dateAdded,
              url: node.url || ''
            },
            state: {
              hidden: node.url && node.url.startsWith('place:')
            }
          };
        }));
      });
    }
  },
  'contextmenu': {
    'items': node => ({
      'Copy Title': {
        'label': 'Copy Title',
        'action': () => {
          const ids = tree.jstree('get_selected');
          const nodes = ids.map(id => tree.jstree('get_node', id));

          utils.copy(nodes.map(node => node.text).join('\n'));
        }
      },
      'Copy Link': {
        'label': 'Copy Link',
        'action': () => {
          const ids = tree.jstree('get_selected');
          const nodes = ids.map(id => tree.jstree('get_node', id));

          utils.copy(nodes.map(node => node.data.url).join('\n'));
        },
        '_disabled': () => !node.data.url
      },
      'Copy ID': {
        'label': 'Copy ID',
        'action': () => {
          const ids = tree.jstree('get_selected');
          utils.copy(ids.join('\n'));
        }
      },
      'Rename Title': {
        'separator_before': true,
        'label': 'Rename Title',
        'action': () => window.dispatchEvent(new Event('properties:select-title'))
      },
      'Edit Link': {
        'label': 'Edit Link',
        'action': () => window.dispatchEvent(new Event('properties:select-link')),
        '_disabled': () => !node.data.url
      },
      'Delete Bookmark': {
        'label': 'Delete Bookmark',
        'action': () => document.querySelector('#toolbar [data-cmd="delete"]').click()
      },
      'Validate Bookmark': {
        'separator_before': true,
        'label': 'Validate Bookmarks',
        'action': () => {
          const input = document.querySelector('#search input');
          const ids = tree.jstree('get_selected');
          if (ids.length > 1) {
            input.value = (node.data.url, 'id:') + ids.join(',');
          }
          else {
            const node = tree.jstree('get_node', ids[0]);
            input.value = (node.data.url, node.data.url ? 'id:' : 'root:') + ids.join(',');
          }
          input.dispatchEvent(new Event('search'));
        }
      },
      'Set as Root': {
        'label': 'Set as Root',
        'action': () => {
          const ids = tree.jstree('get_selected');

          if (ids.length === 1) {
            localStorage.setItem('root', ids[0]);
            location.reload();
          }
          else {
            notify.inline('Please select a single directory');
          }
        },
        '_disabled': () => node.data.url
      }
    })
  }
});

tree.on('dblclick.jstree', e => {
  const ids = tree.jstree('get_selected');
  const node = tree.jstree('get_node', ids[0]);

  if (node && node.data && node.data.url) {
    const url = node.data.url;
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      // if current tab is new tab, update it
      if (tabs.length && tabs[0].url === 'chrome://newtab/' || tabs[0].url === 'about:newtab' || e.shiftKey) {
        chrome.tabs.update({url});
      }
      else {
        chrome.tabs.create({url});
      }
      window.close();
    });
  }
});

tree.on('move_node.jstree  copy_node.jstree', (e, data) => {
  if (e.type === 'copy_node') { // copy
    const b = {
      parentId: data.parent,
      index: data.position,
      title: data.node.text,
      url: data.original.data.url
    };
    if (!b.url) { // delete URL if not available
      delete b.url;
    }
    chrome.bookmarks.create(b, bookmark => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
        tree.jstree('delete_node', data.node);
      }
      else {
        // update node
        tree.jstree(true).set_id(data.node, bookmark.id);
        data.node.data = {
          dateGroupModified: bookmark.dateGroupModified,
          dateAdded: bookmark.dateAdded,
          url: bookmark.url || ''
        };
        // repair new created child bookmarks
        data.original.children.forEach((id, index) => {
          const original = tree.jstree('get_node', id);
          const position = tree.jstree('get_node', data.original).children.indexOf(id);
          tree.trigger('copy_node.jstree', {
            node: tree.jstree('get_node', data.node.children[index]),
            original,
            parent: bookmark.id,
            position
          });
        });
      }
    });
  }
  else {
    chrome.bookmarks.move(data.node.id, {
      parentId: data.parent,
      index: data.position
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
      }
    });
  }
});

window.addEventListener('tree:open-array', e => {
  const arr = e.detail.nodes;
  tree.jstree('deselect_all');
  tree.jstree('close_all');
  tree.jstree('close_all', () => {
    tree.jstree('load_node', arr.reverse(), () => {
      const id = arr[0];
      tree.jstree('select_node', id);
      $('#' + id + '_anchor').focus();
    });
  });
});
