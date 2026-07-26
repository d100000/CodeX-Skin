// Codex 大模型供应商预设（精选自 cc-switch 的 67 个 Codex 预设，按国内可用性与知名度筛选）。
// wireApi："responses" = OpenAI Responses API 直连；"chat" = Chat Completions（Codex 原生支持，无需本地代理）。
// keyUrl 只是申请入口链接，绝不内置任何真实 Key。

export const MODEL_PRESETS = [
  {
    id: "official",
    name: "OpenAI 官方登录",
    group: "官方",
    official: true,
    baseUrl: "",
    wireApi: "responses",
    model: "",
    keyUrl: "https://chatgpt.com",
    note: "使用 ChatGPT 账号登录，无需 API Key。切换时自动还原之前备份的官方登录。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    group: "国内大厂",
    baseUrl: "https://api.deepseek.com",
    wireApi: "chat",
    model: "deepseek-v4-flash",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "kimi",
    name: "Kimi（月之暗面）",
    group: "国内大厂",
    baseUrl: "https://api.moonshot.cn/v1",
    wireApi: "chat",
    model: "kimi-k2.7-code",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    group: "国内大厂",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    wireApi: "chat",
    model: "glm-5.2",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "bailian",
    name: "通义百炼（阿里云）",
    group: "国内大厂",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    wireApi: "responses",
    model: "qwen3-coder-plus",
    keyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
  },
  {
    id: "volcano",
    name: "豆包 · 火山方舟",
    group: "国内大厂",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    wireApi: "responses",
    model: "doubao-seed-2-1-pro-260628",
    keyUrl: "https://console.volcengine.com/ark",
  },
  {
    id: "minimax",
    name: "MiniMax",
    group: "国内大厂",
    baseUrl: "https://api.minimaxi.com/v1",
    wireApi: "responses",
    model: "MiniMax-M3",
    keyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow（硅基流动）",
    group: "聚合平台",
    baseUrl: "https://api.siliconflow.cn/v1",
    wireApi: "chat",
    model: "Pro/MiniMaxAI/MiniMax-M2.7",
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  {
    id: "modelscope",
    name: "ModelScope（魔搭）",
    group: "聚合平台",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    wireApi: "chat",
    model: "ZhipuAI/GLM-5.1",
    keyUrl: "https://modelscope.cn/my/myaccesstoken",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    group: "聚合平台",
    baseUrl: "https://openrouter.ai/api/v1",
    wireApi: "responses",
    model: "gpt-5.6-sol",
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "aihubmix",
    name: "AiHubMix",
    group: "聚合平台",
    baseUrl: "https://aihubmix.com/v1",
    wireApi: "responses",
    model: "gpt-5.6-sol",
    keyUrl: "https://aihubmix.com/token",
  },
  {
    id: "packycode",
    name: "PackyCode",
    group: "聚合平台",
    baseUrl: "https://www.packyapi.ai/v1",
    wireApi: "responses",
    model: "gpt-5.6-sol",
    keyUrl: "https://www.packyapi.ai",
  },
  {
    id: "custom",
    name: "自定义中转",
    group: "自定义",
    baseUrl: "",
    wireApi: "responses",
    model: "gpt-5.6-sol",
    keyUrl: "",
    note: "填写任意 OpenAI 兼容中转的 Base URL 与 Key。",
  },
];

export const PRESET_GROUPS = ["官方", "国内大厂", "聚合平台", "自定义"];

export function presetById(id) {
  return MODEL_PRESETS.find((preset) => preset.id === id) || null;
}

export const EFFORT_OPTIONS = [
  ["", "跟随默认"],
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
];
