/* Copyright (C) 2014-2017 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

/* globals Fuse, utils */
'use strict';

(function(search, results, tbody, trC, close, validate) {
  let useNative = false;
  let fuse;
  let closed = false;
  // focus searchbox on Ctrl + F
  window.addEventListener('keydown', e => {
    if ((e.metaKey && e.keyCode === 70) || (e.ctrlKey && e.keyCode === 70)) {
      search.focus();
    }
  });
  // reset fuse on edit
  window.addEventListener('search:reset-fuse', () => fuse = null);
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
    let value = search.value;

    results.style.display = value ? 'flex' : 'none';
    closed = !value;
    validate.disabled = false;

    if (value.length > 1) {
      if (value.startsWith('fuzzy:')) {
        useNative = false;
        value = value.replace(/fuzzy:\s*/, '');
      }
      else {
        useNative = true;
        fuse = null;
      }

      tbody.textContent = '';
      if (value.startsWith('root:')) {
        const id = value.replace(/root:\s*/, '');
        chrome.bookmarks.getChildren(id, (results = []) => results.forEach(add));
      }
      else if (value.startsWith('id:')) {
        const ids = value.replace(/id:\s*/, '').split(/,\s*/);
        console.log(ids);
        chrome.bookmarks.get(ids, (results = []) => results.forEach(add));
      }
      else if (useNative) {
        chrome.bookmarks.search(value, (results = []) => results.forEach(add));
      }
      else {
        (fuse ? Promise.resolve() : prepare()).then(() => {
          const matches = fuse.search(value);
          matches.forEach(add);
        });
      }
    }
  }

  function closePanel() {
    tbody.textContent = '';
    search.value = '';
    search.dispatchEvent(new Event('keyup'));
    closed = true;
  }

  search.addEventListener('keyup', perform);
  search.addEventListener('search', perform);

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
  tbody.addEventListener('dblclick', e => {
    const target = e.target;
    const tr = target.closest('tr');
    if (tr) {
      closePanel();
    }
  });

  close.addEventListener('click', closePanel);

  validate.addEventListener('click', async() => {
    validate.disabled = true;

    const check = url => new Promise(resolve => chrome.runtime.sendMessage({
      cmd: 'validate',
      url
    }, resolve));

    const trs = [...tbody.querySelectorAll('tr')]
      .filter(tr => tr.dataset.url);
    trs.forEach(tr => tr.removeAttribute('data-valid'));

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
        return check(url).then(r => {

          tr.dataset.valid = r.valid;
          td.textContent = url;
        });
      }));
    }
    validate.disabled = false;
  });
})(
  document.querySelector('#search input'),
  document.querySelector('#results'),
  document.querySelector('#results tbody'),
  document.querySelector('#results template'),
  document.querySelector('#results [data-id=address] input[data-cmd=close]'),
  document.querySelector('#results [data-id=address] input[data-cmd=validate-list]')
);
