import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, House, MessageSquare, MonitorPlay, MonitorStop, PanelLeft, Paperclip, Plug, Search, Settings as SettingsIcon, Shield, SquarePen, Trash2 } from 'lucide-react';
import './index.css';
import {
  deleteAllData,
  deleteLast15Minutes,
  deleteLastHour,
  deleteToday,
  generateAnswer,
  getSettings,
  getStatus,
  pauseCapture,
  resumeCapture,
  searchMemories,
  updateSettings,
} from './renderer/lib/api';
import type { SearchResult, Settings, Status } from './renderer/types';

type ChatMessage = { role: 'user' | 'assistant'; content: string; results?: SearchResult[] };
type Chat = { id: string; title: string; messages: ChatMessage[] };

const blankSettings: Settings = {
  captureEnabled: false,
  captureIntervalSeconds: 5,
  retentionDays: 30,
  backendUrl: 'http://127.0.0.1:8765',
  cerebrasModel: 'llama-3.3-70b',
  textEmbeddingModel: 'BAAI/bge-small-en-v1.5',
  imageEmbeddingModel: 'sentence-transformers/clip-ViT-B-32',
  enableOCR: true,
  enableImageEmbeddings: true,
  excludedApps: [],
  excludedWindowTitlePatterns: [],
};

const MODEL_OPTIONS = ['llama-3.3-70b', 'llama3.1-8b', 'llama-4-scout-17b-16e-instruct', 'qwen-3-32b'];

const NAV = [
  { id: 'dashboard', label: 'Home', Icon: House },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  { id: 'privacy', label: 'Privacy', Icon: Shield },
] as const;

const fileUrl = (path?: string) => (path ? `file://${path}` : undefined);
const prettyBytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const prettyTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'Never');

function Pill({ label, value }: { label: string; value: string }) {
  return <span className={`pill ${value === 'ok' ? 'ok' : 'bad'}`}>{label}: {value}</span>;
}

function App() {
  const [page, setPage] = useState<'dashboard' | 'search' | 'settings' | 'privacy'>('dashboard');
  const [status, setStatus] = useState<Status | null>(null);
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [backendError, setBackendError] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('hybrid');
  const [filters, setFilters] = useState({ dateFrom: null, dateTo: null, appName: '', windowTitle: '' });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];

  const refresh = async () => {
    try {
      const [nextStatus, nextSettings] = await Promise.all([getStatus(), getSettings()]);
      setStatus(nextStatus);
      setSettings((current) => ({ ...current, ...nextSettings }));
      setBackendError('');
    } catch {
      setBackendError('FastAPI backend is not running. Start it with `uvicorn main:app --host 127.0.0.1 --port 8765 --reload`.');
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval((): void => void refresh(), 6000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight });
  }, [messages, sending]);

  const startCapture = async () => {
    await resumeCapture().catch((): null => null);
    const result = await window.microslop?.startCapture();
    setSettings((current) => ({ ...current, captureEnabled: Boolean(result?.captureEnabled) }));
    setMessage('Capture loop started. Screenshots stay local and are indexed by the backend.');
    void refresh();
  };

  const pause = async () => {
    await window.microslop?.pauseCapture();
    await pauseCapture().catch((): null => null);
    setSettings((current) => ({ ...current, captureEnabled: false }));
    setMessage('Capture paused.');
  };

  const captureNow = async () => {
    try {
      const result = await window.microslop?.captureNow();
      setMessage(`Manual capture result: ${JSON.stringify(result)}`);
      void refresh();
    } catch (error) {
      setMessage(`Capture failed. Check screen recording permission. ${String(error)}`);
    }
  };

  const runSearch = async () => {
    setAnswer('');
    const response = await searchMemories(query, filters, mode);
    setResults(response.results);
    if (response.results.length) {
      const generated = await generateAnswer(query, response.results.map((result) => result.snapshotId));
      setAnswer(generated.status === 'ok' ? generated.answer : generated.error || 'Answer generation failed. Search results are still shown.');
    }
  };

  const appendMessage = (chatId: string, entry: ChatMessage) => {
    setChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, messages: [...chat.messages, entry] } : chat)));
  };

  const sendMessage = async () => {
    const question = query.trim();
    if (!question || sending) return;
    setQuery('');
    setMcpOpen(false);

    let chatId = activeChatId;
    const userEntry: ChatMessage = { role: 'user', content: question };
    if (!chatId) {
      chatId = `${Date.now()}`;
      const title = question.length > 40 ? `${question.slice(0, 40)}…` : question;
      setChats((current) => [{ id: chatId as string, title, messages: [userEntry] }, ...current]);
      setActiveChatId(chatId);
    } else {
      appendMessage(chatId, userEntry);
    }

    setSending(true);
    try {
      const response = await searchMemories(question, filters, mode);
      let content = 'No matching memories found.';
      if (response.results.length) {
        const generated = await generateAnswer(question, response.results.map((result) => result.snapshotId));
        content = generated.status === 'ok' ? generated.answer : generated.error || 'Answer generation failed.';
      }
      appendMessage(chatId, { role: 'assistant', content, results: response.results });
    } catch (error) {
      appendMessage(chatId, { role: 'assistant', content: `Request failed. ${String(error)}` });
    } finally {
      setSending(false);
    }
  };

  const toggleRecording = () => {
    if (settings.captureEnabled) void pause();
    else void startCapture();
  };

  const newChat = () => {
    setActiveChatId(null);
    setQuery('');
    setMcpOpen(false);
    setSidebarOpen(false);
    setPage('dashboard');
  };

  const selectChat = (id: string) => {
    setActiveChatId(id);
    setSidebarOpen(false);
    setPage('dashboard');
  };

  const deleteChat = (id: string) => {
    setChats((current) => current.filter((chat) => chat.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const changeModel = (model: string) => {
    setSettings((current) => ({ ...current, cerebrasModel: model }));
    void updateSettings({ ...settings, cerebrasModel: model }).catch((): null => null);
  };

  const onAttach = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length) setAttachments((current) => [...current, ...files]);
    event.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  };

  const saveSettings = async () => {
    const updated = await updateSettings(settings);
    setSettings(updated);
    setMessage('Settings saved. Set CEREBRAS_API_KEY in the backend environment to enable answers.');
  };

  const confirmDelete = async (label: string, action: () => Promise<{ deleted: number }>) => {
    if (!window.confirm(`${label}? This deletes local memories, screenshots, thumbnails, and vectors.`)) return;
    const result = await action();
    setMessage(`Deleted ${result.deleted} memories.`);
    void refresh();
  };

  const renderComposer = () => (
    <div className="composer">
      <textarea
        className="composer-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
          }
        }}
        placeholder="Ask your screen history…"
      />
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((file, index) => (
            <span className="attachment" key={`${file.name}-${index}`}>
              {file.name}
              <button className="attachment-x" onClick={() => removeAttachment(index)} aria-label="Remove attachment">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-bar">
        <div className="composer-left">
          <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach files"><Paperclip size={18} /></button>
          <button className={mcpOpen ? 'icon-btn active' : 'icon-btn'} onClick={() => setMcpOpen((value) => !value)} title="MCP servers"><Plug size={18} /></button>
          <select className="model-select" value={settings.cerebrasModel} onChange={(event) => changeModel(event.target.value)}>
            {(MODEL_OPTIONS.includes(settings.cerebrasModel) ? MODEL_OPTIONS : [settings.cerebrasModel, ...MODEL_OPTIONS]).map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
        <button className="send-btn" onClick={sendMessage} disabled={!query.trim() || sending} aria-label="Send"><ArrowUp size={18} /></button>
      </div>
      {mcpOpen && (
        <div className="mcp-panel">
          <div className="mcp-head"><Plug size={14} /> MCP servers</div>
          <p>No MCP servers configured. Connect a server to give answers extra tools and context.</p>
        </div>
      )}
      <input ref={fileInputRef} type="file" multiple hidden onChange={onAttach} />
    </div>
  );

  return (
    <main className="app-shell">
      <div className="titlebar-drag" />
      <button className={`float-round menu-toggle${collapsed ? ' show' : ''}`} onClick={() => { setCollapsed(false); setSidebarOpen(true); }} title="Open sidebar" aria-label="Open sidebar">
        <PanelLeft size={18} />
      </button>

      <button className={`float-round new-toggle${collapsed ? ' show' : ''}`} onClick={newChat} title="New chat" aria-label="New chat">
        <SquarePen size={18} />
      </button>

      <button className={`float-round rec-toggle${collapsed ? ' show' : ''}${settings.captureEnabled ? ' recording' : ''}`} onClick={toggleRecording} title={settings.captureEnabled ? 'Stop recording' : 'Start recording'} aria-label="Toggle screen recording">
        {settings.captureEnabled ? <MonitorStop size={18} /> : <MonitorPlay size={18} />}
      </button>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-inner">
          <div className="sidebar-head">
            <div className="brand"><span>microslop</span></div>
            <button className="collapse-btn" onClick={() => { setCollapsed(true); setSidebarOpen(false); }} title="Hide sidebar" aria-label="Hide sidebar">
              <PanelLeft size={18} />
            </button>
          </div>

          <nav className="nav-items">
            {NAV.map(({ id, label, Icon }) => (
              <button key={id} className={page === id ? 'nav active' : 'nav'} onClick={() => { setPage(id); setSidebarOpen(false); }} title={label}>
                <Icon size={18} strokeWidth={2} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <button className="history-new" onClick={newChat} title="New chat"><SquarePen size={16} /> <span>New chat</span></button>

          <button className={`record-btn${settings.captureEnabled ? ' recording' : ''}`} onClick={toggleRecording} title={settings.captureEnabled ? 'Stop recording' : 'Start recording'}>
            {settings.captureEnabled ? <MonitorStop size={16} /> : <MonitorPlay size={16} />}
            <span>{settings.captureEnabled ? 'Stop recording' : 'Start recording'}</span>
          </button>

          <div className="history-list">
            {chats.length === 0 && <p className="history-empty">No chats yet.</p>}
            {chats.map((chat) => (
              <div className={chat.id === activeChatId ? 'history-item active' : 'history-item'} key={chat.id}>
                <button className="history-pick" onClick={() => selectChat(chat.id)}>
                  <MessageSquare size={15} />
                  <span>{chat.title}</span>
                </button>
                <button className="history-del" onClick={() => deleteChat(chat.id)} title="Delete chat" aria-label="Delete chat"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="content">
        {message && <div className="banner">{message}</div>}

        {page === 'dashboard' && messages.length === 0 && (
          <section className="home">
            <div className="composer-wrap">
              <h1 className="home-brand">microslop</h1>
              {renderComposer()}
            </div>
          </section>
        )}

        {page === 'dashboard' && messages.length > 0 && (
          <section className="chat">
            <div className="chat-title">{activeChat?.title}</div>
            <div className="chat-log" ref={chatLogRef}>
              {messages.map((entry, index) => (
                <div className={`msg ${entry.role}`} key={index}>
                  <div className="msg-body">{entry.content}</div>
                  {entry.results && entry.results.length > 0 && (
                    <div className="citations">
                      {entry.results.slice(0, 6).map((result) => (
                        <button className="citation" key={result.snapshotId} onClick={() => setPreview(result)} title={`${result.appName || 'Unknown'} · ${prettyTime(result.timestamp)}`}>
                          {result.thumbnailPath
                            ? <img src={fileUrl(result.thumbnailPath)} alt="" />
                            : <span className="citation-text">{result.appName || 'memory'}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {sending && <div className="msg assistant"><div className="msg-body typing">Thinking…</div></div>}
            </div>
            <div className="chat-composer">{renderComposer()}</div>
          </section>
        )}

        {page === 'search' && (
          <section className="panel">
            <h2>Search</h2>
            <div className="searchbar">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="what was I reading earlier?" />
              <select value={mode} onChange={(event) => setMode(event.target.value)}><option>text</option><option>visual</option><option>hybrid</option></select>
              <button onClick={runSearch} disabled={!query}>Search</button>
            </div>
            <div className="filters">
              <input placeholder="App name" value={filters.appName} onChange={(e) => setFilters({ ...filters, appName: e.target.value })} />
              <input placeholder="Window title" value={filters.windowTitle} onChange={(e) => setFilters({ ...filters, windowTitle: e.target.value })} />
            </div>
            {answer && <article className="answer"><h3>Answer</h3><p>{answer}</p></article>}
            <div className="results">
              {results.map((result) => (
                <article className="result" key={result.snapshotId}>
                  {result.thumbnailPath && <img src={fileUrl(result.thumbnailPath)} />}
                  <div><strong>{prettyTime(result.timestamp)}</strong><p>{result.appName || 'Unknown app'} / {result.windowTitle || 'Untitled'}</p><p>{result.ocrSnippet}</p><span>{result.matchType} score {result.score}</span></div>
                  <button className="ghost" onClick={() => setPreview(result)}>Preview</button>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'settings' && (
          <section className="panel form-panel">
            <h2>Settings</h2>
            {backendError && <div className="banner bad settings-error">{backendError}</div>}
            <div className="status-card settings-status">
              <div className="pills">
                <Pill label="SQLite" value={status?.sqlite || 'unknown'} />
                <Pill label="LanceDB" value={status?.lancedb || 'unknown'} />
                <Pill label="Cerebras" value={status?.llm || 'unknown'} />
                <Pill label="OCR" value={status?.ocr || 'unknown'} />
              </div>
              <dl>
                <dt>Capture</dt><dd>{settings.captureEnabled ? 'Running' : 'Paused'}</dd>
                <dt>Today</dt><dd>{status?.captureStats.snapshotsToday || 0} snapshots</dd>
                <dt>Last capture</dt><dd>{prettyTime(status?.captureStats.lastCapturedAt)}</dd>
                <dt>Storage</dt><dd>{prettyBytes(status?.captureStats.storageUsedBytes)}</dd>
              </dl>
              <div className="actions">
                <button onClick={startCapture}>Start capture</button>
                <button className="secondary" onClick={pause}>Pause capture</button>
                <button className="secondary" onClick={captureNow}>Capture now</button>
              </div>
            </div>
            <label>Capture interval seconds<input type="number" value={settings.captureIntervalSeconds} onChange={(e) => setSettings({ ...settings, captureIntervalSeconds: Number(e.target.value) })} /></label>
            <label>Retention days<input type="number" value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })} /></label>
            <label>Backend URL<input value={settings.backendUrl} readOnly /></label>
            <label>Cerebras model<input value={settings.cerebrasModel} onChange={(e) => setSettings({ ...settings, cerebrasModel: e.target.value })} /></label>
            <label>Text embedding model<input value={settings.textEmbeddingModel} onChange={(e) => setSettings({ ...settings, textEmbeddingModel: e.target.value })} /></label>
            <label>Image embedding model<input value={settings.imageEmbeddingModel} onChange={(e) => setSettings({ ...settings, imageEmbeddingModel: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={settings.enableOCR} onChange={(e) => setSettings({ ...settings, enableOCR: e.target.checked })} /> Enable OCR</label>
            <label className="check"><input type="checkbox" checked={settings.enableImageEmbeddings} onChange={(e) => setSettings({ ...settings, enableImageEmbeddings: e.target.checked })} /> Enable image embeddings</label>
            <label>Excluded apps<textarea value={settings.excludedApps.join('\n')} onChange={(e) => setSettings({ ...settings, excludedApps: e.target.value.split('\n') })} /></label>
            <label>Excluded window title patterns<textarea value={settings.excludedWindowTitlePatterns.join('\n')} onChange={(e) => setSettings({ ...settings, excludedWindowTitlePatterns: e.target.value.split('\n') })} /></label>
            <p>Storage: {settings.storagePath}</p>
            <div className="actions"><button onClick={saveSettings}>Save settings</button><button className="ghost" onClick={() => window.microslop?.openDataFolder()}>Open data folder</button></div>
          </section>
        )}

        {page === 'privacy' && (
          <section className="panel privacy-panel">
            <h2>Privacy</h2>
            <p>Everything stays local in {settings.storagePath || 'app-data'}. Screenshots, OCR text, vectors, and metadata are never sent to cloud APIs.</p>
            <div className="actions"><button onClick={pause}>Pause capture</button><button className="secondary" onClick={startCapture}>Resume capture</button></div>
            <div className="danger-zone">
              <button onClick={() => confirmDelete('Delete last 15 minutes', deleteLast15Minutes)}>Delete last 15 minutes</button>
              <button onClick={() => confirmDelete('Delete last hour', deleteLastHour)}>Delete last hour</button>
              <button onClick={() => confirmDelete('Delete today', deleteToday)}>Delete today</button>
              <button className="danger" onClick={() => confirmDelete('Delete all data', deleteAllData)}>Delete all data</button>
            </div>
          </section>
        )}
      </section>

      {preview && <div className="modal" onClick={() => setPreview(null)}><img src={fileUrl(preview.screenshotPath)} /></div>}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
