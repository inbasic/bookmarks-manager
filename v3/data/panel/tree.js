/* Copyright (C) 2014-2025 InBasic
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

const manager = {
  action: null,
  async copy() {
    const items = []; // for clipboard storage

    const children = async id => {
      const childs = await chrome.bookmarks.getChildren(id);
      const results = [];

      for (const node of childs) {
        const c = {
          id: node.id,
          text: node.title
        };
        if (node.url) {
          c.url = node.url;
          items.push({
            title: node.title,
            url: node.url
          });
        }
        else {
          c.children = await children(node.id);
        }
        results.push(c);
      }
      return results;
    };
    const nodes = [];
    for (const id of tree.jstree('get_selected')) {
      const node = tree.jstree('get_node', id);
      const n = {
        id,
        text: node.text,
        url: node.data.url
      };
      items.push({
        title: n.text,
        url: n.url
      });
      if (['folder', 'd_folder'].includes(node.type)) {
        n.children = await children(id);
      }
      nodes.push(n);
    }
    // for browsers to paste
    {
      const html = items.map(i => `<a href="${i.url || i.title}">${i.title}</a>`).join('<br>');
      const text = items.map(i => i.url || i.title).join('\n');

      navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], {type: 'text/plain'}),
          'text/html': new Blob([html], {type: 'text/html'})
        })
      ]);
    }

    manager.action = {
      command: 'copy',
      nodes
    };
  },
  cut() {
    const ids = tree.jstree('get_selected');
    manager.action = {
      command: 'cut',
      ids
    };
  },
  async paste() {
    const ids = tree.jstree('get_selected');
    const node = tree.jstree('get_node', ids[0]);

    const isDir = ['folder', 'd_folder'].includes(node.type);
    const parentId = isDir ? node.id : node.parent;

    // since we support paste from clipboard
    manager.action = manager.action || {
      command: 'copy'
    };

    if (manager.action.command === 'cut') {
      let index = 0;
      if (isDir === false) {
        if ('index' in node.data) {
          index = node.data.index + 1;
        }
      }
      for (const id of manager.action.ids) {
        await chrome.bookmarks.move(id, {
          parentId,
          index
        });
        tree.jstree().move_node(id, parentId, index);
        index += 1;
      }
    }
    else if (manager.action.command === 'copy') {
      let index = 0;
      if (isDir === false) {
        if ('index' in node.data) {
          index = node.data.index + 1;
        }
      }
      const add = async (n, parentId, index) => {
        const nn = await chrome.bookmarks.create({
          parentId,
          index,
          title: n.text,
          url: n.url
        });
        tree.jstree('create_node', parentId, {
          text: n.text,
          id: nn.id,
          type: n.url ? 'file' : 'folder',
          icon: n.url ? utils.favicon(n.url) : null,
          data: {
            index,
            dateGroupModified: nn.dateGroupModified || Date.now(),
            dateAdded: nn.dateAdded || Date.now(),
            url: n.url
          }
        }, index);

        if (n.children) {
          let mn = 0;
          for (const m of n.children) {
            await add(m, nn.id, mn);
            mn += 1;
          }
        }
      };

      if (!manager.action.nodes) {
        await chrome.permissions.request({
          permissions: ['clipboardRead']
        });
        const clipboard = await navigator.clipboard.readText();
        if (!clipboard) {
          throw Error('NO_CONTENT_TO_PASTE');
        }
        const items = clipboard.trim().split('\n');
        if (items.some(s => s.trim() === '')) {
          throw Error('INVALID_DATA');
        }
        manager.action.nodes = items.map(s => {
          if (s.startsWith('http')) {
            return {
              text: s,
              url: s
            };
          }
          else {
            return {
              text: s
            };
          }
        });
        // confirm from user
        if (manager.action.nodes.length > 10) {
          const c = await new Promise(resolve => {
            notify.confirm(`About to paste ${manager.action.nodes.length} items from clipboard?`, resolve);
          });
          if (!c) {
            delete manager.action.nodes;
            throw Error('USER_ABORT');
          }
          manager.action.next = 'delete'; // delete extracted data from clipboard to read new data
        }
      }
      for (const n of manager.action.nodes) {
        await add(n, parentId, index);
        index += 1;
      }
      if (manager.action.next === 'delete') {
        delete manager.action.next;
        delete manager.action.nodes;
      }
    }
    else {
      console.info('action not supported', manager.action.command);
    }
  }
};

const tree = $('#tree');
tree.isFeed = url => localStorage.getItem('rss-support') === 'true' && url &&
  (url.includes('rss') || url.includes('feed'));
tree.string = {};
tree.plugins = ['dnd', 'types', 'contextmenu', 'conditionalselect'];
if (localStorage.getItem('state') !== 'false') {
  tree.plugins.push('state');
}
if (localStorage.getItem('sort') === 'true') {
  tree.plugins.push('sort');
}

tree.element = id => $('#' + id);

tree.activate = () => {
  try {
    const ids = tree.jstree('get_selected');
    const id = ids[0];
    tree.jstree('hover_node', tree.element(id));

    tree.element(id).focus();
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
    'data': async (obj, cb) => {
      if (obj.data && obj.data.feed) {
        try {
          const r = await fetch(obj.data.url);
          if (!r.ok) {
            throw Error('FETCH_FAILE_' + r.status);
          }
          const str = await r.text();
          const doc = (new DOMParser()).parseFromString(str, 'text/xml');
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
        }
        catch (e) {
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
        }
      }
      else {
        const nodes = await chrome.bookmarks.getChildren(obj.id === '#' ? getRoot() : obj.id);

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
              index: node.index,
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
      }
    }
  },
  'contextmenu': {
    'items': node => {
      const items = {};

      {
        const submenu = {};
        submenu['Copy Title'] = {
          'label': 'Copy Title',
          'action': () => {
            const ids = tree.jstree('get_selected');
            const nodes = ids.map(id => tree.jstree('get_node', id));

            utils.copy(nodes.map(node => node.text).join('\n'));
          }
        };
        if (node.data.url) {
          submenu['Copy Link'] = {
            'label': 'Copy Link',
            'action': () => {
              const ids = tree.jstree('get_selected');
              const nodes = ids.map(id => tree.jstree('get_node', id));

              utils.copy(nodes.map(node => node.data.url).join('\n'));
            }
          };
        }
        submenu['Copy ID'] = {
          'label': 'Copy ID',
          'action': () => {
            const ids = tree.jstree('get_selected');
            utils.copy(ids.join('\n'));
          }
        };
        items['Copy Properties'] = {
          'label': 'Copy Properties',
          submenu
        };
      }
      items['Copy Bookmark'] = {
        'label': 'Copy Bookmark',
        'action': () => manager.copy()
      };
      if (node.data.drag) {
        items['Cut Bookmark'] = {
          'label': 'Cut Bookmark',
          'action': () => manager.cut()
        };
      }
      items['Paste Bookmark'] = {
        'label': 'Paste Bookmark',
        'action': () => {
          manager.paste().catch(e => {
            console.error(e);
            notify.inline(e.message);
          });
        }
      };
      if (node.data.url) {
        items['Open'] = {
          'label': 'Open',
          'separator_before': true,
          'submenu': {
            'Open Link in New Tab': {
              'label': 'Open Link in New Tab',
              'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
                detail: 'new-tab'
              }))
            },
            'Open Link in Background Tab': {
              'label': 'Open Link in Background Tab',
              'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
                detail: 'background-tab'
              }))
            },
            'Open Link in New Window': {
              'label': 'Open Link in New Window',
              'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
                detail: 'new-window'
              }))
            },
            'Open Link in Incognito Window': {
              'label': 'Open Link in Incognito Window',
              'action': () => dispatchEvent(new CustomEvent('actions:open-links', {
                detail: 'incognito-window'
              }))
            }
          }
        };
      }
      if (node.data.drag || node.data.url) {
        const submenu = {};
        if (node.data.drag) {
          submenu['Rename Title'] = {
            'label': 'Rename Title',
            'action': () => dispatchEvent(new Event('properties:select-title'))
          };
        }
        if (node.data.url) {
          submenu['Change Link'] = {
            'label': 'Change Link',
            'action': () => dispatchEvent(new Event('properties:select-link'))
          };
        }
        items['Edit'] = {
          'label': 'Edit',
          'separator_before': true,
          submenu
        };
      }
      if (node.data.drag) {
        items['Delete Bookmark'] = {
          'label': 'Delete Bookmark',
          'action': () => document.querySelector('#toolbar [data-cmd="delete"]').click()
        };
      }
      items['Validate Bookmark'] = {
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
      };
      if (!node.data.url) {
        items['Set as Root'] = {
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
          }
        };
      }

      return items;
    }
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

// Activate on startup
tree.one('state_ready.jstree', () => {
  // Bring the node into view
  const ids = tree.jstree('get_selected');
  if (ids.length) {
    const node = tree.jstree('get_node', ids[0], true)[0];
    node.scrollIntoView({
      block: 'center'
    });
  }

  if (localStorage.getItem('searchfocus') !== 'true') {
    tree.activate();
  }
});


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
          index: bookmark.index,
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
    let index = data.position;
    if (data.position > data.old_position) {
      if (/Firefox/.test(navigator.userAgent) === false) {
        index += 1;
      }
    }
    chrome.bookmarks.move(data.node.id, {
      parentId: data.parent,
      index
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
      }
    });
  }
});

// do not handle ctrlKey + shiftKey keys
// tree.on('keydown.tree', e => {
//   if (e.ctrlKey && e.shiftKey) {
//     e.stopImmediatePropagation();
//     return false;
//   }
// });

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
// copy & paste from keyword
tree.on('copy', e => {
  e.preventDefault();
  e.stopPropagation();
  manager.copy();
});
tree.on('cut', e => {
  e.preventDefault();
  e.stopPropagation();
  manager.cut();
});
tree.on('paste', e => {
  e.preventDefault();
  e.stopPropagation();
  manager.paste().catch(e => {
    console.error(e);
    notify.inline(e.message);
  });
});
