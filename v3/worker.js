/* Copyright (C) 2014-2022 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

'use strict';

const notify = message => chrome.notifications.create({
  iconUrl: 'data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message,
  type: 'basic'
}, id => setTimeout(() => chrome.notifications.clear(id), 5000));

async function image(url) {
  const img = await createImageBitmap(await (await fetch(url)).blob());
  const {width: w, height: h} = img;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  return ctx.getImageData(0, 0, w, h);
}

const monitor = () => {
  if (monitor.done) {
    return;
  }
  monitor.done = true;

  chrome.declarativeContent.onPageChanged.removeRules(undefined, async () => {
    const action = new chrome.declarativeContent.SetIcon({
      imageData: {
        16: await image('/data/icons/bookmarked/16.png'),
        32: await image('/data/icons/bookmarked/32.png')
      }
    });
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher({
        isBookmarked: true
      })],
      actions: [action]
    }]);
  });
};
if (chrome.declarativeContent) {
  chrome.runtime.onInstalled.addListener(monitor);
  chrome.runtime.onStartup.addListener(monitor);
}

// context menu
{
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;

    chrome.storage.local.get({
      context: ''
    }, prefs => {
      chrome.contextMenus.create({
        id: 'bookmark-link',
        title: 'Bookmark this Link',
        contexts: ['link'],
        targetUrlPatterns: ['*://*/*'],
        visible: prefs.context !== ''
      }, () => chrome.runtime.lastError);
      chrome.contextMenus.create({
        id: 'bookmark-page',
        title: 'Bookmark this Page',
        contexts: ['page'],
        targetUrlPatterns: ['*://*/*'],
        visible: prefs.context !== ''
      }, () => chrome.runtime.lastError);
    });
  };
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);

  const update = () => chrome.storage.local.get({
    context: ''
  }, prefs => {
    chrome.contextMenus.update('bookmark-link', {
      visible: prefs.context !== ''
    }, () => chrome.runtime.lastError);
    chrome.contextMenus.update('bookmark-page', {
      visible: prefs.context !== ''
    }, () => chrome.runtime.lastError);
  });
  chrome.storage.onChanged.addListener(ps => ps.context && update());
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'bookmark-link' || info.menuItemId === 'bookmark-page') {
    const props = {};
    if (info.menuItemId === 'bookmark-page') {
      props.title = tab.title || 'Unknown Title',
      props.url = tab.url;
    }
    else {
      try {
        props.title = (new URL(info.linkUrl)).hostname;
      }
      catch (e) {
        props.title = info.linkUrl;
      }
      props.url = info.linkUrl;
    }

    chrome.storage.local.get({
      context: ''
    }, prefs => chrome.bookmarks.create({
      parentId: prefs.context,
      ...props
    }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify(lastError.message);
      }
    }));
  }
});

// mode
{
  const once = () => chrome.storage.local.get({
    mode: 'popup'
  }, prefs => chrome.action.setPopup({
    popup: prefs.mode === 'popup' ? 'data/panel/index.html' : ''
  }));

  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
  chrome.storage.onChanged.addListener(prefs => prefs.mode && once());
}
chrome.action.onClicked.addListener(() => chrome.tabs.create({
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
