/* Copyright (C) 2014-2022 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* global Fuse, utils, tree, notify */
'use strict';

(function(search, searchForm, results, count, tbody, trC, close, validate) {
  // should the search box get the focus
  if (localStorage.getItem('searchfocus') === 'true') {
    document.addEventListener('DOMContentLoaded', () => search.focus());
  }
  //
  let useNative = false;
  let fuse;
  let closed = false;
  // focus searchbox on Ctrl + F
  addEventListener('keydown', e => {
    if ((e.metaKey && e.keyCode === 70) || (e.ctrlKey && e.keyCode === 70)) {
      e.preventDefault();
      e.stopPropagation();
      search.focus();
    }
  });
  // reset fuse on edit
  addEventListener('search:reset-fuse', () => fuse = null);
  function prepare() {
    if (useNative) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      chrome.bookmarks.getTree(nodes => {
        const arr = [];
        function extract(node) {
          if (node.children) {
            node.children.forEach(n => {
              // only add bookmarks not folders
              if (n.url) {
                arr.push(n);
              }
              extract(n);
            });
          }
        }
        extract(nodes[0]);
        fuse = new Fuse(arr, {
          keys: ['title', 'url']
        });
        resolve();
      });
    });
  }
  function hierarchy(id) {
    return new Promise(resolve => {
      const ids = [];
      function up(id) {
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
      }
      up(id);
    });
  }
  // prevent old searches from populating
  let index = 0;

  function add(obj) {
    const node = document.importNode(trC.content, true);
    const tr = node.querySelector('tr');
    const td1 = node.querySelector('td:nth-child(1)');

    let icon = obj.url;
    if (!icon && navigator.userAgent.indexOf('Firefox') !== -1 && obj.type === 'folder') {
      icon = '/data/panel/icons/folder.png';
    }
    if (!icon && navigator.userAgent.indexOf('Firefox') === -1) {
      icon = '/data/panel/icons/folder.png';
    }
    icon = icon || '/data/panel/icons/page.png';

    td1.style['background-image'] = `url(${utils.favicon(icon)})`;

    td1.textContent = obj.title;
    node.querySelector('td:nth-child(2)').textContent = obj.url;
    tr.dataset.id = obj.id;
    tr.dataset.url = obj.url || '';
    tr.dataset.parentId = obj.parentId;
    tbody.appendChild(node);
  }

  function perform() {
    let value = search.value.trim();

    results.style.display = value ? 'flex' : 'none';
    closed = !value;
    validate.disabled = false;

    if (value.length > 1) {
      // to not search duplicates
      if (perform.value === value) {
        return;
      }
      perform.value = value;
      // updating index
      index += 1;

      if (value.startsWith('fuzzy:')) {
        useNative = false;
        value = value.replace(/fuzzy:\s*/, '');
      }
      else {
        useNative = true;
        fuse = null;
      }

      tbody.textContent = '';

      const next = (i => {
        return (results = [], total) => {
          if (i === index) {
            results.forEach(add);
            count.textContent = (results.length || '') + (total ? '/' + total : '');
            const tr = document.querySelector('#results tbody tr');
            // select the first child
            if (tr) {
              tr.classList.add('selected');
              tr.querySelector('input').checked = true;
            }
          }
        };
      })(index);

      if (value.startsWith('root:')) {
        const id = value.replace(/root:/, '').split(' ')[0];
        const term = value.replace(/root:[^ ]+/, '').toLowerCase().trim();
        const nodes = [];
        const search = id => new Promise(resolve => chrome.bookmarks.getChildren(id, async nds => {
          nodes.push(...nds.filter(n => n.url));
          await Promise.all(nds.filter(n => !n.url).map(n => search(n.id)));
          resolve();
        }));
        if (id) {
          search(id).then(() => {
            if (term) {
              next(nodes.filter(({url, title}) => {
                title = title.toLowerCase();
                url = url.toLowerCase();
                // split and match by keys
                const keys = term.split(/\s+/);
                return keys.filter(key => title.indexOf(key) !== -1 || url.indexOf(key) !== -1).length === keys.length;
              }), nodes.length);
            }
            else {
              next(nodes);
            }
          });
        }
      }
      else if (value.startsWith('id:')) {
        const ids = value.replace(/id:\s*/, '').split(/,\s*/);
        chrome.bookmarks.get(ids, next);
      }
      else if (useNative) {
        chrome.bookmarks.search(value, next);
      }
      else {
        (fuse ? Promise.resolve() : prepare()).then(() => {
          next(fuse.search(value));
        });
      }
    }
    else {
      perform.value = '';
      count.textContent = '';
    }
  }

  function closePanel() {
    tbody.textContent = '';
    search.value = '';
    perform.value = '';
    count.textContent = '';
    search.dispatchEvent(new Event('keyup'));
    closed = true;
  }

  search.addEventListener('keyup', perform);
  search.addEventListener('search', perform);
  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const tr = tbody.querySelector('.selected');
    if (tr) {
      tr.click();
    }
  });

  results.addEventListener('click', e => {
    const target = e.target;
    const tr = target.closest('tr');
    if (tr) {
      const id = tr.dataset.id;
      if (id) {
        // selecting
        [...tbody.querySelectorAll('.selected')].forEach(tr => tr.classList.remove('selected'));
        tr.classList.add('selected');
        // displaying in tree view
        hierarchy(id).then(nodes => {
          window.dispatchEvent(new CustomEvent('tree:open-array', {
            detail: {
              nodes
            }
          }));
        });
        tr.querySelector('input')?.focus();
      }
    }
    const sort = target.dataset.sort;
    if (sort) {
      const trs = [...tbody.querySelectorAll('tr')].sort((a, b) => {
        const sa = a.querySelector(sort).textContent;
        const sb = b.querySelector(sort).textContent;

        return target.dataset.increase === 'true' ? sb.localeCompare(sa) : sa.localeCompare(sb);
      });
      trs.forEach(tr => tbody.appendChild(tr));
      target.dataset.increase = target.dataset.increase !== 'true';
    }
  });
  {
    const callback = () => {
      const tr = tbody.querySelector('.selected');
      if (tr) {
        closePanel();
      }
      tree.activate();
    };
    tbody.addEventListener('dblclick', callback);
    results.addEventListener('submit', e => {
      e.preventDefault();
      callback();
    });
  }

  close.addEventListener('click', closePanel);

  validate.addEventListener('click', () => {
    validate.disabled = true;

    const check = url => new Promise((resolve, reject) => {
      const controller = new AbortController();

      setTimeout(() => controller.abort(), 6000);
      fetch(url, {
        signal: controller.signal
      }).then(r => {
        if (r.ok) {
          return resolve('Link is fine');
        }
        throw Error('Link is dead');
      }).catch(reject).finally(() => controller.abort());
    });

    const trs = [...tbody.querySelectorAll('tr')]
      .filter(tr => tr.dataset.url);
    trs.forEach(tr => tr.removeAttribute('data-valid'));

    const origins = new Set();
    for (const tr of trs) {
      try {
        const {origin} = new URL(tr.dataset.url);
        if (origin.startsWith('http')) {
          origins.add(origin + '/');
        }
      }
      catch (e) {}
    }
    if (origins.size) {
      chrome.permissions.request({
        origins: ['*://*/*']
      }, async () => {
        const chunks = [];
        for (let i = 0; i < trs.length; i += 3) {
          chunks.push(trs.slice(i, i + 3));
        }
        for (const chunk of chunks) {
          if (closed) {
            return;
          }
          await Promise.all(chunk.map(tr => {
            const url = tr.dataset.url;
            const td = tr.querySelector('td:last-child');
            td.textContent = 'validating...';
            td.scrollIntoViewIfNeeded();
            return check(url).then(() => {
              tr.dataset.valid = true;
              td.textContent = url;
            }).catch(() => {
              tr.dataset.valid = false;
            });
          }));
        }
        validate.disabled = false;
      });
    }
    else {
      notify.inline('There is no remote bookmark in the list');
      validate.disabled = false;
    }
  });
})(
  document.querySelector('#search input[type=search]'),
  document.getElementById('search'),
  document.querySelector('#results'),
  document.querySelector('#results [data-id=count]'),
  document.querySelector('#results tbody'),
  document.querySelector('#results template'),
  document.querySelector('#results [data-id=address] input[data-cmd=close]'),
  document.querySelector('#results [data-id=address] input[data-cmd=validate-list]')
);
