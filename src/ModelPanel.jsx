import React, { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  ExternalLink,
  ListRestart,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { call, isDesktop } from "./bridge";
import { EFFORT_OPTIONS, MODEL_PRESETS, PRESET_GROUPS, presetById } from "./model-presets";

// Codex 大模型供应商切换页。配置写入 ~/.codex/config.toml + auth.json（Rust 侧原子写、带备份），
// 切换后必须重启 Codex 才生效 —— 正好复用 Studio 的 restart_codex，皮肤会自动重新注入。

function makeProviderId(presetId) {
  return `${presetId || "custom"}-${Math.random().toString(36).slice(2, 8)}`;
}

function profileFromPreset(preset) {
  return {
    id: makeProviderId(preset.id),
    name: preset.name,
    presetId: preset.id,
    baseUrl: preset.baseUrl,
    wireApi: preset.wireApi,
    apiKey: "",
    model: preset.model,
    reasoningEffort: "",
    official: Boolean(preset.official),
    catalogModels: [],
  };
}

function Field({ label, hint, children }) {
  return (
    <label className="model-field">
      <span>{label}{hint && <small>{hint}</small>}</span>
      {children}
    </label>
  );
}

export default function ModelPanel({ status, notify, restartCodex }) {
  const [store, setStore] = useState({ activeId: null, providers: [] });
  const [live, setLive] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [fetchedModels, setFetchedModels] = useState([]); // 自动拉取的 /v1/models 结果
  const [fetching, setFetching] = useState(false);
  const [modelFilter, setModelFilter] = useState("");

  const selected = store.providers.find((provider) => provider.id === selectedId) || null;

  useEffect(() => {
    (async () => {
      try {
        const [loaded, liveConfig] = await Promise.all([
          call("load_model_providers"),
          call("read_live_model_config").catch(() => null),
        ]);
        let next = { activeId: loaded.activeId ?? null, providers: loaded.providers || [] };
        // 首次打开：把 Codex 当前实际配置导入成一个供应商，保证切走之后还能无损切回
        if (!next.providers.length && liveConfig && (liveConfig.baseUrl || liveConfig.authMode === "oauth")) {
          const imported = liveConfig.authMode === "oauth" && !liveConfig.provider
            ? { ...profileFromPreset(presetById("official")), name: "OpenAI 官方登录" }
            : {
                id: makeProviderId("imported"),
                name: liveConfig.providerName ? `当前配置（${liveConfig.providerName}）` : "当前配置（导入）",
                presetId: "custom",
                baseUrl: liveConfig.baseUrl || "",
                wireApi: liveConfig.wireApi === "chat" ? "chat" : "responses",
                apiKey: liveConfig.apiKey || "",
                model: liveConfig.model || "",
                reasoningEffort: liveConfig.reasoningEffort || "",
                official: false,
              };
          next = { activeId: imported.id, providers: [imported] };
          await call("save_model_providers", { payload: next });
        }
        setStore(next);
        setLive(liveConfig);
        setSelectedId(next.activeId || next.providers[0]?.id || null);
      } catch (error) {
        notify(error.message || String(error), "error");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    setDraft(selected ? { catalogModels: [], ...selected } : null);
    setShowKey(false);
    setFetchedModels([]);
    setModelFilter("");
  }, [selectedId, store.providers]);

  const fetchModels = async () => {
    if (!draft?.baseUrl.trim()) { notify("请先填写 Base URL", "error"); return; }
    if (!draft.apiKey.trim()) { notify("请先填写 API Key 再拉取模型", "error"); return; }
    setFetching(true);
    try {
      const models = await call("fetch_provider_models", { baseUrl: draft.baseUrl, apiKey: draft.apiKey });
      setFetchedModels(models);
      if (!models.length) { notify("该供应商返回了空模型列表", "error"); return; }
      // 默认模型不在列表里（或还没填）时，自动选第一个，用户不用手打
      if (!draft.model || !models.some((item) => item.id === draft.model)) {
        setDraft((current) => ({ ...current, model: models[0].id }));
      }
      notify(`已拉取 ${models.length} 个模型`);
    } catch (error) {
      notify(error.message || String(error), "error");
    } finally {
      setFetching(false);
    }
  };

  const toggleCatalogModel = (id) => {
    setDraft((current) => {
      const list = current.catalogModels || [];
      return {
        ...current,
        catalogModels: list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
      };
    });
  };

  const persist = async (next) => {
    setStore(next);
    await call("save_model_providers", { payload: next });
  };

  const addFromPreset = async (preset) => {
    const profile = profileFromPreset(preset);
    await persist({ ...store, providers: [...store.providers, profile] });
    setSelectedId(profile.id);
  };

  const saveDraft = async () => {
    if (!draft) return null;
    if (!draft.official && !draft.baseUrl.trim()) {
      notify("请填写 Base URL", "error");
      return null;
    }
    const next = {
      ...store,
      providers: store.providers.map((provider) => provider.id === draft.id ? { ...draft } : provider),
    };
    await persist(next);
    notify("供应商已保存");
    return next;
  };

  const removeProvider = async (provider) => {
    const next = {
      activeId: store.activeId === provider.id ? null : store.activeId,
      providers: store.providers.filter((item) => item.id !== provider.id),
    };
    await persist(next);
    if (selectedId === provider.id) setSelectedId(next.providers[0]?.id || null);
  };

  const activate = async () => {
    if (!draft) return;
    if (!draft.official && !draft.apiKey.trim()) {
      notify("请先填写 API Key", "error");
      return;
    }
    // 勾选了目录但漏掉当前模型时自动补上，否则 Codex 选择器里反而找不到正在用的模型
    const catalogModels = (draft.catalogModels || []).length && draft.model && !draft.catalogModels.includes(draft.model)
      ? [draft.model, ...draft.catalogModels]
      : draft.catalogModels || [];
    setBusy(true);
    try {
      const next = await saveDraft();
      if (!next) return;
      await call("apply_model_provider", { profile: { ...draft, catalogModels } });
      await persist({ ...next, activeId: draft.id });
      setLive(await call("read_live_model_config").catch(() => null));
      if (status.connected) {
        notify("配置已写入，正在重启 Codex 生效（皮肤会自动恢复）…");
        await restartCodex();
      } else {
        notify("配置已写入 ~/.codex，下次启动 Codex 生效");
      }
    } catch (error) {
      notify(error.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const groupedPresets = useMemo(
    () => PRESET_GROUPS.map((group) => [group, MODEL_PRESETS.filter((preset) => preset.group === group)]),
    [],
  );

  if (!ready) return <main className="studio-layout model-layout"><p className="model-loading">正在读取配置…</p></main>;

  return (
    <main className="studio-layout model-layout">
      <aside className="library">
        <header className="library-head">
          <div><strong>模型供应商</strong><small>{store.providers.length} 个配置</small></div>
        </header>
        <div className="model-provider-list">
          {store.providers.map((provider) => (
            <div key={provider.id} className={`model-card ${provider.id === selectedId ? "selected" : ""}`}>
              <button className="model-card-main" onClick={() => setSelectedId(provider.id)}>
                <strong>{provider.name}</strong>
                <small>{provider.official ? "官方登录" : provider.model || provider.baseUrl || "未配置"}</small>
              </button>
              {provider.id === store.activeId && <span className="model-active-badge"><Check size={12} />使用中</span>}
              <button className="model-card-delete" title="删除" onClick={() => removeProvider(provider)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="model-add">
          <span><Plus size={14} />从预设添加</span>
          <select value="" onChange={(event) => { const preset = presetById(event.target.value); if (preset) addFromPreset(preset); }}>
            <option value="" disabled>选择供应商预设…</option>
            {groupedPresets.map(([group, presets]) => (
              <optgroup key={group} label={group}>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </aside>

      <section className="model-editor">
        <header className="model-live">
          <BrainCircuit size={18} />
          <div>
            <strong>Codex 当前配置</strong>
            <small>
              {live
                ? live.provider
                  ? `${live.providerName || live.provider} · ${live.model || "默认模型"} · ${live.baseUrl || ""}${live.managed ? "" : "（外部配置）"}`
                  : `官方端点 · ${live.model || "默认模型"} · ${live.authMode === "oauth" ? "ChatGPT 登录" : live.authMode === "apiKey" ? "API Key" : "未登录"}`
                : "无法读取 ~/.codex/config.toml"}
            </small>
          </div>
          {!isDesktop && <span className="model-preview-tag">浏览器预览：不会写入真实配置</span>}
        </header>

        {draft ? (
          <div className="model-form">
            <Field label="显示名称">
              <input value={draft.name} maxLength={40} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            {!draft.official && (
              <>
                <Field label="Base URL" hint="OpenAI 兼容接口地址">
                  <input value={draft.baseUrl} placeholder="https://api.example.com/v1" spellCheck={false} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value.trim() })} />
                </Field>
                <Field label="API Key">
                  <div className="model-key-row">
                    <input type={showKey ? "text" : "password"} value={draft.apiKey} placeholder="sk-…" spellCheck={false} autoComplete="off" onChange={(event) => setDraft({ ...draft, apiKey: event.target.value.trim() })} />
                    <button onClick={() => setShowKey(!showKey)} title={showKey ? "隐藏" : "显示"}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                  {presetById(draft.presetId)?.keyUrl && (
                    <a className="model-key-link" href={presetById(draft.presetId).keyUrl} target="_blank" rel="noreferrer">获取 API Key <ExternalLink size={12} /></a>
                  )}
                </Field>
                <div className="model-field-row">
                  <Field label="模型" hint={fetchedModels.length ? `已拉取 ${fetchedModels.length} 个` : "点右侧按钮自动拉取"}>
                    <div className="model-key-row">
                      {fetchedModels.length ? (
                        <select value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })}>
                          {fetchedModels.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                          {!fetchedModels.some((item) => item.id === draft.model) && draft.model && <option value={draft.model}>{draft.model}</option>}
                        </select>
                      ) : (
                        <input value={draft.model} spellCheck={false} placeholder="拉取后可下拉选择" onChange={(event) => setDraft({ ...draft, model: event.target.value.trim() })} />
                      )}
                      <button onClick={fetchModels} disabled={fetching} title="从供应商拉取模型列表">
                        {fetching ? <RefreshCw className="spin" size={15} /> : <ListRestart size={15} />}
                      </button>
                    </div>
                  </Field>
                  <Field label="接口协议" hint="responses = 原生 / chat = 兼容">
                    <select value={draft.wireApi} onChange={(event) => setDraft({ ...draft, wireApi: event.target.value })}>
                      <option value="responses">Responses API</option>
                      <option value="chat">Chat Completions</option>
                    </select>
                  </Field>
                </div>
                {fetchedModels.length > 0 && (
                  <div className="model-field">
                    <span>Codex 菜单模型<small>勾选后写入模型目录，Codex 的模型选择器里就能直接切换这些模型</small></span>
                    {fetchedModels.length > 8 && (
                      <input className="model-catalog-filter" value={modelFilter} placeholder="筛选模型…" onChange={(event) => setModelFilter(event.target.value)} />
                    )}
                    <div className="model-catalog-list">
                      {fetchedModels
                        .filter((item) => !modelFilter || item.id.toLowerCase().includes(modelFilter.toLowerCase()))
                        .slice(0, 200)
                        .map((item) => (
                          <label key={item.id} className="model-catalog-item">
                            <input type="checkbox" checked={(draft.catalogModels || []).includes(item.id)} onChange={() => toggleCatalogModel(item.id)} />
                            <span>{item.id}</span>
                            {item.ownedBy && <small>{item.ownedBy}</small>}
                          </label>
                        ))}
                    </div>
                    {(draft.catalogModels || []).length > 0 && <small className="model-catalog-count">已选 {(draft.catalogModels || []).length} 个（上限 50，切换时生效）</small>}
                  </div>
                )}
              </>
            )}
            <Field label="推理强度">
              <select value={draft.reasoningEffort} onChange={(event) => setDraft({ ...draft, reasoningEffort: event.target.value })}>
                {EFFORT_OPTIONS.map(([valueOption, label]) => <option key={valueOption} value={valueOption}>{label}</option>)}
              </select>
            </Field>
            {presetById(draft.presetId)?.note && <p className="model-note"><CircleAlert size={14} />{presetById(draft.presetId).note}</p>}

            <div className="model-actions">
              <button className="secondary-button" disabled={busy} onClick={saveDraft}>保存</button>
              <button className="primary-button" disabled={busy} onClick={activate}>
                {busy ? <RefreshCw className="spin" size={15} /> : <Check size={15} />}
                {busy ? "正在切换" : status.connected ? "切换并重启 Codex" : "切换（下次启动生效）"}
              </button>
            </div>
            <p className="model-footnote">
              写入 <code>~/.codex/config.toml</code> 与 <code>auth.json</code>，写入前自动备份到 <code>~/.codex/backups-aha/</code>；
              只修改 aha-codex 自己的供应商条目，不影响 MCP 等其他配置。官方登录凭据在首次切换第三方时自动备份，切回官方即还原。
            </p>
          </div>
        ) : (
          <p className="model-empty">左侧选择一个供应商，或从预设添加。</p>
        )}
      </section>
    </main>
  );
}
