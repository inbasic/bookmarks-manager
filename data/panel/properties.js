/* globals tree */
'use strict';

var properties = document.querySelector('#properties');
properties.addEventListener('keyup', (e) => {
  let target = e.target;
  let tr = target.closest('tr');
  console.error(tr, target)
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
