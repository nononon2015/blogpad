"use client";

import { useEffect, useRef, useState } from "react";

type Blog = { id: string; name: string; url: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const DRAFT_KEY = "blogpad-draft-v1";
const CONFIG_KEY = "blogpad-config-v1";

const Icon = ({ children }: { children: React.ReactNode }) => (
  <span aria-hidden="true" className="icon">{children}</span>
);

export default function Home() {
  const editorRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [labels, setLabels] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [savedAt, setSavedAt] = useState("尚未保存");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogId, setBlogId] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    const config = localStorage.getItem(CONFIG_KEY);
    if (draft) {
      const data = JSON.parse(draft);
      setTitle(data.title || "");
      setContent(data.content || "");
      setLabels(data.labels || "");
      setSavedAt("已恢复本机草稿");
    }
    if (config) {
      const data = JSON.parse(config);
      setClientId(data.clientId || "");
      setBlogId(data.blogId || "");
    }
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content, mode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, labels }));
      setSavedAt(`已自动保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    }, 600);
    return () => clearTimeout(timer);
  }, [title, content, labels]);

  useEffect(() => {
    if (document.querySelector('script[data-google-identity]')) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.dataset.googleIdentity = "true";
    document.head.appendChild(script);
  }, []);

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML || "");
  }

  async function loadBlogs(accessToken: string) {
    const response = await fetch("https://www.googleapis.com/blogger/v3/users/self/blogs", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("无法读取 Blogger 博客，请检查授权。");
    const data = await response.json();
    const nextBlogs: Blog[] = data.items || [];
    setBlogs(nextBlogs);
    setBlogId((current) => current || nextBlogs[0]?.id || "");
    setConnected(true);
    setNotice(`已连接，共找到 ${nextBlogs.length} 个博客。`);
  }

  function connectGoogle() {
    if (!clientId.trim()) {
      setNotice("请先填写 Google OAuth 客户端 ID。");
      return;
    }
    if (!window.google) {
      setNotice("Google 登录组件仍在加载，请稍后再试。");
      return;
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ clientId: clientId.trim(), blogId }));
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: "https://www.googleapis.com/auth/blogger",
      callback: async (response) => {
        if (!response.access_token) {
          setNotice("Google 授权未完成，请重试。");
          return;
        }
        tokenRef.current = response.access_token;
        setBusy(true);
        try { await loadBlogs(response.access_token); }
        catch (error) { setNotice(error instanceof Error ? error.message : "连接失败。"); }
        finally { setBusy(false); }
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  }

  async function sendToBlogger(isDraft: boolean) {
    if (!connected || !tokenRef.current || !blogId) {
      setSettingsOpen(true);
      setNotice("请先连接 Google 并选择博客。");
      return;
    }
    if (!title.trim() || !content.replace(/<[^>]+>/g, "").trim()) {
      setNotice("标题和正文都需要填写。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const query = isDraft ? "?isDraft=true" : "";
      const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts${query}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "blogger#post",
          blog: { id: blogId },
          title: title.trim(),
          content,
          labels: labels.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
        }),
      });
      if (!response.ok) throw new Error("发送失败，请重新连接 Google 后再试。");
      setNotice(isDraft ? "已保存到 Blogger 草稿箱。" : "文章已发布到 Blogger！");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "发送失败。");
    } finally {
      setBusy(false);
    }
  }

  const plainText = content.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  const wordCount = plainText.replace(/\s/g, "").length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">B</span><span>BlogPad</span></div>
        <div className="top-actions">
          <span className="save-state">{savedAt}</span>
          <button className="icon-button" aria-label="连接设置" onClick={() => setSettingsOpen(true)}><Icon>⚙</Icon></button>
        </div>
      </header>

      <section className="workspace">
        <div className="segmented" role="tablist" aria-label="编辑模式">
          <button className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}>写作</button>
          <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>预览</button>
        </div>

        {mode === "write" ? (
          <article className="paper">
            <textarea className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="文章标题" rows={1} aria-label="文章标题" />
            <div className="toolbar" aria-label="文字格式工具">
              <button onClick={() => format("bold")} aria-label="粗体"><b>B</b></button>
              <button onClick={() => format("italic")} aria-label="斜体"><i>I</i></button>
              <button onClick={() => format("formatBlock", "h2")} aria-label="小标题">H₂</button>
              <span className="divider" />
              <button onClick={() => format("insertUnorderedList")} aria-label="项目列表">☷</button>
              <button onClick={() => format("formatBlock", "blockquote")} aria-label="引用">❝</button>
              <button onClick={() => { const url = prompt("请输入链接地址"); if (url) format("createLink", url); }} aria-label="插入链接">↗</button>
            </div>
            <div ref={editorRef} className="editor" contentEditable suppressContentEditableWarning data-placeholder="从这里开始写……" onInput={(event) => setContent(event.currentTarget.innerHTML)} />
            <div className="meta-row">
              <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="标签（用逗号分隔）" aria-label="文章标签" />
              <span>{wordCount} 字</span>
            </div>
          </article>
        ) : (
          <article className="paper preview-paper">
            <p className="preview-kicker">文章预览</p>
            <h1>{title || "未命名文章"}</h1>
            {labels && <div className="label-list">{labels.split(/[,，]/).filter(Boolean).map((label) => <span key={label}>{label.trim()}</span>)}</div>}
            <div className="preview-content" dangerouslySetInnerHTML={{ __html: content || "<p>正文会显示在这里。</p>" }} />
          </article>
        )}
      </section>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

      <footer className="publish-bar">
        <button className="secondary" disabled={busy} onClick={() => sendToBlogger(true)}>存到 Blogger 草稿</button>
        <button className="primary" disabled={busy} onClick={() => sendToBlogger(false)}>{busy ? "处理中…" : "发布文章"}</button>
      </footer>

      {settingsOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-sheet" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="settings-title">
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div><p className="eyebrow">BLOGGER 连接</p><h2 id="settings-title">连接你的 Google 博客</h2></div>
              <button className="close-button" onClick={() => setSettingsOpen(false)} aria-label="关闭">×</button>
            </div>
            <p className="sheet-copy">OAuth 客户端 ID 只保存在这台设备上；访问令牌不会保存。Google Cloud 中需启用 Blogger API，并把本网页地址加入“已获授权的 JavaScript 来源”。</p>
            <label className="field-label">Google OAuth 客户端 ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="123456…apps.googleusercontent.com" inputMode="text" /></label>
            {blogs.length > 0 && <label className="field-label">选择博客<select value={blogId} onChange={(event) => { setBlogId(event.target.value); localStorage.setItem(CONFIG_KEY, JSON.stringify({ clientId, blogId: event.target.value })); }}>{blogs.map((blog) => <option key={blog.id} value={blog.id}>{blog.name}</option>)}</select></label>}
            <button className="google-button" onClick={connectGoogle} disabled={busy}><span className="google-g">G</span>{connected ? "重新连接 Google" : "连接 Google 并读取博客"}</button>
            <a className="help-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">前往 Google Cloud 设置 →</a>
          </section>
        </div>
      )}
    </main>
  );
}
