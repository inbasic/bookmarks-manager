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

const sorter = (() => {
  const all = ['name', 'domain', 'link', 'date'];
  const labels = {
    'name': 'Name',
    'domain': 'Domain',
    'link': 'Link',
    'date': 'Date'
  };
  const root = () => document.querySelector('#sort');

  // persistent on/off flags shared between the context menu and the dialog
  const flags = {
    'dirs-top': {
      key: 'sort-dirs-top',
      on: () => localStorage.getItem('sort-dirs-top') !== 'false'
    },
    'recursive': {
      key: 'sort-recursive',
      on: () => localStorage.getItem('sort-recursive') === 'true'
    }
  };

  function load() {
    let keys;
    try {
      keys = JSON.parse(localStorage.getItem('sort-keys') || '["name","date"]');
    }
    catch (e) {
      keys = ['name', 'date'];
    }
    keys = keys.filter(s => all.includes(s));
    if (keys.length === 0) {
      keys = ['name', 'date'];
    }
    return {
      keys,
      dirsTop: flags['dirs-top'].on(),
      recursive: flags.recursive.on()
    };
  }

  // extract comparable properties from a bookmark node
  function meta(n) {
    const url = n.url || '';
    let domain = '';
    if (url) {
      try {
        domain = (new URL(url)).hostname.replace(/^www\./i, '').toLowerCase();
      }
      catch (e) {
        domain = '';
      }
    }
    return {
      n,
      title: n.title || '',
      url,
      domain,
      // bookmarks are compared by their add date, directories by their last modified date
      date: url ? (n.dateAdded || 0) : (n.dateGroupModified || 0),
      isDir: !url
    };
  }

  const collator = new Intl.Collator(undefined, {
    'sensitivity': 'base',
    'numeric': true
  });

  // build a comparator from a list of sort keys
  function comparator(supported) {
    return (a, b) => {
      for (const key of supported) {
        let r = 0;
        if (key === 'name') {
          r = collator.compare(a.title, b.title);
        }
        else if (key === 'domain') {
          r = collator.compare(a.domain, b.domain);
        }
        else if (key === 'link') {
          r = collator.compare(a.url, b.url);
        }
        else if (key === 'date') {
          r = a.date - b.date;
        }
        if (r) {
          return r;
        }
      }
      // keep the original order when all keys tie
      return (a.n.index || 0) - (b.n.index || 0);
    };
  }

  // directories have no URL; only keys that still apply to them
  const dirKeys = keys => keys.filter(k => k === 'name' || k === 'date');

  async function sortChildren(parentId, cfg, stats, refreshSet) {
    const nodes = await chrome.bookmarks.getChildren(parentId);
    const metas = nodes.map(meta);

    const pinned = metas.filter(m => m.n.type === 'separator' || m.url.startsWith('place:'));
    const movable = metas.filter(m => m.n.type !== 'separator' && m.url.startsWith('place:') === false);

    if (movable.length > 1) {
      const cmp = comparator(cfg.keys);
      const dirs = movable.filter(m => m.isDir).sort(cfg.dirsTop ? comparator(dirKeys(cfg.keys)) : cmp);
      const links = movable.filter(m => m.isDir === false).sort(cmp);

      let order;
      if (cfg.dirsTop) {
        // reverse each block separately to keep directories on top
        order = cfg.dir === 'desc' ? [...dirs.reverse(), ...links.reverse()] : [...dirs, ...links];
      }
      else {
        const m = [...dirs, ...links].sort(cmp);
        order = cfg.dir === 'desc' ? m.reverse() : m;
      }

      // persist the original index before the first move changes it
      metas.forEach(m => m.n.index = m.n.index ?? 0);
      // apply the new order with left-only moves which is safe for both engines
      const ids = metas.map(m => m.n.id);
      for (let j = 0; j < order.length; j += 1) {
        const id = order[j].n.id;
        const i = ids.indexOf(id);
        if (i !== j) {
          await chrome.bookmarks.move(id, {
            parentId,
            index: j
          });
          ids.splice(i, 1);
          ids.splice(j, 0, id);
        }
      }
      stats.items += order.length;
      stats.dirs += 1;
      refreshSet.add(parentId);
    }

    if (cfg.recursive) {
      for (const m of metas.filter(m => m.isDir)) {
        await sortChildren(m.n.id, cfg, stats, refreshSet);
      }
    }
  }

  async function run(node, dir) {
    try {
      const cfg = {
        ...load(),
        dir
      };
      const stats = {
        items: 0,
        dirs: 0
      };
      const refreshSet = new Set();

      notify.inline('Sorting...');
      await sortChildren(node.id, cfg, stats, refreshSet);

      for (const id of refreshSet) {
        tree.jstree('refresh_node', id);
      }

      const direction = dir === 'asc' ? 'A-Z' : 'Z-A';
      if (stats.items === 0) {
        notify.inline('Nothing to sort');
      }
      else if (stats.dirs > 1) {
        notify.inline(`Sorted ${stats.items} items across ${stats.dirs} directories (${direction})`);
      }
      else {
        notify.inline(`Sorted ${stats.items} items (${direction})`);
      }
    }
    catch (e) {
      console.error(e);
      notify.inline(e.message || 'Sorting Failed');
    }
  }

  function render() {
    const list = root().querySelector('ul');
    list.textContent = '';

    for (const option of root().querySelector('[data-id="add"]').options) {
      option.disabled = cfg.keys.includes(option.value);
    }

    cfg.keys.forEach((key, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = labels[key];

      const up = document.createElement('input');
      up.type = 'button';
      up.value = '↑';
      up.title = 'Move up';
      up.disabled = i === 0;
      up.addEventListener('click', () => {
        const previous = cfg.keys[i - 1];
        cfg.keys[i - 1] = cfg.keys[i];
        cfg.keys[i] = previous;
        render();
      });

      const down = document.createElement('input');
      down.type = 'button';
      down.value = '↓';
      down.title = 'Move down';
      down.disabled = i === cfg.keys.length - 1;
      down.addEventListener('click', () => {
        const next = cfg.keys[i + 1];
        cfg.keys[i + 1] = cfg.keys[i];
        cfg.keys[i] = next;
        render();
      });

      const del = document.createElement('input');
      del.type = 'button';
      del.value = '✕';
      del.title = 'Remove';
      del.addEventListener('click', () => {
        cfg.keys.splice(i, 1);
        render();
      });

      li.append(span, up, down, del);
      list.appendChild(li);
    });

    root().querySelector('[data-id="dirs-top"]').checked = cfg.dirsTop;
    root().querySelector('[data-id="recursive"]').checked = cfg.recursive;
    root().querySelector('[data-id="save"]').disabled = cfg.keys.length === 0;
  }

  function configure() {
    cfg = load();
    render();
    root().showModal();
  }

  let cfg = null;

  // one-time dialog wiring
  {
    root().querySelector('[data-id="add"]').addEventListener('change', e => {
      if (e.target.value && cfg.keys.includes(e.target.value) === false) {
        cfg.keys.push(e.target.value);
      }
      e.target.value = '';
      render();
    });
    root().querySelector('[data-id="dirs-top"]').addEventListener('change', e => {
      cfg.dirsTop = e.target.checked;
    });
    root().querySelector('[data-id="recursive"]').addEventListener('change', e => {
      cfg.recursive = e.target.checked;
    });
    root().querySelector('[data-id="save"]').addEventListener('click', () => {
      if (cfg.keys.length === 0) {
        return notify.inline('Add at least one sort key');
      }
      localStorage.setItem('sort-keys', JSON.stringify(cfg.keys));
      localStorage.setItem('sort-dirs-top', cfg.dirsTop);
      localStorage.setItem('sort-recursive', cfg.recursive);
      root().close();
      notify.inline('Sort configuration saved');
    });
    root().querySelector('[data-id="cancel"]').addEventListener('click', () => root().close());
    root().addEventListener('close', () => {
      cfg = null;
    });
  }

  return {
    run,
    configure,
    flags
  };
})();
