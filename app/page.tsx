"use client";

import { useEffect, useRef, useState } from "react";

type Blog = { id: string; name: string; url: string };
type Post = {
  id: string;
  title: string;
  content?: string;
  published?: string;
  updated?: string;
  url?: string;
  status?: "live" | "draft" | "scheduled";
  labels?: string[];
};

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
const POSTS_KEY = "blogpad-posts-v1";
const MEMORIES_KEY_PREFIX = "blogpad-on-this-day-v1-";
const COMMON_LABELS = ["操盘日记", "工作总结", "ai的回答", "读书心得"];
const MAX_PHOTOS_PER_UPLOAD = 18;
const PHOTO_UPLOAD_CONCURRENCY = 3;

export default function Home() {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const tokenRef = useRef("");
  const [screen, setScreen] = useState<"list" | "editor">("list");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [labels, setLabels] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [savedAt, setSavedAt] = useState("尚未保存");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleDraftDate, setScheduleDraftDate] = useState("");
  const [scheduleDraftTime, setScheduleDraftTime] = useState("");
  const [clientId, setClientId] = useState("");
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogId, setBlogId] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [editingPostId, setEditingPostId] = useState("");
  const [cloudName, setCloudName] = useState("");
  const [uploadPreset, setUploadPreset] = useState("");
  const [connected, setConnected] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [onThisDayPosts, setOnThisDayPosts] = useState<Record<number, Post[]>>({});
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [nextPageToken, setNextPageToken] = useState("");
  const [pageTokens, setPageTokens] = useState<string[]>([""]);
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    const config = localStorage.getItem(CONFIG_KEY);
    const cachedPosts = localStorage.getItem(POSTS_KEY);
    if (draft) {
      const data = JSON.parse(draft);
      setTitle(data.title || "");
      setContent(data.content || "");
      setLabels(data.labels || "");
      setScheduleDate(data.scheduleDate || "");
      setScheduleTime(data.scheduleTime || "");
      setSavedAt("已恢复本机草稿");
    }
    if (config) {
      const data = JSON.parse(config);
      setClientId(data.clientId || "");
      setBlogId(data.blogId || "");
      setBlogUrl(data.blogUrl || "");
      setCloudName(data.cloudName || "");
      setUploadPreset(data.uploadPreset || "");
      if (data.blogId) {
        const cachedMemories = localStorage.getItem(`${MEMORIES_KEY_PREFIX}${data.blogId}`);
        if (cachedMemories) setOnThisDayPosts(JSON.parse(cachedMemories));
      }
    }
    if (cachedPosts) setPosts(JSON.parse(cachedPosts));
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content, mode, screen]);

  useEffect(() => {
    if (screen !== "editor") return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, labels, scheduleDate, scheduleTime }));
      setSavedAt(`已自动保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    }, 600);
    return () => clearTimeout(timer);
  }, [title, content, labels, scheduleDate, scheduleTime, screen]);

  useEffect(() => {
    if (document.querySelector('script[data-google-identity]')) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.dataset.googleIdentity = "true";
    document.head.appendChild(script);
  }, []);

  function saveConfig(overrides: Partial<{ clientId: string; blogId: string; blogUrl: string; cloudName: string; uploadPreset: string }> = {}) {
    const nextConfig = {
      clientId: overrides.clientId ?? clientId.trim(),
      blogId: overrides.blogId ?? blogId,
      blogUrl: overrides.blogUrl ?? blogUrl,
      cloudName: overrides.cloudName ?? cloudName.trim(),
      uploadPreset: overrides.uploadPreset ?? uploadPreset.trim(),
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(nextConfig));
  }

  function cachePosts(nextPosts: Post[]) {
    const unique = nextPosts.filter((post, index, all) => all.findIndex((item) => item.id === post.id) === index).slice(0, 40);
    setPosts(unique);
    localStorage.setItem(POSTS_KEY, JSON.stringify(unique));
  }

  async function loadPosts(accessToken: string, selectedBlogId: string, query = "", pageToken = "", resetPagination = true) {
    if (!selectedBlogId) return;
    const params = new URLSearchParams({ maxResults: "30", fetchBodies: "false", orderBy: "updated", status: "live" });
    if (query) params.set("q", query);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${selectedBlogId}/posts?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("无法读取文章列表，请重新连接 Google。");
    const data = await response.json();
    const remotePosts: Post[] = (data.items || []).map((post: Post) => ({ ...post, status: "live" }));
    setPosts(remotePosts);
    if (!query && !pageToken) localStorage.setItem(POSTS_KEY, JSON.stringify(remotePosts));
    setNextPageToken(data.nextPageToken || "");
    if (resetPagination) {
      setActiveSearch(query);
      setSearchText(query);
      setPageTokens([""]);
      setPageIndex(0);
    }
  }

  async function searchPosts(query: string) {
    if (!connected || !tokenRef.current || !blogId) {
      setSettingsOpen(true);
      setNotice("请先连接 Blogger，再搜索文章。");
      return;
    }
    setBusy(true);
    try {
      await loadPosts(tokenRef.current, blogId, query.trim());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "搜索失败。");
    } finally {
      setBusy(false);
    }
  }

  async function changePage(direction: "next" | "previous") {
    const targetIndex = direction === "next" ? pageIndex + 1 : pageIndex - 1;
    if (targetIndex < 0) return;
    const token = direction === "next" ? nextPageToken : pageTokens[targetIndex];
    if (direction === "next" && !token) return;
    setBusy(true);
    try {
      await loadPosts(tokenRef.current, blogId, activeSearch, token, false);
      if (direction === "next") setPageTokens((current) => [...current.slice(0, targetIndex), token]);
      setPageIndex(targetIndex);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "翻页失败。");
    } finally {
      setBusy(false);
    }
  }

  async function loadOnThisDay(accessToken: string, selectedBlogId: string) {
    if (!selectedBlogId) return;
    const today = new Date();
    const month = today.getMonth();
    const day = today.getDate();
    const years = Array.from({ length: 5 }, (_, index) => today.getFullYear() - index - 1);
    const entries = await Promise.all(years.map(async (year) => {
      const start = new Date(year, month, day);
      if (start.getMonth() !== month || start.getDate() !== day) return [year, []] as const;
      const end = new Date(year, month, day + 1);
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        fetchBodies: "false",
        maxResults: "20",
        orderBy: "published",
        status: "live",
      });
      const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${selectedBlogId}/posts?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return [year, []] as const;
      const data = await response.json();
      return [year, (data.items || []).map((post: Post) => ({ ...post, status: "live" as const }))] as const;
    }));
    const memories = Object.fromEntries(entries) as Record<number, Post[]>;
    setOnThisDayPosts(memories);
    localStorage.setItem(`${MEMORIES_KEY_PREFIX}${selectedBlogId}`, JSON.stringify(memories));
  }

  async function loadBlogs(accessToken: string) {
    const response = await fetch("https://www.googleapis.com/blogger/v3/users/self/blogs", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("无法读取 Blogger 博客，请检查授权。");
    const data = await response.json();
    const nextBlogs: Blog[] = data.items || [];
    const selectedBlogId = nextBlogs.some((blog) => blog.id === blogId) ? blogId : nextBlogs[0]?.id || "";
    const selectedBlog = nextBlogs.find((blog) => blog.id === selectedBlogId);
    setBlogs(nextBlogs);
    setBlogId(selectedBlogId);
    setBlogUrl(selectedBlog?.url || "");
    setConnected(true);
    saveConfig({ blogId: selectedBlogId, blogUrl: selectedBlog?.url || "" });
    await Promise.all([loadPosts(accessToken, selectedBlogId), loadOnThisDay(accessToken, selectedBlogId)]);
    setNotice(`已连接，并同步 ${nextBlogs.length > 0 ? "文章列表" : "博客"}。`);
  }

  function connectGoogle() {
    if (!clientId.trim()) {
      setSettingsOpen(true);
      setNotice("请先填写 Google OAuth 客户端 ID。");
      return;
    }
    if (!window.google) {
      setNotice("Google 登录组件仍在加载，请稍后再试。");
      return;
    }
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
        try {
          await loadBlogs(response.access_token);
          setSettingsOpen(false);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "连接失败。");
        } finally {
          setBusy(false);
        }
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  }

  function startWriting() {
    setMode("write");
    setScreen("editor");
  }

  function newArticle() {
    setTitle("");
    setContent("");
    setLabels("");
    setScheduleDate("");
    setScheduleTime("");
    setEditingPostId("");
    setSavedAt("新文章");
    localStorage.removeItem(DRAFT_KEY);
    setMode("write");
    setScreen("editor");
  }

  function openBlog() {
    if (blogUrl) {
      window.open(blogUrl, "_blank", "noopener,noreferrer");
    } else {
      setSettingsOpen(true);
      setNotice("连接 Blogger 后即可进入你的博客。");
    }
  }

  async function editArticle(post: Post) {
    if (!connected || !tokenRef.current || !blogId) {
      setSettingsOpen(true);
      setNotice("请先连接 Google，再编辑文章。");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${post.id}?view=ADMIN`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!response.ok) throw new Error("无法读取文章内容，请重新连接 Google。");
      const fullPost: Post = await response.json();
      setTitle(fullPost.title || "");
      setContent(fullPost.content || "");
      setLabels((fullPost.labels || []).join("，"));
      setScheduleDate("");
      setScheduleTime("");
      setEditingPostId(fullPost.id);
      setSavedAt("正在编辑已发布文章");
      setMode("write");
      setScreen("editor");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "读取文章失败。");
    } finally {
      setBusy(false);
    }
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function insertImages(images: Array<{ url: string; alt: string }>) {
    if (images.length === 0) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (selectionRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = images.map(({ url, alt }) => `<figure><img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" loading="lazy"><figcaption></figcaption></figure>`).join("") + "<p><br></p>";
    document.execCommand("insertHTML", false, html);
    setContent(editorRef.current?.innerHTML || "");
  }

  async function compressImage(file: File): Promise<Blob> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("无法读取这张照片。"));
        element.src = objectUrl;
      });
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("照片处理失败。");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("照片压缩失败。")), "image/jpeg", 0.84));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function uploadSingleImage(file: File): Promise<{ url: string; alt: string }> {
    const compressed = await compressImage(file);
    const form = new FormData();
    form.append("file", compressed, `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`);
    form.append("upload_preset", uploadPreset.trim());
    form.append("folder", "blogpad");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName.trim())}/image/upload`, { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok || !data.secure_url) throw new Error(data?.error?.message || "照片上传失败，请检查 Cloudinary 设置。");
    return { url: data.secure_url, alt: file.name };
  }

  async function uploadImages(files: File[]) {
    if (files.length === 0) return;
    const selectedFiles = files.slice(0, MAX_PHOTOS_PER_UPLOAD);
    const wasLimited = files.length > MAX_PHOTOS_PER_UPLOAD;
    if (!cloudName.trim() || !uploadPreset.trim()) {
      setSettingsOpen(true);
      setNotice("请先在设置中填写 Cloudinary Cloud Name 和 Upload Preset。");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setNotice(wasLimited ? `已选择 ${files.length} 张，只处理前 ${MAX_PHOTOS_PER_UPLOAD} 张。正在处理 0/${selectedFiles.length}…` : `正在处理 0/${selectedFiles.length} 张照片…`);
    const uploaded: Array<{ url: string; alt: string } | undefined> = new Array(selectedFiles.length);
    let completed = 0;
    let failed = 0;
    try {
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < selectedFiles.length) {
          const index = nextIndex++;
          try {
            uploaded[index] = await uploadSingleImage(selectedFiles[index]);
          } catch {
            failed += 1;
          } finally {
            completed += 1;
            setNotice(`正在处理 ${completed}/${selectedFiles.length} 张照片…`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PHOTO_UPLOAD_CONCURRENCY, selectedFiles.length) }, () => worker()));
      const successful = uploaded.filter((image): image is { url: string; alt: string } => Boolean(image));
      insertImages(successful);
      if (failed === 0) {
        setNotice(wasLimited ? `已插入前 ${successful.length} 张照片（一次最多 ${MAX_PHOTOS_PER_UPLOAD} 张）。` : `${successful.length} 张照片已插入文章。`);
      } else if (successful.length > 0) {
        setNotice(`已插入 ${successful.length} 张照片，${failed} 张上传失败。`);
      } else {
        setNotice("照片上传失败，请检查网络或 Cloudinary 设置后重试。");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML || "");
  }

  function toggleCommonLabel(label: string) {
    const currentLabels = labels.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    const nextLabels = currentLabels.includes(label)
      ? currentLabels.filter((item) => item !== label)
      : [...currentLabels, label];
    setLabels(nextLabels.join("，"));
  }

  function formatDateInput(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatTimeInput(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function parseScheduledDate(dateValue: string, timeValue: string) {
    if (!dateValue || !timeValue) return null;
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    const scheduled = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (Number.isNaN(scheduled.getTime()) || scheduled.getFullYear() !== year || scheduled.getMonth() !== month - 1 || scheduled.getDate() !== day) return null;
    return scheduled;
  }

  function openSchedulePicker() {
    const suggested = new Date();
    suggested.setSeconds(0, 0);
    setScheduleDraftDate(scheduleDate || formatDateInput(suggested));
    setScheduleDraftTime(scheduleTime || formatTimeInput(suggested));
    setScheduleOpen(true);
  }

  function confirmSchedule() {
    const scheduled = parseScheduledDate(scheduleDraftDate, scheduleDraftTime);
    if (!scheduled) {
      setNotice("请选择完整的日期和时间。");
      return;
    }
    if (scheduled.getTime() > Date.now()) {
      setNotice("日记的发布时间不能晚于当前时间。");
      return;
    }
    setScheduleDate(scheduleDraftDate);
    setScheduleTime(scheduleDraftTime);
    setScheduleOpen(false);
    setNotice(`文章发布时间已设为 ${scheduled.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}。`);
  }

  function clearSchedule() {
    setScheduleDate("");
    setScheduleTime("");
    setScheduleDraftDate("");
    setScheduleDraftTime("");
    setScheduleOpen(false);
    setNotice("已改为使用当前真实时间发布。");
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
    const scheduledFor = !isDraft && !editingPostId ? parseScheduledDate(scheduleDate, scheduleTime) : null;
    if (!isDraft && !editingPostId && (scheduleDate || scheduleTime) && !scheduledFor) {
      setNotice("指定发布时间需要同时选择日期和时间。");
      openSchedulePicker();
      return;
    }
    if (scheduledFor && scheduledFor.getTime() > Date.now()) {
      setNotice("发布时间只能选择当前或过去的时间。");
      openSchedulePicker();
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const postBody = {
        kind: "blogger#post",
        ...(editingPostId ? { id: editingPostId } : {}),
        blog: { id: blogId },
        title: title.trim(),
        content,
        labels: labels.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      };
      let publishedPost: Post;
      if (scheduledFor) {
        const draftResponse = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?isDraft=true`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        });
        if (!draftResponse.ok) throw new Error("无法创建文章，请重新连接 Google 后再试。");
        const draftPost: Post = await draftResponse.json();
        const publishParams = new URLSearchParams({ publishDate: scheduledFor.toISOString() });
        const publishResponse = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${draftPost.id}/publish?${publishParams}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
        if (!publishResponse.ok) {
          cachePosts([{ ...draftPost, status: "draft" }, ...posts.filter((post) => post.id !== draftPost.id)]);
          throw new Error("文章已保存到 Blogger 草稿箱，但发布时间设置失败，请稍后重试。");
        }
        publishedPost = await publishResponse.json();
      } else {
        const query = isDraft ? "?isDraft=true" : "";
        const endpoint = editingPostId
          ? `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${editingPostId}`
          : `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts${query}`;
        const response = await fetch(endpoint, {
          method: editingPostId ? "PUT" : "POST",
          headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        });
        if (!response.ok) throw new Error("发送失败，请重新连接 Google 后再试。");
        publishedPost = await response.json();
      }
      const nextPost = { ...publishedPost, status: isDraft ? "draft" as const : "live" as const };
      cachePosts([nextPost, ...posts.filter((post) => post.id !== publishedPost.id)]);
      if (isDraft) {
        setNotice("已保存到 Blogger 草稿箱。");
      } else {
        localStorage.removeItem(DRAFT_KEY);
        setTitle("");
        setContent("");
        setLabels("");
        setScheduleDate("");
        setScheduleTime("");
        setEditingPostId("");
        setScreen("list");
        setNotice(editingPostId ? "文章修改成功，已回到列表。" : scheduledFor ? `文章已按 ${scheduledFor.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 的时间发布。` : "文章发布成功，已回到文章列表。");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "发送失败。");
    } finally {
      setBusy(false);
    }
  }

  const plainText = content.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  const wordCount = plainText.replace(/\s/g, "").length;
  const today = new Date();
  const anniversaryYears = Array.from({ length: 5 }, (_, index) => today.getFullYear() - index - 1);
  const scheduledDateTime = parseScheduledDate(scheduleDate, scheduleTime);

  return (
    <main className={`app-shell ${screen === "list" ? "list-screen" : "editor-screen"}`}>
      <header className="topbar">
        {screen === "editor" ? (
          <button className="back-button" onClick={() => setScreen("list")} aria-label="返回文章列表">‹</button>
        ) : (
          <div className="brand"><span className="brand-mark">B</span><span>BlogPad</span></div>
        )}
        {screen === "editor" && <strong className="editor-heading">{editingPostId ? "编辑文章" : "写文章"}</strong>}
        <div className="top-actions">
          {screen === "editor" ? <span className="save-state">{savedAt}</span> : (
            <button className={`connection-pill ${connected ? "connected" : ""}`} onClick={connected ? () => Promise.all([loadPosts(tokenRef.current, blogId, activeSearch), loadOnThisDay(tokenRef.current, blogId)]) : connectGoogle} disabled={busy}>
              <span className="connection-dot" />{connected ? "已连接" : "连接 Blogger"}
            </button>
          )}
          {screen === "list" && <button className="blog-button" onClick={openBlog}>进入博客 ↗</button>}
          <button className="icon-button" aria-label="连接设置" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      {screen === "list" ? (
        <section className="post-list-page">
          <div className="list-heading">
            <div><p className="eyebrow">我的博客</p><h1>文章列表</h1></div>
            {posts.length > 0 && <span className="post-count">第 {pageIndex + 1} 页 · {posts.length} 篇</span>}
          </div>

          <form className="post-search" onSubmit={(event) => { event.preventDefault(); searchPosts(searchText); }} role="search">
            <span aria-hidden="true">⌕</span>
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索所有文章" aria-label="搜索所有文章" enterKeyHint="search" />
            {searchText && <button className="clear-search" type="button" onClick={() => { setSearchText(""); if (activeSearch) searchPosts(""); }} aria-label="清除搜索">×</button>}
            <button className="search-button" type="submit" disabled={busy}>搜索</button>
          </form>
          {activeSearch && <p className="search-summary">正在搜索“{activeSearch}”</p>}

          <section className="memories" aria-labelledby="memories-title">
            <div className="memories-heading">
              <div><p className="eyebrow">时光回望</p><h2 id="memories-title">往年今日</h2></div>
              <time>{today.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}</time>
            </div>
            <div className="memory-years">
              {anniversaryYears.map((year) => {
                const memories = onThisDayPosts[year] || [];
                return (
                  <div className="memory-row" key={year}>
                    <strong>{year}</strong>
                    <div className="memory-posts">
                      {memories.map((post) => post.url ? (
                        <a key={post.id} href={post.url} target="_blank" rel="noreferrer">{post.title || "未命名文章"}<span>↗</span></a>
                      ) : <span key={post.id}>{post.title || "未命名文章"}</span>)}
                      {memories.length === 0 && <span className="memory-empty" aria-label={`${year} 年今日没有日记`}>&nbsp;</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {posts.length > 0 ? (
            <div className="post-list">
              {posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <div className="post-card-main">
                    <div className="post-meta">
                      <span className={`status-badge ${post.status === "draft" ? "draft" : post.status === "scheduled" ? "scheduled" : ""}`}>{post.status === "draft" ? "草稿" : post.status === "scheduled" ? "定时" : "已发布"}</span>
                      <time>{new Date(post.published || post.updated || Date.now()).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" })}</time>
                    </div>
                    <h2>{post.title || "未命名文章"}</h2>
                    {!!post.labels?.length && <div className="card-labels">{post.labels.slice(0, 3).map((label) => <span key={label}>{label}</span>)}</div>}
                  </div>
                  <div className="post-actions">
                    <button className="edit-post-button" onClick={() => editArticle(post)} disabled={busy} aria-label={`编辑文章：${post.title}`}>✎</button>
                    {post.url ? <a href={post.url} target="_blank" rel="noreferrer" aria-label={`打开文章：${post.title}`}>↗</a> : <span />}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-paper"><span>文</span></div>
              <h2>{activeSearch ? "没有找到文章" : "文章会出现在这里"}</h2>
              <p>{activeSearch ? `没有包含“${activeSearch}”的文章。` : connected ? "点击右下角的笔，开始写第一篇文章。" : "连接 Blogger 后同步已有文章，也可以直接开始写作。"}</p>
              {!connected && <button className="inline-connect" onClick={connectGoogle}>连接 Blogger</button>}
            </div>
          )}

          {(pageIndex > 0 || nextPageToken) && (
            <nav className="pagination" aria-label="文章翻页">
              <button onClick={() => changePage("previous")} disabled={busy || pageIndex === 0}>← 上一页</button>
              <span>第 {pageIndex + 1} 页</span>
              <button onClick={() => changePage("next")} disabled={busy || !nextPageToken}>下一页 →</button>
            </nav>
          )}

          {title || content ? <button className="draft-banner" onClick={startWriting}><span>本机草稿</span><strong>{title || "未命名草稿"}</strong><b>继续写 →</b></button> : null}
          <button className="compose-fab" onClick={title || content ? startWriting : newArticle} aria-label="开始写新文章"><span>✎</span></button>
        </section>
      ) : (
        <>
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
                  <button className="image-tool" onClick={() => { rememberSelection(); fileInputRef.current?.click(); }} disabled={uploading} aria-label={`从手机插入照片，一次最多 ${MAX_PHOTOS_PER_UPLOAD} 张`} title={`一次最多添加 ${MAX_PHOTOS_PER_UPLOAD} 张照片`}>{uploading ? "上传中…" : "▧ 照片"}</button>
                  <input ref={fileInputRef} className="file-input" type="file" accept="image/*" multiple onChange={(event) => uploadImages(Array.from(event.target.files || []))} />
                </div>
                <div ref={editorRef} className="editor" contentEditable suppressContentEditableWarning data-placeholder="从这里开始写……" onInput={(event) => setContent(event.currentTarget.innerHTML)} />
                <div className="meta-row">
                  <div className="label-editor">
                    <div className="quick-labels" aria-label="常用标签">
                      {COMMON_LABELS.map((label) => {
                        const selected = labels.split(/[,，]/).map((item) => item.trim()).includes(label);
                        return <button type="button" key={label} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleCommonLabel(label)}>#{label}</button>;
                      })}
                    </div>
                    <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="也可以输入其他标签（用逗号分隔）" aria-label="文章标签" />
                  </div>
                  <span className="word-count">{wordCount} 字</span>
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
          <footer className={`publish-bar ${editingPostId ? "" : "has-schedule"}`}>
            {editingPostId ? (
              <button className="secondary" disabled={busy} onClick={() => { setEditingPostId(""); setScreen("list"); }}>取消编辑</button>
            ) : (
              <>
                <button className="secondary" disabled={busy} onClick={() => sendToBlogger(true)}>存草稿</button>
                <button className={`schedule-button ${scheduledDateTime ? "scheduled" : ""}`} disabled={busy} onClick={openSchedulePicker} aria-label={scheduledDateTime ? `文章发布时间为 ${scheduledDateTime.toLocaleString("zh-CN")}，点击修改` : "设定发布时间"}>{scheduledDateTime ? `${scheduledDateTime.getMonth() + 1}/${scheduledDateTime.getDate()} ${scheduleTime}` : "▣ 发布时间"}</button>
              </>
            )}
            <button className="primary" disabled={busy || uploading} onClick={() => sendToBlogger(false)}>{busy ? "处理中…" : editingPostId ? "更新文章" : scheduledDateTime ? "按此时间发布" : "发布文章"}</button>
          </footer>
        </>
      )}

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

      {scheduleOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setScheduleOpen(false)}>
          <section className="schedule-sheet" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="schedule-title">
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div><p className="eyebrow">补写日记</p><h2 id="schedule-title">选择文章的发布时间</h2></div>
              <button className="close-button" onClick={() => setScheduleOpen(false)} aria-label="关闭">×</button>
            </div>
            <p className="schedule-copy">适合补写过去的日记。请选择今天或过去的日期和时间；不设置时使用真实的当前时间。</p>
            <div className="schedule-fields">
              <label>选择日期<input type="date" max={formatDateInput(new Date())} value={scheduleDraftDate} onChange={(event) => setScheduleDraftDate(event.target.value)} /></label>
              <label>选择时间<input type="time" step="60" value={scheduleDraftTime} onChange={(event) => setScheduleDraftTime(event.target.value)} /></label>
            </div>
            <div className="schedule-actions">
              <button className="secondary" onClick={clearSchedule}>使用当前时间</button>
              <button className="primary" onClick={confirmSchedule}>确定发布时间</button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-sheet" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="settings-title">
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div><p className="eyebrow">BLOGGER 连接</p><h2 id="settings-title">连接你的 Google 博客</h2></div>
              <button className="close-button" onClick={() => setSettingsOpen(false)} aria-label="关闭">×</button>
            </div>
            <p className="sheet-copy">OAuth 客户端 ID 只保存在这台设备上；访问令牌不会保存。连接后会同步文章列表。</p>
            <label className="field-label">Google OAuth 客户端 ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="123456…apps.googleusercontent.com" inputMode="text" /></label>
            {blogs.length > 0 && <label className="field-label">选择博客<select value={blogId} onChange={async (event) => { const selected = event.target.value; const selectedUrl = blogs.find((blog) => blog.id === selected)?.url || ""; setBlogId(selected); setBlogUrl(selectedUrl); saveConfig({ blogId: selected, blogUrl: selectedUrl }); if (tokenRef.current) await Promise.all([loadPosts(tokenRef.current, selected), loadOnThisDay(tokenRef.current, selected)]); }}>{blogs.map((blog) => <option key={blog.id} value={blog.id}>{blog.name}</option>)}</select></label>}
            <button className="google-button" onClick={connectGoogle} disabled={busy}><span className="google-g">G</span>{connected ? "重新连接 Google" : "连接 Google 并同步文章"}</button>
            <a className="help-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">前往 Google Cloud 设置 →</a>
            <div className="settings-divider" />
            <p className="eyebrow">照片上传</p>
            <h3 className="settings-subtitle">连接 Cloudinary</h3>
            <p className="sheet-copy">填写一次后，手机照片会先压缩，再上传并插入文章。请使用 Unsigned Upload Preset，不要填写 API Secret。</p>
            <label className="field-label">Cloud Name<input value={cloudName} onChange={(event) => setCloudName(event.target.value)} placeholder="例如：my-cloud" /></label>
            <label className="field-label">Unsigned Upload Preset<input value={uploadPreset} onChange={(event) => setUploadPreset(event.target.value)} placeholder="例如：blogpad_unsigned" /></label>
            <button className="cloud-save-button" onClick={() => { saveConfig(); setNotice("照片上传设置已保存在本机。"); }}>保存照片上传设置</button>
            <a className="help-link" href="https://console.cloudinary.com/settings/upload/presets" target="_blank" rel="noreferrer">前往 Cloudinary 创建 Upload Preset →</a>
          </section>
        </div>
      )}
    </main>
  );
}
