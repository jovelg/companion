// Isolated world: owns chrome.storage and relays settings to the page-world renderer.
(function () {
  "use strict";
  const { DEFAULTS } = globalThis.ExchangeCompanion;
  let settings = null;

  function publish() {
    if (!settings) return;
    window.dispatchEvent(
      new CustomEvent("exchange-companion:settings", { detail: JSON.stringify(settings) })
    );
  }

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    publish();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !settings) return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    publish();
  });

  // The page-world script asks for settings when it starts, in case it loaded after us.
  window.addEventListener("exchange-companion:request", publish);
})();
