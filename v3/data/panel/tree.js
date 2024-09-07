/* Copyright (C) 2014-2022 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* global $, utils, notify */
'use strict';

function getRoot() {
  if (localStorage.getItem('root')) {
    return localStorage.getItem('root');
  }
  return /Firefox/.test(navigator.userAgent) ? 'root________' : '0';
}

const tree = $('#tree');
tree.isFeed = url => url && (
  url.indexOf('rss') !== -1 ||
  url.indexOf('feed') !== -1
);
tree.string = {};
tree.plugins = ['state', 'dnd', 'types', 'contextmenu', 'conditionalselect'];
if (localStorage.getItem('sort') === 'true') {
  tree.plugins.push('sort');
}

tree.element = id => $('#' + id);

tree.activate = () => {
  try {
    const ids = tree.jstree('get_selected');
    const id = ids[0];
    tree.jstree('hover_node', tree.element(id));
  }
  catch (e) {
    console.error(e);
  }
  window.setTimeout(() => tree.focus(), 100);
};

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
  'plugins': tree.plugins,
  'conditionalselect': node => {
    if (node.data && node.data.type === 'separator') {
      return false;
    }
    return true;
  },
  'core': {
    // Content Security Policy: The page’s settings blocked the loading of a resource at blob:moz-extension://
    'worker': !/Firefox/.test(navigator.userAgent),
    'check_callback': (operation, node) => {
      // do not allow drag and drop in sort mode
      if (localStorage.getItem('sort') === 'true' && operation === 'move_node') {
        return false;
      }
      if (operation === 'move_node') {
        // do not allow moving of the root elements
        // do not allow moving to the root
        return node.data.drag;
      }
      // do not allow inline-edit
      if (operation === 'edit') {
        return false;
      }
      return true;
    },
    'multiple': true,
    'data': (obj, cb) => {
      if (obj.data && obj.data.feed) {
        fetch(obj.data.url).then(r => r.text())
          .then(str => (new DOMParser()).parseFromString(str, 'text/xml'))
          .then(doc => {
            const items = [...doc.querySelectorAll('item')];
            if (items && items.length) {
              cb(items.map(item => {
                const url = item.querySelector('link').textContent;
                const title = item.querySelector('title').textContent || 'unknown title';
                const date = item.querySelector('pubDate').textContent || '';
                return {
                  text: tree.string.escape(title),
                  id: 'feed-' + Math.random(),
                  type: 'file',
                  icon: utils.favicon(url),
                  children: false,
                  a_attr: { // open with middle-click
                    href: url
                  },
                  data: {
                    dateGroupModified: date,
                    dateAdded: date,
                    url,
                    feed: tree.isFeed(url),
                    drag: false
                  }
                };
              }));
            }
            else {
              throw Error('empty feed');
            }
          }).catch(e => {
            cb([{
              text: e.message || 'unknown error',
              id: 'feed-' + Math.random(),
              type: 'file',
              icon: '',
              children: false,
              a_attr: { // open with middle-click
                href: ''
              },
              data: {
                dateGroupModified: '',
                dateAdded: '',
                url: '',
                feed: false,
                drag: false
              }
            }]);
          });
      }
      else {
        chrome.bookmarks.getChildren(obj.id === '#' ? getRoot() : obj.id, nodes => {
          cb(nodes.map(node => {
            const feed = tree.isFeed(node.url);
            const children = !node.url || feed === true;
            const drag = node.parentId !== '0' && node.parentId !== 'root________';
            const rtn = {
              text: node.type === 'separator' ? '..............' : tree.string.escape(node.title),
              id: node.id,
              type: children ? (drag ? 'folder' : 'd_folder') : (node.type === 'separator' ? 'separator' : 'file'),
              icon: children ? null : utils.favicon(node.url),
              children,
              a_attr: { // open with middle-click
                href: node.url || '#'
              },
              data: {
                type: node.type,
                dateGroupModified: node.dateGroupModified,
                dateAdded: node.dateAdded,
                url: node.url || '',
                feed,
                drag
              },
              state: {
                hidden: node.url && node.url.startsWith('place:')
              }
            };
            if (node.type === 'separator') {
              rtn.li_attr = {
                'class': 'separator'
              };
            }
            return rtn;
          }));
        });
      }
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
      'Open Link in New Tab': {
        'separator_before': true,
        'label': 'Open Link in New Tab',
        'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
          detail: 'new-tab'
        })),
        '_disabled': () => !node.data.url
      },
      'Open Link in Background Tab': {
        'label': 'Open Link in Background Tab',
        'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
          detail: 'background-tab'
        })),
        '_disabled': () => !node.data.url
      },
      'Open Link in New Window': {
        'label': 'Open Link in New Window',
        'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
          detail: 'new-window'
        })),
        '_disabled': () => !node.data.url
      },
      'Open Link in Incognito Window': {
        'label': 'Open Link in Incognito Window',
        'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
          detail: 'incognito-window'
        })),
        '_disabled': () => !node.data.url
      },
      'Rename Title': {
        'separator_before': true,
        'label': 'Rename Title',
        'action': () => dispatchEvent(new Event('properties:select-title')),
        '_disabled': () => node.data.drag === false
      },
      'Edit Link': {
        'label': 'Edit Link',
        'action': () => dispatchEvent(new Event('properties:select-link')),
        '_disabled': () => !node.data.url
      },
      'Delete Bookmark': {
        'label': 'Delete Bookmark',
        'action': () => document.querySelector('#toolbar [data-cmd="delete"]').click(),
        '_disabled': () => node.data.drag === false
      },
      'Validate Bookmark': {
        'separator_before': true,
        'label': 'Search or Validate Bookmarks',
        'action': () => {
          const input = document.querySelector('#search input');
          const ids = tree.jstree('get_selected');
          if (ids.length > 1) {
            input.value = (node.data.url, 'id:') + ids.join(',');
          }
          else {
            const node = tree.jstree('get_node', ids[0]);
            input.value = (node.data.url, node.data.url ? 'id:' : 'root:') + ids.join(',') + ' ';
          }
          input.dispatchEvent(new Event('search'));
          input.focus();
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
  },
  'sort': function(a, b) {
    a = this.get_node(a);
    b = this.get_node(b);

    if (a.data.url && !b.data.url) {
      return 1;
    }
    if (b.data.url && !a.data.url) {
      return -1;
    }
    return a.text > b.text ? -1 : 1;
  }
});

// activate on startup
if (localStorage.getItem('searchfocus') !== 'true') {
  tree.one('state_ready.jstree', () => {
    tree.activate();
  });
}

// open links on dblclick or Enter
{
  const dblclick = (node, e = {shiftKey: false}) => {
    if (node && node.data && node.data.url && node.data.feed === false) {
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
        if (location.search.indexOf('in=') === -1) {
          window.close();
        }
      });
    }
  };
  tree.on('dblclick.jstree', e => {
    const ids = tree.jstree('get_selected');
    const node = tree.jstree('get_node', ids[0]);
    dblclick(node, e);
  });
  // on Enter

  tree.on('keydown.tree', e => {
    if (e.key !== 'Enter') {
      return true;
    }

    const selected = tree.jstree('get_selected');
    const current = tree.jstree('get_node', e.target);

    // select the hovered node
    if (e.altKey && current.type === 'file') {
      return true;
    }

    if (current && selected.indexOf(current.id) !== -1) {
      dblclick(current);
      return false;
    }
    return true;
  });
}

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
      index: data.position + (data.position > data.old_position ? 1 : 0)
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
      }
    });
  }
});

// do not handle ctrlKey + shiftKey keys
tree.on('keydown.tree', e => {
  if (e.ctrlKey && e.shiftKey) {
    e.stopImmediatePropagation();
    return false;
  }
});

addEventListener('tree:open-array', e => {
  const arr = e.detail.nodes;
  tree.jstree('deselect_all');
  tree.jstree('close_all');
  tree.jstree('close_all', () => {
    tree.jstree('load_node', arr.reverse(), () => {
      const id = arr[0];
      tree.jstree('select_node', id);
      try {
        document.getElementById(id + '_anchor').scrollIntoView();
      }
      catch (e) {}
    });
  });
});

// context menu open
addEventListener('actions:open-links', e => {
  const ids = tree.jstree('get_selected');
  const nodes = ids.map(id => tree.jstree('get_node', id));

  if (e.detail === 'new-tab' || e.detail === 'background-tab') {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, ([tab]) => {
      nodes.forEach((node, n) => {
        if (node.data.url) {
          chrome.tabs.create({
            url: node.data.url,
            active: e.detail === 'new-tab',
            index: tab.index + n + 1
          }).catch(e => notify.inline(e.message));
        }
      });
    });
  }
  else if (e.detail === 'new-window' || e.detail === 'incognito-window') {
    chrome.windows.create({
      url: nodes.map(n => n.data.url).filter(s => s),
      incognito: e.detail === 'incognito-window',
      focused: true
    }).catch(e => notify.inline(e.message));
  }
});

// theme
{
  const dark = () => {
    tree.jstree('set_theme', 'default-dark');
    document.documentElement.classList.add('dark');
  };
  const light = () => {
    tree.jstree('set_theme', 'default');
    document.documentElement.classList.remove('dark');
  };

  const run = () => {
    const ts = localStorage.getItem('theme-source') || 'auto';
    if (ts === 'auto') {
      if (matchMedia('(prefers-color-scheme: dark)').matches) {
        return dark();
      }
    }
    else if (ts === 'dark') {
      return dark();
    }

    light();
  };
  run();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    run();
  });
  chrome.runtime.onMessage.addListener(request => request.cmd === 'theme-source' && run());
}
