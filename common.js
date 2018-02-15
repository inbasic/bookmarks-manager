/* Copyright (C) 2014-2017 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: http://add0n.com/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

'use strict';

chrome.runtime.onMessage.addListener(request => {
  if (request.cmd === 'validate') {
    const req = new XMLHttpRequest();
    req.open('GET', request.url);
    req.onload = () => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg: 'Link is fine'
    });
    req.onerror = e => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg: e.type + ' ' + req.status
    });
    req.send();
  }
  else if (request.cmd === 'update-title') {
    const req = new XMLHttpRequest();
    req.open('GET', request.url);
    req.responseType = 'document';
    req.onload = () => {
      const title = req.responseXML.title;
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
    req.onerror = e => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg: e.type + ' ' + req.status
    });
    req.send();
  }
});

function activate(tabId) {
  chrome.browserAction.setIcon({
    tabId,
    path: {
      '16': 'data/icons/bookmarked/16.png',
      '32': 'data/icons/bookmarked/32.png',
      '64': 'data/icons/bookmarked/64.png'
    }
  });
}
function deactivate(tabId) {
  chrome.browserAction.setIcon({
    tabId,
    path: {
      '16': 'data/icons/16.png',
      '32': 'data/icons/32.png',
      '64': 'data/icons/64.png'
    }
  });
}

function search(url, callback) {
  if (url.startsWith('about:') || url.startsWith('view-source:')) {
    return;
  }
  chrome.bookmarks.search({url}, callback);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  search(tab.url, nodes => {
    if (nodes && nodes.length) {
      activate(tabId);
    }
  });
});

function update() {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      search(tab.url, nodes => {
        if (nodes && nodes.length) {
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

// FAQs & Feedback
// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': false,
  'last-update': 0,
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
