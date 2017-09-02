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

/* globals $, utils */
'use strict';

function getRoot() {
  return typeof InstallTrigger !== 'undefined' ? 'root________' : '0';
}

var tree = $('#tree');
tree.jstree({
  'types': {
    'file': {
      'icon': 'item',
      'max_children': 0
    },
    'folder': {
      'icon': 'folder'
    }
  },
  'plugins' : [
    'state',
    'dnd',
    'types',
    'contextmenu'
  ],
  'core' : {
    'check_callback' : true,
    'multiple': false,
    'data' : function(obj, cb) {
      chrome.bookmarks.getChildren(obj.id === '#' ? getRoot() : obj.id, nodes => {
        cb.call(this, nodes.map(node => {
          const children = !node.url;
          return {
            text: node.title,
            id: node.id,
            type: children ? 'folder' : 'file',
            icon: children ? null : utils.favicon(node.url),
            children,
            data: {
              dateGroupModified: node.dateGroupModified,
              dateAdded: node.dateAdded,
              url: node.url || ''
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
        'action': () => utils.copy(node.text)
      },
      'Copy Link': {
        'label': 'Copy Link',
        'action': () => utils.copy(node.data.url),
        '_disabled': () => !node.data.url
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
    })
  }
});

tree.on('dblclick.jstree', () => {
  const ids = tree.jstree('get_selected');
  const node = tree.jstree('get_node', ids[0]);
  if (node && node.data && node.data.url) {
    const url = node.data.url;
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      // if current tab is new tab, update it
      if (tabs.length && tabs[0].url === 'chrome://newtab/' || tabs[0].url === 'about:newtab') {
        chrome.tabs.update({url});
      }
      else {
        chrome.tabs.create({url});
      }
      window.close();
    });
  }
});

tree.on('move_node.jstree', (e, data) => {
  chrome.bookmarks.move(data.node.id, {
    parentId: data.parent,
    index: data.position + (data.old_position >= data.position ? 0 : 1)
  });
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
