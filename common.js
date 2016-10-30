'use strict';

chrome.runtime.onMessage.addListener((request) => {
  if (request.cmd === 'open') {
    chrome.tabs.create({
      url: request.url
    });
  }
  else if (request.cmd === 'validate') {
    let req = new XMLHttpRequest();
    req.open('GET', request.url);
    req.onload = () => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg: 'Link is fine'
    });
    req.onerror = (e) => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg: e.type + ' ' + req.status
    });
    req.send();
  }
  else if (request.cmd === 'update-title') {
    let req = new XMLHttpRequest();
    req.open('GET', request.url);
    req.responseType = 'document';
    req.onload = () => {
      let title = req.responseXML.title;
      if (title) {
        chrome.runtime.sendMessage({
          cmd: 'title-info',
          id: request.id,
          title
        });
      }
      else {
        chrome.runtime.sendMessage({
          cmd: 'notify.inline',
          msg: 'Cannot detect "title" from GET response'
        });
      }
    };
    req.onerror = (e) => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg: e.type + ' ' + req.status
    });
    req.send();
  }
});

function activate (tabId) {
  chrome.browserAction.setIcon({
    tabId,
    path: {
      '16': 'data/icons/bookmarked/16.png',
      '32': 'data/icons/bookmarked/32.png',
      '64': 'data/icons/bookmarked/64.png'
    }
  });
}
function deactivate (tabId) {
  chrome.browserAction.setIcon({
    tabId,
    path: {
      '16': 'data/icons/16.png',
      '32': 'data/icons/32.png',
      '64': 'data/icons/64.png'
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  chrome.bookmarks.search({
    url:tab.url
  }, nodes => {
    if (nodes.length) {
      activate(tabId);
    }
  });
});

function update () {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      chrome.bookmarks.search({
        url:tab.url
      }, nodes => {
        if (nodes.length) {
          activate(tab.id);
        }
        else {
          deactivate(tab.id);
        }
      });
    });
  });
}
chrome.bookmarks.onChanged.addListener(update);
chrome.bookmarks.onCreated.addListener(update);
chrome.bookmarks.onRemoved.addListener(update);
update();

// FAQs
chrome.storage.local.get('version', (obj) => {
  let version = chrome.runtime.getManifest().version;
  if (obj.version !== version) {
    chrome.storage.local.set({version}, () => {
      chrome.tabs.create({
        url: 'http://add0n.com/bookmarks-manager.html?version=' + version + '&type=' + (obj.version ? ('upgrade&p=' + obj.version) : 'install')
      });
    });
  }
});
