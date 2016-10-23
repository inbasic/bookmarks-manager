'use strict';

var notify = (function () {
  let div = document.getElementById('notification');
  let p = div.querySelector('p');
  let callback = function () {};

  div.querySelector('[data-cmd=yes]').addEventListener('click', () => {
    div.style.display = 'none';
    callback(true);
  });
  div.querySelector('[data-cmd=no]').addEventListener('click', () => {
    div.style.display = 'none';
    callback(false);
  });
  div.querySelector('[data-cmd=ok]').addEventListener('click', () => {
    div.style.display = 'none';
  });

  let ts = document.querySelector('#toolbar span');
  let id;

  return {
    confirm: function (msg, c) {
      p.title = p.textContent = msg;
      div.style.display = 'flex';
      div.dataset.type = 'confirm';
      callback = c;
    },
    warning: function (msg) {
      p.title = p.textContent = msg;
      div.style.display = 'flex';
      div.dataset.type = 'warning';
    },
    inline: function (msg) {
      window.clearTimeout(id);
      ts.title = ts.textContent = msg;
      id = window.setTimeout(() => ts.title = ts.textContent = '', 5000);
    }
  };
})();

chrome.runtime.onMessage.addListener((request) => {
  if (request.cmd === 'notify.inline') {
    notify.inline(request.msg);
  }
});
