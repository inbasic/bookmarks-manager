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

const utils = {};

utils.copy = text => navigator.clipboard.writeText(text).catch(() => {
  document.oncopy = event => {
    event.clipboardData.setData('Text', text);
    event.preventDefault();
  };
  document.execCommand('Copy');
  document.oncopy = undefined;
});

utils.favicon = (() => {
  const isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
  return url => {
    if (url.startsWith('/')) {
      return url;
    }
    if (url.startsWith('about:') || url.startsWith('chrome') || url.startsWith('moz')) {
      return '/data/panel/icons/page.png';
    }
    if (isFirefox) {
      if (localStorage.getItem('resolve') === 'true') {
        return 'http://www.google.com/s2/favicons?domain_url=' + url;
      }
      else {
        return '/data/panel/icons/page.png';
      }
    }
    return chrome.runtime.getURL('/_favicon?') + 'pageUrl=' + encodeURIComponent(url) + '&size=48';
  };
})();
// Firefox only user consent
if (
  navigator.userAgent.indexOf('Firefox') !== -1 &&
  localStorage.getItem('offer-favicon') !== 'false' &&
  localStorage.getItem('resolve') !== 'true'
) {
  document.body.dataset.favicon = true;
  document.querySelector('.favicon input[type=button]').addEventListener('click', () => {
    localStorage.setItem('offer-favicon', false);
    document.body.dataset.favicon = false;
  });
  document.querySelector('.favicon input[type=checkbox]').addEventListener('change', e => {
    localStorage.setItem('resolve', e.target.checked);
  });
}
