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

{
  const css = localStorage.getItem('css') || '';
  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }
}
// loaded in sidebar

document.addEventListener('DOMContentLoaded', () => {
  if (
    location.search && location.search.indexOf('in=sidebar') !== -1 ||
    location.search && location.search.indexOf('in=tab') !== -1
  ) {
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  }
  else {
    chrome.storage.local.get({
      width: 400,
      height: 600
    }, prefs => {
      document.body.style.width = prefs.width + 'px';
      document.body.style.height = prefs.height + 'px';
    });
  }
});
