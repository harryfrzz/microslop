import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, ChevronDown, House, MessageSquare, MonitorPlay, MonitorStop, PanelLeft, Paperclip, Plug, Settings as SettingsIcon, SquarePen, Terminal, Trash2 } from 'lucide-react';
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
type LogLevel = 'info' | 'error';
type LogEntry = { time: string; level: LogLevel; text: string };

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

const SEARCH_MODE = 'hybrid';
const SEARCH_FILTERS = { dateFrom: null, dateTo: null, appName: '', windowTitle: '' };

const NAV = [
  { id: 'dashboard', label: 'Home', Icon: House },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
] as const;

const fileUrl = (path?: string) => (path ? `file://${path}` : undefined);
const prettyBytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const prettyTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'Never');

function App() {
  const [page, setPage] = useState<'dashboard' | 'settings'>('dashboard');
  const [status, setStatus] = useState<Status | null>(null);
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsOpen, setLogsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const backendOk = useRef<boolean | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];

  const log = (text: string, level: LogLevel = 'info') => {
    setLogs((current) => [...current, { time: new Date().toLocaleTimeString(), level, text }].slice(-400));
  };

  const refresh = async () => {
    try {
      const [nextStatus, nextSettings] = await Promise.all([getStatus(), getSettings()]);
      setStatus(nextStatus);
      setSettings((current) => ({ ...current, ...nextSettings }));
      if (backendOk.current !== true) log('Backend connected on 127.0.0.1:8765');
      backendOk.current = true;
    } catch {
      if (backendOk.current !== false) log('Backend unreachable. Start it: uvicorn main:app --host 127.0.0.1 --port 8765 --reload', 'error');
      backendOk.current = false;
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

  useEffect(() => {
    if (logsOpen) logBodyRef.current?.scrollTo({ top: logBodyRef.current.scrollHeight });
  }, [logs, logsOpen]);

  const startCapture = async () => {
    await resumeCapture().catch((): null => null);
    const result = await window.microslop?.startCapture();
    setSettings((current) => ({ ...current, captureEnabled: Boolean(result?.captureEnabled) }));
    log(`Capture started (every ${result?.captureIntervalSeconds ?? settings.captureIntervalSeconds}s)`);
    void refresh();
  };

  const pause = async () => {
    await window.microslop?.pauseCapture();
    await pauseCapture().catch((): null => null);
    setSettings((current) => ({ ...current, captureEnabled: false }));
    log('Capture paused');
  };

  const captureNow = async () => {
    try {
      const result = await window.microslop?.captureNow();
      log(`Manual capture: ${JSON.stringify(result)}`);
      void refresh();
    } catch (error) {
      log(`Capture failed. Check screen recording permission. ${String(error)}`, 'error');
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
    log(`Search: "${question}"`);
    try {
      const response = await searchMemories(question, SEARCH_FILTERS, SEARCH_MODE);
      log(`Retrieved ${response.results.length} memories`);
      let content = 'No matching memories found.';
      if (response.results.length) {
        const generated = await generateAnswer(question, response.results.map((result) => result.snapshotId));
        content = generated.status === 'ok' ? generated.answer : generated.error || 'Answer generation failed.';
        log(generated.status === 'ok' ? `Answer generated (${settings.cerebrasModel})` : `Answer failed: ${generated.error || 'unknown error'}`, generated.status === 'ok' ? 'info' : 'error');
      }
      appendMessage(chatId, { role: 'assistant', content, results: response.results });
    } catch (error) {
      log(`Request failed. ${String(error)}`, 'error');
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
    log(`Model set to ${model}`);
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
    log('Settings saved');
  };

  const confirmDelete = async (label: string, action: () => Promise<{ deleted: number }>) => {
    if (!window.confirm(`${label}? This deletes local memories, screenshots, thumbnails, and vectors.`)) return;
    const result = await action();
    log(`${label}: deleted ${result.deleted} memories`);
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

          <button className="history-new" onClick={newChat} title="New chat"><SquarePen size={18} /> <span>New chat</span></button>

          <button className={`record-btn${settings.captureEnabled ? ' recording' : ''}`} onClick={toggleRecording} title={settings.captureEnabled ? 'Stop recording' : 'Start recording'}>
            {settings.captureEnabled ? <MonitorStop size={18} /> : <MonitorPlay size={18} />}
            <span>{settings.captureEnabled ? 'Stop recording' : 'Start recording'}</span>
          </button>

          <nav className="nav-items">
            {NAV.map(({ id, label, Icon }) => (
              <button key={id} className={page === id ? 'nav active' : 'nav'} onClick={() => { setPage(id); setSidebarOpen(false); }} title={label}>
                <Icon size={18} strokeWidth={2} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

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

        {page === 'settings' && (
          <section className="settings">
            <div className="settings-wrap">
              <header className="settings-top">
                <h2>Settings</h2>
                <div className="settings-top-actions">
                  <button className="ghost" onClick={() => window.microslop?.openDataFolder()}>Open data folder</button>
                  <button onClick={saveSettings}>Save</button>
                </div>
              </header>

              <section className="settings-card">
                <h3>Status</h3>
                <div className="settings-rows">
                  <div className="srow"><span>Capture</span><span className="srow-val">{settings.captureEnabled ? 'Running' : 'Paused'}</span></div>
                  <div className="srow"><span>Snapshots today</span><span className="srow-val">{status?.captureStats.snapshotsToday || 0}</span></div>
                  <div className="srow"><span>Last capture</span><span className="srow-val">{prettyTime(status?.captureStats.lastCapturedAt)}</span></div>
                  <div className="srow"><span>Storage used</span><span className="srow-val">{prettyBytes(status?.captureStats.storageUsedBytes)}</span></div>
                </div>
                <div className="settings-actions">
                  <button onClick={startCapture}>Start capture</button>
                  <button className="secondary" onClick={pause}>Pause</button>
                  <button className="secondary" onClick={captureNow}>Capture now</button>
                </div>
              </section>

              <section className="settings-card">
                <h3>Capture</h3>
                <div className="settings-rows">
                  <label className="srow"><span>Capture interval (seconds)</span><input type="number" value={settings.captureIntervalSeconds} onChange={(e) => setSettings({ ...settings, captureIntervalSeconds: Number(e.target.value) })} /></label>
                  <label className="srow"><span>Retention (days)</span><input type="number" value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })} /></label>
                  <label className="srow toggle"><span>Enable OCR</span><input type="checkbox" checked={settings.enableOCR} onChange={(e) => setSettings({ ...settings, enableOCR: e.target.checked })} /></label>
                  <label className="srow toggle"><span>Enable image embeddings</span><input type="checkbox" checked={settings.enableImageEmbeddings} onChange={(e) => setSettings({ ...settings, enableImageEmbeddings: e.target.checked })} /></label>
                </div>
              </section>

              <section className="settings-card">
                <h3>Models</h3>
                <div className="settings-rows">
                  <label className="srow"><span>Cerebras model</span><input value={settings.cerebrasModel} onChange={(e) => setSettings({ ...settings, cerebrasModel: e.target.value })} /></label>
                  <label className="srow"><span>Text embedding model</span><input value={settings.textEmbeddingModel} onChange={(e) => setSettings({ ...settings, textEmbeddingModel: e.target.value })} /></label>
                  <label className="srow"><span>Image embedding model</span><input value={settings.imageEmbeddingModel} onChange={(e) => setSettings({ ...settings, imageEmbeddingModel: e.target.value })} /></label>
                </div>
              </section>

              <section className="settings-card">
                <h3>Exclusions</h3>
                <p className="settings-hint">Apps and window-title keywords to skip while capturing. One per line.</p>
                <label className="sfield"><span>Excluded apps</span><textarea value={settings.excludedApps.join('\n')} onChange={(e) => setSettings({ ...settings, excludedApps: e.target.value.split('\n') })} /></label>
                <label className="sfield"><span>Excluded window title patterns</span><textarea value={settings.excludedWindowTitlePatterns.join('\n')} onChange={(e) => setSettings({ ...settings, excludedWindowTitlePatterns: e.target.value.split('\n') })} /></label>
              </section>

              <section className="settings-card">
                <h3>Connection</h3>
                <div className="settings-rows">
                  <label className="srow"><span>Backend URL</span><input value={settings.backendUrl} readOnly /></label>
                  <div className="srow"><span>Storage path</span><span className="srow-val mono">{settings.storagePath || 'app-data'}</span></div>
                </div>
              </section>

              <section className="settings-card">
                <h3>Privacy &amp; data</h3>
                <p className="settings-hint">Capture, OCR, embeddings, and vectors stay local. Answer generation sends the question and retrieved OCR text to the Cerebras API.</p>
                <div className="danger-zone">
                  <button onClick={() => confirmDelete('Delete last 15 minutes', deleteLast15Minutes)}>Delete last 15 minutes</button>
                  <button onClick={() => confirmDelete('Delete last hour', deleteLastHour)}>Delete last hour</button>
                  <button onClick={() => confirmDelete('Delete today', deleteToday)}>Delete today</button>
                  <button className="danger" onClick={() => confirmDelete('Delete all data', deleteAllData)}>Delete all data</button>
                </div>
              </section>

              <section className={`settings-card logs-card${logsOpen ? ' open' : ''}`}>
                <button className="logs-head" onClick={() => setLogsOpen((value) => !value)}>
                  <span className="logs-title"><Terminal size={14} /> Logs <span className="logs-count">{logs.length}</span></span>
                  <span className="logs-actions">
                    {logs.length > 0 && <span className="logs-clear" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setLogs([]); }}>clear</span>}
                    <ChevronDown size={16} className="logs-chevron" />
                  </span>
                </button>
                {logsOpen && (
                  <div className="logs-body" ref={logBodyRef}>
                    {logs.length === 0 && <div className="log-empty">No activity yet.</div>}
                    {logs.map((entry, index) => (
                      <div className={`log-line ${entry.level}`} key={index}>
                        <span className="log-time">{entry.time}</span>
                        <span className="log-text">{entry.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}
      </section>

      {preview && <div className="modal" onClick={() => setPreview(null)}><img src={fileUrl(preview.screenshotPath)} /></div>}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
