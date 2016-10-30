/* globals tree, notify */
'use strict';

document.addEventListener('click', (e) => {
  let cmd = e.target.dataset.cmd;
  if (cmd === 'collapse') {
    tree.jstree('deselect_all');
    tree.jstree('close_all');
  }
  else if (cmd === 'delete') {
    let ids = tree.jstree('get_selected');
    let id = ids[0];
    let node = tree.jstree('get_node', id);
    if (node.children.length) {
      notify.warning('Directory is not empty! For your own safety only empty directories can be deleted.');
    }
    else {
      notify.confirm(`Are you sure you want to delete "${node.data.url || node.text}"?`, (a) => {
        if (a) {
          chrome.bookmarks[node.type === 'folder' ? 'removeTree' : 'remove'](id, () => {
            // jstree
            tree.jstree('select_node', node.parent);
            tree.jstree('delete_node', id);
            // results
            let results = document.querySelector('#results tbody');
            let rtr = results.querySelector(`[data-id="${id}"]`);
            if (rtr) {
              rtr.parentNode.removeChild(rtr);
            }
            // reseting fuse
            window.dispatchEvent(new Event('search:reset-fuse'));
          });
        }
      });
    }
  }
  else if (cmd === 'update-title' || cmd === 'validate') {
    let ids = tree.jstree('get_selected');
    let id = ids[0];
    let node = tree.jstree('get_node', id);
    if (node && node.data.url) {
      notify.inline(cmd === 'validate' ? 'Validating...' : 'Fetching...');
      chrome.runtime.sendMessage({
        cmd,
        url: node.data.url,
        id
      });
    }
    else {
      notify.inline('Not applicable for this node');
    }
  }
  else if (cmd === 'create-folder' || cmd === 'create-bookmark' || cmd === 'create-from-tab') {
    let ids = tree.jstree('get_selected');
    let id = ids[0];
    let node = tree.jstree('get_node', id);
    let parentId = node.type === 'folder' ? node.id : node.parent;
    let prp = {
      parentId
    };
    if (node.type === 'folder') {
      prp.index = 0;
    }
    else {
      let parent = tree.jstree('get_node', node.parent);
      prp.index = parent.children.indexOf(node.id) + 1;
    }
    (function (callback) {
      if (cmd === 'create-folder') {
        return callback(null, 'new directory');
      }
      else if (cmd === 'create-bookmark') {
        return callback('http://domain-name', 'new bookmark');
      }
      else {
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, tabs => {
          callback(tabs[0].url, tabs[0].title);
        });
      }
    })(function (url, title) {
      prp.url = url;
      prp.title = title;
      chrome.bookmarks.create(prp, (node) => {
        tree.jstree('create_node', parentId, {
          text: node.title,
          id: node.id,
          type: url ? 'file' : 'folder',
          icon: url ? 'chrome://favicon/' + url : null,
          data: {
            dateGroupModified: node.dateGroupModified,
            dateAdded: node.dateAdded,
            url
          }
        }, node.index, (node) => {
          tree.jstree('deselect_all');
          tree.jstree('select_node', node.id);
        });
        tree.jstree('open_node', parentId);
      });
    });
  }
});

chrome.runtime.onMessage.addListener(request => {
  if (request.cmd === 'title-info') {
    let ids = tree.jstree('get_selected');
    let id = ids[0];
    if (request.id === id) {
      let input = document.querySelector('#properties input[form=title]');
      if (input.value !== request.title) {
        input.value = request.title;
        input.dispatchEvent(new Event('keyup', {
          bubbles: true
        }));
      }
      else {
        chrome.runtime.sendMessage({
          cmd: 'notify.inline',
          msg: '"title" is up-do-date'
        });
      }
    }
  }
});
