(function () {
  "use strict";
  const X = globalThis.ExchangeCompanion;
  const $ = (id) => document.getElementById(id);
  const checkboxes = [
    "enabled",
    "showBook",
    "showButtons",
    "polyusEnabled",
    "kalshiEnabled",
    "prophetxEnabled",
  ];
  const selects = {
    format: X.FORMATS,
    polyusTier: X.POLYUS_TIERS,
    kalshiFee: X.KALSHI_FEES,
    prophetxModel: X.PROPHETX_MODELS,
  };

  for (const [id, options] of Object.entries(selects)) {
    for (const [value, opt] of Object.entries(options)) {
      $(id).add(new Option(typeof opt === "string" ? opt : opt.label, value));
    }
  }

  function syncDisabled(settings) {
    document.body.classList.toggle("off", !settings.enabled);
    for (const section of document.querySelectorAll("section[data-site]")) {
      section.classList.toggle("off", !settings[`${section.dataset.site}Enabled`]);
    }
  }

  chrome.storage.sync.get(X.DEFAULTS, (stored) => {
    const settings = { ...X.DEFAULTS, ...stored };
    for (const id of checkboxes) $(id).checked = settings[id];
    for (const id of Object.keys(selects)) $(id).value = settings[id];
    syncDisabled(settings);

    const save = (key, value) => {
      settings[key] = value;
      chrome.storage.sync.set({ [key]: value });
      syncDisabled(settings);
    };
    for (const id of checkboxes) $(id).addEventListener("change", (e) => save(id, e.target.checked));
    for (const id of Object.keys(selects)) $(id).addEventListener("change", (e) => save(id, e.target.value));
  });
})();
