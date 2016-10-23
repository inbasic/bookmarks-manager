/* globals Fuse, tree */
'use strict';

(function (search, results, tbody, trC, close) {
  let fuse;
  // focus searchbox on Ctrl + F
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey && e.keyCode === 70) || (e.ctrlKey && e.keyCode === 70)) {
      search.focus();
    }
  });
  // reset fuse on edit
  window.addEventListener('search:reset-fuse', () => fuse = null);
  function prepare () {
    return new Promise(resolve => {
      chrome.bookmarks.getTree(nodes => {
        let arr = [];
        function extract (node) {
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
  function hierarchy (id) {
    return new Promise(resolve => {
      let ids = [];
      function up (id) {
        ids.push(id);
        chrome.bookmarks.get(id, arr => {
          let node = arr[0];
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

  function perform () {
    let value = search.value;
    results.style.display = value ? 'block' : 'none';
    if (value.length > 1) {
      (fuse ? Promise.resolve() : prepare()).then(() => {
        let matches = fuse.search(value);
        tbody.textContent = '';
        matches.forEach(obj => {
          let tr = trC.cloneNode(true);
          let td1 = tr.querySelector('td:nth-child(1)');
          td1.style['background-image'] = 'url(chrome://favicon/' + obj.url + ')';
          td1.textContent = obj.title;
          tr.querySelector('td:nth-child(2)').textContent = obj.url;
          tr.dataset.id = obj.id;
          tr.dataset.parentId = obj.parentId;
          tbody.appendChild(tr);
        });
      });
    }
  }

  function closePanel () {
    search.value = '';
    search.dispatchEvent(new Event('keyup'));
  }

  search.addEventListener('keyup', perform);
  search.addEventListener('search', perform);

  results.addEventListener('click', e => {
    let target = e.target;
    let tr = target.closest('tr');
    if (tr) {
      let id = tr.dataset.id;
      if (id) {
        // selecting
        Array.from(tbody.querySelectorAll('.selected')).forEach(tr => tr.classList.remove('selected'));
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
  });
  results.addEventListener('dblclick', e => {
    let target = e.target;
    let tr = target.closest('tr');
    if (tr) {
      closePanel();
    }
  });

  close.addEventListener('click', closePanel);
})(
  document.querySelector('#search input'),
  document.querySelector('#results'),
  document.querySelector('#results tbody'),
  document.querySelector('#tr'),
  document.querySelector('#results>input')
);
