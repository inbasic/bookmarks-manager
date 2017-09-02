'use strict';

var utils = {};

utils.copy = (text) => {
  document.oncopy = (event) => {
    event.clipboardData.setData('Text', text);
    event.preventDefault();
  };
  document.execCommand('Copy');
  document.oncopy = undefined;
};
