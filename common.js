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

var notify = message => chrome.notifications.create({
  iconUrl: 'data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message,
  type: 'basic'
});

var title = url => new Promise((resolve, reject) => {
  const req = new XMLHttpRequest();
  req.open('GET', url);
  req.responseType = 'document';
  req.onload = () => {
    const title = req.responseXML.title;
    if (title) {
      resolve(title);
    }
    else {
      reject('Cannot detect "title" from GET response');
    }
  };
  req.onerror = e => reject(e.type + ' ' + req.status);
  req.ontimeout = () => reject('cannot resolve title (timeout)');
  req.send();
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'validate') {
    const req = new XMLHttpRequest();
    try {
      req.open('GET', request.url);
    }
    catch (e) {
      return response({
        valid: false,
        msg: 'Link is dead'
      });
    }
    req.timeout = 6000;
    req.onload = () => response({
      valid: true,
      msg: 'Link is fine'
    });
    req.ontimeout = req.onerror = () => response({
      valid: false,
      msg: 'Link is dead'
    });
    req.send();

    return true;
  }
  else if (request.cmd === 'update-title') {
    title(request.url).then(title => chrome.runtime.sendMessage({
      cmd: 'title-info',
      id: request.id,
      title
    })).catch(msg => chrome.runtime.sendMessage({
      cmd: 'notify.inline',
      msg
    }));
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

// context menu
{
  const context = typeof InstallTrigger !== 'undefined' ? 'root________' : '0';

  const callback = () => chrome.storage.local.get({
    context
  }, prefs => prefs.context && chrome.contextMenus.create({
    id: 'bookmark-link',
    title: 'Bookmark this Link',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*']
  }));
  chrome.runtime.onInstalled.addListener(callback);
  chrome.runtime.onStartup.addListener(callback);

  chrome.contextMenus.onClicked.addListener(info => {
    if (info.menuItemId === 'bookmark-link') {
      title(info.linkUrl).catch(() => info.selectionText || info.linkUrl).then(title => chrome.storage.local.get({
        context
      }, prefs => chrome.bookmarks.create({
        parentId: prefs.context,
        title,
        url: info.linkUrl
      }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          notify(lastError.message);
        }
      })));
    }
  });
}

// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': true,
  'last-update': 0
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
