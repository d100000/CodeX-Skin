(() => {
  if (window.__CODEX_DOLL_SKIN_ENHANCER__) return;
  window.__CODEX_DOLL_SKIN_ENHANCER__ = true;
  document.documentElement.dataset.codexDollSkin = "active";
  // DOM augmentation remains opt-in until a Codex version adapter is verified.
})();
