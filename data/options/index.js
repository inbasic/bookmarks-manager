'use strict';

var log = document.getElementById('status');

function restore_options () {
  chrome.storage.local.get({
    width: 400,
    height: 600
  }, (prefs) => {
    Object.keys(prefs).forEach (name => {
      document.getElementById(name)[typeof prefs[name] === 'boolean' ? 'checked' : 'value'] = prefs[name];
    });
  });
}

function save_options() {
  let prefs = {
    width: Math.max(300, document.getElementById('width').value),
    height: Math.max(400, document.getElementById('height').value)
  };

  chrome.storage.local.set(prefs, () => {
    log.textContent = 'Options saved.';
    setTimeout(() => log.textContent = '', 750);
    restore_options();
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', () => {
  try {
    save_options();
  }
  catch (e) {
    log.textContent = e.message;
    setTimeout(() => log.textContent = '', 750);
  }
});
