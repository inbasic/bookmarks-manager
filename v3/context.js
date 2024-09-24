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
      if (/Firefox/.test(navigator.userAgent)) {
        chrome.contextMenus.create({
          id: 'options',
          title: 'Options',
          contexts: ['action']
        }, () => chrome.runtime.lastError);
      }
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
        self.notify(lastError.message);
      }
    }));
  }
  else if (info.menuItemId === 'options') {
    chrome.runtime.openOptionsPage();
  }
});
