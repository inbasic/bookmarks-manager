/* Copyright (C) 2014-2025 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* global $, utils, notify, sorter */
'use strict';

function getRoot() {
  if (localStorage.getItem('root')) {
    return localStorage.getItem('root');
  }
  return /Firefox/.test(navigator.userAgent) ? 'root________' : '0';
}

// id and settings of the virtual "Most Recent" folder (display-only)
const RECENT_ID = 'recent-virtual';
const RECENT_PREFIX = RECENT_ID + '-';

// tree node ID -> real bookmark ID (prefixed IDs belong to the virtual folder)
const recentRealId = id => id.startsWith(RECENT_PREFIX) ? id.slice(RECENT_PREFIX.length) : id;

const recentPrefs = () => new Promise(resolve => chrome.storage.local.get({
  recent: true,
  'recent-count': 10
}, prefs => resolve({
  enabled: prefs.recent === true,
  count: Math.min(200, Math.max(1, parseInt(prefs['recent-count']) || 10))
})));

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
      // the virtual "Most Recent" folder has no real counterpart
      if (node.id === 'recent-virtual') {
        continue;
      }
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
    const ids = tree.jstree('get_selected').filter(id => {
      const node = tree.jstree('get_node', id);
      // the virtual folder, its display nodes and the permanent
      // (top level) nodes can neither be cut nor moved
      return node.data && node.data.drag === true;
    });
    manager.action = {
      command: 'cut',
      ids
    };
  },
  async paste() {
    const ids = tree.jstree('get_selected');
    const node = ids.length ? tree.jstree('get_node', ids[0]) : null;

    if (!node) {
      return notify.inline('Please select a node first');
    }
    // the virtual "Most Recent" folder is read-only
    if (node && node.id === 'recent-virtual') {
      return notify.inline('Paste is not allowed inside the "Most Recent" folder');
    }
    if (node && node.parent === 'recent-virtual') {
      return notify.inline('Paste is not allowed inside the "Most Recent" folder');
    }

    const isDir = ['folder', 'd_folder'].includes(node.type);
    const parentId = isDir ? node.id : node.parent;

    // since we support paste from clipboard
    manager.action = manager.action || {
      command: 'copy'
    };

    if (manager.action.command === 'cut') {
      const realParent = parentId === '#' ? getRoot() : parentId;
      // insert anchor position; node.data.index may be stale, use the tree
      let index = 0;
      if (isDir === false) {
        index = tree.jstree('get_node', node.parent).children.indexOf(node.id) + 1;
      }
      // make sure the destination is loaded so that all moves below are synchronous
      // (already loaded directories are left untouched to preserve their state)
      if (parentId !== '#' && isDir && !tree.jstree('is_loaded', parentId)) {
        // do not wait forever in case loading fails
        await Promise.race([
          new Promise(resolve => tree.jstree('load_node', parentId, resolve)),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }
      // let the tree render the final arrangement first
      let refused = false;
      for (const id of manager.action.ids) {
        const target = tree.jstree('get_node', id);
        if (target) {
          target.data = target.data || {};
          // the programmatic move is handled below; the move handler must skip it
          target.data.syncMove = true;
          if (tree.jstree().move_node(id, parentId, index) === false) {
            // jsTree declined (sort mode); keep the browser move alive below
            refused = true;
            delete target.data.syncMove;
          }
        }
        index += 1;
      }
      // clear flags of moves that jsTree refused to perform
      for (const id of manager.action.ids) {
        const target = tree.jstree('get_node', id);
        if (target && target.data) {
          delete target.data.syncMove;
        }
      }
      if (refused) {
        // jsTree kept the sorted view; move in the browser and refresh
        const children = await chrome.bookmarks.getChildren(realParent);
        for (const id of manager.action.ids) {
          if (children.includes(id)) {
            continue;
          }
          const moved = await chrome.bookmarks.move(id, {
            parentId: realParent
          });
          const target = tree.jstree('get_node', id);
          if (target && moved) {
            target.data.index = moved.index;
          }
        }
        tree.jstree('refresh_node', realParent);
        return;
      }
      // now sync the browser with the rendered order; left-only moves are
      // safe for both Chrome and Firefox
      const dir = tree.jstree('get_node', parentId);
      const wanted = (dir ? dir.children : manager.action.ids).filter(id => id !== RECENT_ID);
      const current = (await chrome.bookmarks.getChildren(realParent)).map(n => n.id);
      try {
        for (let j = 0; j < wanted.length; j += 1) {
          const id = wanted[j];
          const i = current.indexOf(id);
          if (i === j) {
            continue;
          }
          // i === -1 means the bookmark is not in this directory yet
          const result = await chrome.bookmarks.move(id, {
            parentId: realParent,
            index: j
          });
          const target = tree.jstree('get_node', id);
          if (target && result) {
            target.data.index = result.index;
          }
          if (i !== -1) {
            current.splice(i, 1);
          }
          current.splice(j, 0, id);
        }
      }
      catch (e) {
        console.error(e);
        notify.inline(e.message || 'Cannot complete the move');
        tree.jstree('refresh_node', realParent);
      }
    }
    else if (manager.action.command === 'copy') {
      let index = 0;
      if (isDir === false) {
        // create() rejects out of range indexes, use the live bookmark order
        const children = await chrome.bookmarks.getChildren(parentId === '#' ? getRoot() : parentId);
        const at = children.findIndex(n => n.id === node.id);
        index = Math.max(0, at) + 1;
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

// walks up the parent chain; resolves [id, parent, ..., root]
tree.hierarchy = id => new Promise(resolve => {
  const ids = [];
  const up = id => {
    ids.push(id);
    chrome.bookmarks.get(id, arr => {
      const node = arr[0];
      if (node.parentId) {
        up(node.parentId);
      }
      else {
        resolve(ids);
      }
    });
  };
  up(id);
});

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
    },
    'recent_folder': {
      'icon': 'recent_folder'
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
    'check_callback': (operation, node, node_parent) => {
      // do not allow drag and drop in sort mode
      if (localStorage.getItem('sort') === 'true' && operation === 'move_node') {
        return false;
      }
      // do not allow any modification of the virtual "Most Recent" folder itself
      if (node && node.id === RECENT_ID) {
        return false;
      }
      // do not allow dropping or creating content inside the virtual folder
      if (['move_node', 'copy_node', 'create_node'].includes(operation) &&
          node_parent && node_parent.id === RECENT_ID) {
        return false;
      }
      if (operation === 'move_node') {
        // display nodes of the virtual "Most Recent" folder can be dragged into real directories
        if (node.parent === RECENT_ID) {
          return true;
        }
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
      else if (obj.id === RECENT_ID) {
        // contents of the virtual "Most Recent" folder (display-only copies)
        const {count} = await recentPrefs();
        const nodes = (await chrome.bookmarks.getRecent(count))
          .filter(node => node.url && node.url.startsWith('place:') === false)
          .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

        cb(nodes.map(node => ({
          text: tree.string.escape(node.title),
          // prefixed ID keeps the tree model unique when the bookmark is also listed in its real folder
          id: RECENT_PREFIX + node.id,
          type: 'file',
          icon: utils.favicon(node.url),
          children: false,
          a_attr: { // open with middle-click
            href: node.url
          },
          data: {
            type: node.type || 'bookmark',
            index: node.index,
            dateGroupModified: node.dateGroupModified,
            dateAdded: node.dateAdded,
            url: node.url,
            feed: false,
            drag: false,
            realId: node.id
          }
        })));
      }
      else {
        const nodes = await chrome.bookmarks.getChildren(obj.id === '#' ? getRoot() : obj.id);

        // virtual "Most Recent" folder on top of the root level
        if (obj.id === '#') {
          const prefs = await recentPrefs();
          if (prefs.enabled) {
            nodes.unshift({
              id: RECENT_ID,
              title: 'Most Recent',
              type: 'folder',
              parentId: obj.id,
              children: 0
            });
          }
        }

        cb(nodes.map(node => {
          // the virtual "Most Recent" folder cannot be edited, moved, or sorted
          if (node.id === RECENT_ID) {
            return {
              text: tree.string.escape(node.title),
              id: RECENT_ID,
              type: 'recent_folder',
              icon: null,
              children: true,
              a_attr: {
                href: '#'
              },
              data: {
                type: 'folder',
                virtual: true,
                url: '',
                drag: false
              },
              state: {
                loaded: false
              }
            };
          }
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
      // read-only menu for the virtual "Most Recent" folder
      if (node.id === RECENT_ID) {
        const items = {};
        const submenu = {};
        submenu['Copy ID'] = {
          'label': 'Copy ID',
          'action': () => {
            utils.copy(RECENT_ID);
          }
        };
        items['Copy Properties'] = {
          'label': 'Copy Properties',
          submenu
        };
        items['Search or Validate Bookmarks'] = {
          'separator_before': true,
          'label': 'Search or Validate Bookmarks',
          'action': () => {
            const input = document.querySelector('#search input');
            input.value = 'root:' + RECENT_ID + ' ';
            input.dispatchEvent(new Event('search'));
            input.focus();
          }
        };
        return items;
      }

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
      if (node.parent === RECENT_ID) {
        // reveal and select the bookmark in its actual place
        items['Select in Tree'] = {
          'separator_before': true,
          'label': 'Select in Tree',
          'action': () => {
            tree.hierarchy(recentRealId(node.id)).then(ids => {
              window.dispatchEvent(new CustomEvent('tree:open-array', {
                detail: {nodes: ids}
              }));
            });
          }
        };
      }
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
      const recent = node.parent === RECENT_ID;
      if (node.data.drag || node.data.url) {
        const submenu = {};
        if (node.data.drag || recent) {
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
      if (node.data.drag || recent) {
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
          const ids = tree.jstree('get_selected').map(recentRealId);
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
      if (['folder', 'd_folder'].includes(node.type)) {
        // checkable items keep the menu open after each click
        const toggle = (name, title, flag) => ({
          'label': () => (flag.on() ? '☑ ' : '☐ ') + title,
          '_class': 'sorter-' + name,
          'action': () => {
            const value = flag.on() === false;
            localStorage.setItem(flag.key, value);
            // update the label in place, do not close the menu
            const li = document.querySelector('.vakata-context li.sorter-' + name);
            if (li) {
              li.querySelector('a').lastChild.textContent = (value ? '☑ ' : '☐ ') + title;
            }
            return false;
          }
        });
        items['Sort'] = {
          'label': 'Sort',
          'separator_before': true,
          'submenu': {
            'Sort A-Z': {
              'label': 'Sort A-Z',
              'action': () => sorter.run(node, 'asc')
            },
            'Sort Z-A': {
              'label': 'Sort Z-A',
              'action': () => sorter.run(node, 'desc')
            },
            'Dirs on Top': toggle('dirs-top', 'Place directories on top', sorter.flags['dirs-top']),
            'Recursive': toggle('recursive', 'Recursive', sorter.flags.recursive),
            'Configure Sort': {
              'label': 'Configure Sort',
              'separator_before': true,
              'action': () => sorter.configure()
            }
          }
        };
      }
      if (!node.data.url) {
        items['Set as Root'] = {
          'label': 'Set as Root',
          'separator_before': true,
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

    // keep the virtual "Most Recent" folder on top of the root level
    if (a.id === 'recent-virtual') {
      return -1;
    }
    if (b.id === 'recent-virtual') {
      return 1;
    }
    // keep the "Most Recent" listing sorted by date (newest first)
    if (a.parent === 'recent-virtual' && b.parent === 'recent-virtual') {
      return 0;
    }

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
    // programmatic move from manager.paste(): the browser is synced below
    if (data.node.data && data.node.data.syncMove) {
      data.node.data.syncMove = false;
      const parent = tree.jstree('get_node', data.parent);
      let pos = parent.children.indexOf(data.node.id);
      // the virtual "Most Recent" folder has no browser counterpart
      if (parent.children.indexOf(RECENT_ID) !== -1 &&
          pos > parent.children.indexOf(RECENT_ID)) {
        pos -= 1;
      }
      data.node.data.index = pos;
      return;
    }
    let index = data.position;
    // the +1 offset is only applicable when reordering within the same directory
    if (data.old_parent === data.parent && data.position > data.old_position) {
      if (/Firefox/.test(navigator.userAgent) === false) {
        index += 1;
      }
    }
    // display nodes carry prefixed IDs; a move out of the virtual folder releases the real bookmark
    const realId = recentRealId(data.node.id);
    const isOut = data.old_parent === RECENT_ID;

    // common post-move fix-up
    const after = bookmark => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
        // the tree renders the node as moved; bring both directories
        // back in line with the actual bookmark order
        if (data.parent !== '#') {
          tree.jstree('refresh_node', data.parent);
        }
        if (data.old_parent !== data.parent) {
          tree.jstree('refresh_node', data.old_parent);
        }
        return;
      }
      // keep the stored position in sync for later operations
      if (bookmark) {
        data.node.data.index = bookmark.index;
      }
      if (data.old_parent !== RECENT_ID) { // plain move of a real node
        return;
      }
      // 1. undo the visual drop of the display node wherever it landed
      tree.jstree('delete_node', data.node.id);
      // 2. the real directory keeps a stale copy when it is loaded -> drop it
      if (tree.jstree('get_node', bookmark.id)) {
        tree.jstree('delete_node', bookmark.id);
      }
      // 3. render the moved bookmark at its final position if the directory is visible
      if (tree.jstree('is_loaded', bookmark.parentId)) {
        tree.jstree('create_node', bookmark.parentId, {
          text: tree.string.escape(bookmark.title),
          id: bookmark.id,
          type: 'file',
          icon: utils.favicon(bookmark.url),
          children: false,
          a_attr: { // open with middle-click
            href: bookmark.url
          },
          data: {
            type: 'bookmark',
            index: bookmark.index,
            dateGroupModified: bookmark.dateGroupModified,
            dateAdded: bookmark.dateAdded,
            url: bookmark.url,
            feed: false,
            drag: true
          }
        }, bookmark.index);
      }
    };

    if (isOut) {
      chrome.bookmarks.get(realId, ([prev]) => {
        // dropping into the bookmark's own directory is just a rearrangement;
        // data.position counts the display copy, Chrome counts the node itself
        // (pre-removal), Firefox counts the slot after removal
        if (prev.parentId === data.parent && data.position > prev.index &&
            /Firefox/.test(navigator.userAgent)) {
          index -= 1;
        }
        chrome.bookmarks.move(realId, {parentId: data.parent, index}, after);
      });
    }
    else if (data.parent === '#') { // the tree root is not a real directory
      notify.inline('[Refresh Required] Cannot move to the tree root');
      tree.jstree('refresh_node', data.old_parent);
    }
    else {
      // validate the requested position against the live tree to avoid
      // a hard failure when the model got out of sync
      chrome.bookmarks.getChildren(data.parent, children => {
        chrome.bookmarks.move(data.node.id, {
          parentId: data.parent,
          index: Math.min(index, children.length)
        }, after);
      });
    }
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

// keep the "Most Recent" folder in sync while the panel is open
{
  let timer = null;
  const refresh = () => {
    const node = tree.jstree('get_node', RECENT_ID);
    // only refresh while the directory is expanded; a collapsed one reloads on expand anyway
    if (node && node.state && node.state.opened) {
      tree.jstree('refresh_node', RECENT_ID);
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  };
  for (const name of ['onCreated', 'onRemoved', 'onMoved', 'onChanged']) {
    chrome.bookmarks[name].addListener(schedule);
  }
  // options page changes
  chrome.storage.onChanged.addListener((ps, area) => {
    if (area !== 'local' || (ps.recent === undefined && ps['recent-count'] === undefined)) {
      return;
    }
    if (ps.recent) {
      // visibility changed -> rebuild the root level
      tree.jstree(true).refresh();
    }
    else {
      schedule();
    }
  });
  // collapsing the folder drops its cache so that the next expand fetches fresh data
  tree.on('close_node.jstree', (e, data) => {
    if (data.node.id === RECENT_ID) {
      data.node.state.loaded = false;
    }
  });
}
