if (chrome.declarativeContent === undefined) { // Firefox
  const button = {
    activate(tabId) {
      chrome.action.setIcon({
        tabId,
        path: {
          '16': '/data/icons/bookmarked/16.png',
          '32': '/data/icons/bookmarked/32.png',
          '64': '/data/icons/bookmarked/64.png'
        }
      }, () => chrome.runtime.lastError);
    },
    deactivate(tabId) {
      chrome.action.setIcon({
        tabId,
        path: {
          '16': '/data/icons/16.png',
          '32': '/data/icons/32.png',
          '64': '/data/icons/64.png'
        }
      }, () => chrome.runtime.lastError);
    }
  };

  const search = (url, callback) => {
    if (!url || url.startsWith('about:') || url.startsWith('view-source:')) {
      return;
    }
    chrome.bookmarks.search({url}, callback);
  };

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      search(tab.url, nodes => {
        if (nodes && nodes.length) {
          button.activate(tabId);
        }
      });
    }
  });

  const update = () => {
    chrome.tabs.query({}, tabs => tabs.forEach(tab => {
      search(tab.url, nodes => {
        if (nodes && nodes.length) {
          button.activate(tab.id);
        }
        else {
          button.deactivate(tab.id);
        }
      });
    }));
  };
  chrome.bookmarks.onChanged.addListener(update);
  chrome.bookmarks.onCreated.addListener(update);
  chrome.bookmarks.onRemoved.addListener(update);
  update();
}
else { // Chrome
  const image = async url => {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const {width: w, height: h} = img;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    return ctx.getImageData(0, 0, w, h);
  };

  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;

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
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
}
