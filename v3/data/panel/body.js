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

if (!Element.prototype.scrollIntoViewIfNeeded) {
  Element.prototype.scrollIntoViewIfNeeded = function(centerIfNeeded) {
    function withinBounds(value, min, max, extent) {
      if (centerIfNeeded === false || max <= value + extent && value <= min + extent) {
        return Math.min(max, Math.max(min, value));
      }
      else {
        return (min + max) / 2;
      }
    }

    function makeArea(left, top, width, height) {
      return {
        'left': left,
        'top': top,
        'width': width,
        'height': height,
        'right': left + width,
        'bottom': top + height,
        'translate': function(x, y) {
          return makeArea(x + left, y + top, width, height);
        },
        'relativeFromTo': function(lhs, rhs) {
          let newLeft = left;
          let newTop = top;
          lhs = lhs.offsetParent;
          rhs = rhs.offsetParent;
          if (lhs === rhs) {
            return area;
          }
          for (; lhs; lhs = lhs.offsetParent) {
            newLeft += lhs.offsetLeft + lhs.clientLeft;
            newTop += lhs.offsetTop + lhs.clientTop;
          }
          for (; rhs; rhs = rhs.offsetParent) {
            newLeft -= rhs.offsetLeft + rhs.clientLeft;
            newTop -= rhs.offsetTop + rhs.clientTop;
          }
          return makeArea(newLeft, newTop, width, height);
        }
      };
    }

    let parent;
    let elem = this;
    let area = makeArea(
      this.offsetLeft, this.offsetTop,
      this.offsetWidth, this.offsetHeight
    );
    while ((parent = elem.parentNode) instanceof HTMLElement) {
      const clientLeft = parent.offsetLeft + parent.clientLeft;
      const clientTop = parent.offsetTop + parent.clientTop;

      // Make area relative to parent's client area.
      area = area
        .relativeFromTo(elem, parent)
        .translate(-clientLeft, -clientTop);

      parent.scrollLeft = withinBounds(
        parent.scrollLeft,
        area.right - parent.clientWidth, area.left,
        parent.clientWidth);

      parent.scrollTop = withinBounds(
        parent.scrollTop,
        area.bottom - parent.clientHeight, area.top,
        parent.clientHeight);

      // Determine actual scroll amount by reading back scroll properties.
      area = area.translate(clientLeft - parent.scrollLeft,
        clientTop - parent.scrollTop);
      elem = parent;
    }
  };
}

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
  if (location.search && location.search.indexOf('in=tab') !== -1) {
    document.querySelector('[data-cmd=open-in-tab]').remove();
  }
  if (
    location.search && location.search.indexOf('in=sidebar') !== -1 ||
    location.search && location.search.indexOf('in=tab') !== -1
  ) {
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  }
  else {
    chrome.storage.local.get({
      width: 500,
      height: 600
    }, prefs => {
      document.body.style.width = prefs.width + 'px';
      document.body.style.height = prefs.height + 'px';
    });
  }
});
