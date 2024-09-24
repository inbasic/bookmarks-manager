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
    const title = req.responseXML ? req.responseXML.title : '';
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
    title(request.url).then(title => response({title}), error => response({error}));
    return true;
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
  }, () => chrome.runtime.lastError);
}
function deactivate(tabId) {
  chrome.browserAction.setIcon({
    tabId,
    path: {
      '16': 'data/icons/16.png',
      '32': 'data/icons/32.png',
      '64': 'data/icons/64.png'
    }
  }, () => chrome.runtime.lastError);
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
  const context = '';

  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;

    chrome.storage.local.get({
      context,
      mode: 'popup'
    }, prefs => {
      if (prefs.context) {
        chrome.contextMenus.create({
          id: 'bookmark-link',
          title: 'Bookmark this Link',
          contexts: ['link'],
          targetUrlPatterns: ['*://*/*']
        });
      }
    });
  };
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);

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

// mode
{
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;
    chrome.storage.local.get({
      mode: 'popup'
    }, prefs => chrome.browserAction.setPopup({
      popup: prefs.mode === 'popup' ? 'data/panel/index.html' : ''
    }));
  };

  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
  chrome.storage.onChanged.addListener(prefs => {
    if (prefs.mode) {
      once.done = false;
      once();
    }
  });
}
chrome.browserAction.onClicked.addListener(() => chrome.tabs.create({
  url: '/data/panel/index.html?in=tab'
}));

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const {homepage_url: page, name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
