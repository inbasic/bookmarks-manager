/* Copyright (C) 2014-2025 InBasic
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Home: https://webextension.org/listing/bookmarks-manager.html
 * GitHub: https://github.com/inbasic/bookmarks-manager/
*/

if (typeof importScripts !== 'undefined') {
  self.importScripts('monitor.js');
  self.importScripts('context.js');
}

self.notify = message => chrome.notifications.create({
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message,
  type: 'basic'
}, id => setTimeout(() => chrome.notifications.clear(id), 5000));

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
