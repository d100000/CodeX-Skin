import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Code2,
  GitPullRequest,
  Home,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Plus,
  Puzzle,
  Search,
  Send,
  Settings,
  Sparkles,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import "./preview.css";

const actions = [
  { icon: Code2, title: "探索并理解代码", caption: "快速熟悉项目结构" },
  { icon: Puzzle, title: "构建新功能", caption: "从想法到可运行实现" },
  { icon: ClipboardCheck, title: "审查代码", caption: "发现风险并提出建议" },
  { icon: Wrench, title: "修复问题", caption: "定位失败并完成验证" },
];

const tasks = [
  "玩偶姐姐主题设计",
  "生成背景与人物素材",
  "适配 Codex 首页布局",
  "验证一键安装流程",
];

function IconButton({ label, children }) {
  return <button className="icon-button" aria-label={label} title={label}>{children}</button>;
}

function App() {
  const [selected, setSelected] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!prompt.trim()) return;
    setSent(true);
    window.setTimeout(() => setSent(false), 1800);
    setPrompt("");
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><Bot size={18} /></div>
          <strong>Codex</strong>
          <IconButton label="搜索"><Search size={17} /></IconButton>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <button className="nav-item active"><Home size={17} />新建任务</button>
          <button className="nav-item"><Archive size={17} />已归档</button>
          <button className="nav-item"><GitPullRequest size={17} />代码审查</button>
          <button className="nav-item"><TerminalSquare size={17} />环境</button>
        </nav>

        <div className="section-title"><span>项目</span><Plus size={15} /></div>
        <button className="project-select"><Sparkles size={15} />玩偶姐姐主题设计<ChevronDown size={14} /></button>
        <div className="task-list">
          {tasks.map((task, index) => (
            <button key={task} className={`task-item ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)}>
              <MessageCircle size={14} />
              <span>{task}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="avatar">D</div>
          <div><strong>kimerya</strong><span>个人空间</span></div>
          <IconButton label="设置"><Settings size={16} /></IconButton>
        </div>
      </aside>

      <section className="workspace">
        <div className="petals" aria-hidden="true" />
        <header className="topbar">
          <div><strong>玩偶姐姐 · Codex 皮肤</strong><span>原创主题预览</span></div>
          <div className="limited">DOLL EDITION</div>
          <IconButton label="更多"><MoreHorizontal size={18} /></IconButton>
        </header>

        <section className="welcome">
          <div className="eyebrow"><Sparkles size={15} /> DOLL WORKSPACE</div>
          <h1>今天想和 Codex<br />一起构建什么？</h1>
          <p>让灵感保持柔软，让代码保持清晰。</p>
        </section>

        <section className="action-grid" aria-label="快捷任务">
          {actions.map(({ icon: Icon, title, caption }) => (
            <button className="action-card" key={title} onClick={() => setPrompt(title)}>
              <span className="action-icon"><Icon size={22} /></span>
              <strong>{title}</strong>
              <small>{caption}</small>
            </button>
          ))}
        </section>

        <section className="composer-wrap">
          {sent && <div className="toast"><CheckCircle2 size={16} />任务已提交</div>}
          <div className="composer">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述一个任务，或从上方选择快捷入口…" aria-label="任务描述" />
            <div className="composer-toolbar">
              <div>
                <IconButton label="添加上下文"><Plus size={18} /></IconButton>
                <button className="context-button"><Code2 size={15} />本地项目<ChevronDown size={14} /></button>
              </div>
              <div>
                <span className="model">GPT-5.4</span>
                <IconButton label="语音输入"><Mic size={17} /></IconButton>
                <button className="send-button" onClick={submit} aria-label="发送任务"><Send size={18} /></button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
