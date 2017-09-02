'use strict';

var utils = {};

utils.copy = text => {
  document.oncopy = event => {
    event.clipboardData.setData('Text', text);
    event.preventDefault();
  };
  document.execCommand('Copy');
  document.oncopy = undefined;
};

utils.favicon = (() => {
  const isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
  return url => (isFirefox ? 'http://www.google.com/s2/favicons?domain_url=' : 'chrome://favicon/') + url;
})();
