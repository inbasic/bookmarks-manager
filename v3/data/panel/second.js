/* Copyright (C) 2014-2022 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* global $, utils, getRoot */
'use strict';

{
  const tree = $('#tree [data-id=two]');
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
    'plugins': [
      'dnd'
    ],
    'core': {
      // Content Security Policy: The page’s settings blocked the loading of a resource at blob:moz-extension://
      'worker': !/Firefox/.test(navigator.userAgent),
      'check_callback': true,
      'multiple': true,
      'data': function(obj, cb) {
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
    }
  });
}
