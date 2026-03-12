(function () {
  if (globalThis.__chatgptConversationArchiveInjected) {
    return;
  }
  globalThis.__chatgptConversationArchiveInjected = true;

  const ns = globalThis.__chatgptConversationArchiveContent;
  if (!ns) {
    throw new Error("ChatGPT content runtime is unavailable.");
  }

  ns.initializeSidebarFolderController();
  ns.initializeConversationTocController();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === ns.MESSAGE_TYPES.PING) {
      sendResponse({
        ok: true,
        pong: true,
        url: window.location.href,
        readyState: document.readyState
      });
      return false;
    }

    if (message?.type === ns.MESSAGE_TYPES.EXTRACT_CURRENT_CONVERSATION) {
      ns.extractCurrentConversationWhenReady({
        timeoutMs: 20_000,
        intervalMs: 300
      })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error?.message || "Failed to extract current conversation."
          })
        );
      return true;
    }

    if (message?.type === ns.MESSAGE_TYPES.EXTRACT_HISTORY_LINKS) {
      ns.extractHistoryLinksWithLoadMore({
        maxIterations: 18,
        idleRoundsToStop: 3,
        waitMs: 350,
        maxDurationMs: 15_000
      })
        .then((items) => sendResponse({ ok: true, items }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error?.message || "Failed to extract history links."
          })
        );
      return true;
    }

    return false;
  });
})();
