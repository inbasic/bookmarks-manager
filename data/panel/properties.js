/* globals tree */
'use strict';

var properties = document.querySelector('#properties');
properties.addEventListener('keyup', (e) => {
  let target = e.target;
  let tr = target.closest('tr');
  if (tr) {
    tr.querySelector('[type=submit]').disabled = !(target && target.dataset.value !== target.value && target.value);
  }
});
properties.addEventListener('submit', e => {
  e.preventDefault();
  e.stopPropagation();

  let form = e.target;
  let tr = properties.querySelector('[form=' + form.id + ']').closest('tr');
  let id = properties.dataset.id;
  let input = tr.querySelector('input');
  let prp = {};
  prp[form.id] = input.value;
  chrome.bookmarks.update(id, prp, () => {
    input.dataset.value = input.value;
    tr.querySelector('[type=submit]').disabled = true;
    // updating search view
    let results = document.querySelector('#results tbody');
    let rtr = results.querySelector(`[data-id="${id}"]`);
    if (rtr) {
      rtr.querySelector('td:nth-child(' + (form.id === 'title' ? 1 : 2) + ')').textContent = input.value;
    }
    // updating tree view
    if (form.id === 'title') {
      tree.jstree('set_text', id , input.value);
    }
    // reseting fuse
    window.dispatchEvent(new Event('search:reset-fuse'));
  });
});

window.addEventListener('properties:select-title', () => {
  let title = properties.querySelector('tr:nth-child(1) input');
  title.focus();
  title.select();
});
window.addEventListener('properties:select-link', () => {
  let url = properties.querySelector('tr:nth-child(2) input');
  url.focus();
  url.select();
});

tree.on('select_node.jstree', (e, data) => {
  properties.dataset.id = data.node.id;

  let title = properties.querySelector('tr:nth-child(1) input');
  title.dataset.value = title.value = data.node.text;
  title.dispatchEvent(new Event('keyup', {
    bubbles: true
  }));
  let url = properties.querySelector('tr:nth-child(2) input');
  url.disabled = data.node.type === 'folder';
  url.dataset.value = url.value = data.node.data.url;
  url.dispatchEvent(new Event('keyup', {
    bubbles: true
  }));

  let d = new Date(data.node.data.dateAdded);
  properties.querySelector('tr:nth-child(3) span').textContent = d.toDateString() + ' ' + d.toLocaleTimeString();
});
