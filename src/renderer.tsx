import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, Calendar, Check, ChevronDown, Database, Download, FolderGit2, HardDrive, House, LogIn, Mail, MessageSquare, Minus, MonitorPlay, MonitorStop, NotebookText, PanelLeft, Paperclip, Plug, Plus, Settings as SettingsIcon, SquareKanban, SquarePen, Terminal, Trash2, User } from 'lucide-react';
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
type Connector = { id: string; name: string; description: string; Icon: typeof Plug };

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
const TEXT_EMBED_OPTIONS = ['BAAI/bge-small-en-v1.5', 'BAAI/bge-base-en-v1.5', 'sentence-transformers/all-MiniLM-L6-v2', 'nomic-ai/nomic-embed-text-v1.5'];
const IMAGE_EMBED_OPTIONS = ['sentence-transformers/clip-ViT-B-32', 'sentence-transformers/clip-ViT-L-14', 'openai/clip-vit-base-patch32'];

const CONNECTORS: Connector[] = [
  { id: 'notion', name: 'Notion', description: 'Search pages and databases from your workspace.', Icon: NotebookText },
  { id: 'slack', name: 'Slack', description: 'Pull messages and threads from your channels.', Icon: MessageSquare },
  { id: 'github', name: 'GitHub', description: 'Read issues, PRs, and repository files.', Icon: FolderGit2 },
  { id: 'gdrive', name: 'Google Drive', description: 'Search documents and files in your Drive.', Icon: HardDrive },
  { id: 'gmail', name: 'Gmail', description: 'Look up emails and threads from your inbox.', Icon: Mail },
  { id: 'gcal', name: 'Google Calendar', description: 'Reference events and meeting details.', Icon: Calendar },
  { id: 'linear', name: 'Linear', description: 'Fetch issues, projects, and cycles.', Icon: SquareKanban },
  { id: 'postgres', name: 'Postgres', description: 'Query a connected database for context.', Icon: Database },
];

const SEARCH_MODE = 'hybrid';
const SEARCH_FILTERS = { dateFrom: null, dateTo: null, appName: '', windowTitle: '' };

const NAV = [
  { id: 'dashboard', label: 'Home', Icon: House },
  { id: 'mcps', label: 'MCP', Icon: Plug },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
] as const;

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'logs', label: 'Logs' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

const fileUrl = (path?: string) => (path ? `file://${path}` : undefined);
const prettyBytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const prettyTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'Never');

type ModelSelectProps = {
  value: string;
  options: string[];
  downloaded: string[];
  downloading: string[];
  onChange: (model: string) => void;
  onAdd: (model: string) => void;
  onDownload: (model: string) => void;
};

function ModelSelect({ value, options, downloaded, downloading, onChange, onAdd, onDownload }: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const commit = (action: (model: string) => void) => {
    const id = draft.trim();
    if (!id) return;
    action(id);
    onChange(id);
    setDraft('');
  };

  return (
    <div className={open ? 'model-dd open' : 'model-dd'} ref={ref}>
      <button type="button" className="model-dd-trigger" onClick={() => setOpen((value) => !value)}>
        <span className="model-dd-value">{value || 'Select a model'}</span>
        <ChevronDown size={16} className="model-dd-caret" />
      </button>
      {open && (
        <div className="model-dd-menu">
          <div className="model-dd-list">
            {options.map((option) => (
              <button type="button" key={option} className={option === value ? 'model-dd-opt active' : 'model-dd-opt'} onClick={() => { onChange(option); setOpen(false); }}>
                <span className="model-dd-opt-name">{option}</span>
                {downloading.includes(option)
                  ? <span className="model-dd-tag">Downloading…</span>
                  : downloaded.includes(option) && <span className="model-dd-tag"><Check size={12} /> Local</span>}
                {option === value && <Check size={14} className="model-dd-check" />}
              </button>
            ))}
          </div>
          <div className="model-dd-foot">
            <input
              className="model-dd-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(onAdd); } }}
              placeholder="Add a custom model id…"
            />
            <div className="model-dd-foot-actions">
              <button type="button" className="model-dd-action" disabled={!draft.trim()} onClick={() => commit(onAdd)}><Plus size={14} /> Add</button>
              <button type="button" className="model-dd-action" disabled={!draft.trim()} onClick={() => commit(onDownload)}><Download size={14} /> Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<'dashboard' | 'settings' | 'mcps'>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [captureField, setCaptureField] = useState<'interval' | 'retention'>('interval');
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
  const [connected, setConnected] = useState<string[]>([]);
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null);
  const [customModels, setCustomModels] = useState<string[]>([]);
  const [customTextModels, setCustomTextModels] = useState<string[]>([]);
  const [customImageModels, setCustomImageModels] = useState<string[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<string[]>([]);
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
      setSettings((current) => ({ ...current, ...nextSettings, enableOCR: true, enableImageEmbeddings: true }));
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
    if (page === 'settings' && settingsTab === 'logs') logBodyRef.current?.scrollTo({ top: logBodyRef.current.scrollHeight });
  }, [logs, page, settingsTab]);

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

  const toggleConnector = (connector: Connector) => {
    setConnected((current) => {
      const isOn = current.includes(connector.id);
      log(isOn ? `${connector.name} disconnected` : `${connector.name} connected`);
      return isOn ? current.filter((id) => id !== connector.id) : [...current, connector.id];
    });
  };

  const startDownload = (model: string) => {
    if (downloadedModels.includes(model) || downloadingModels.includes(model)) return;
    setDownloadingModels((current) => [...current, model]);
    log(`Downloading ${model}…`);
    window.setTimeout(() => {
      setDownloadingModels((current) => current.filter((id) => id !== model));
      setDownloadedModels((current) => (current.includes(model) ? current : [...current, model]));
      log(`Downloaded ${model}`);
    }, 1500);
  };

  const modelFieldProps = (
    field: 'cerebrasModel' | 'textEmbeddingModel' | 'imageEmbeddingModel',
    base: string[],
    custom: string[],
    setCustom: React.Dispatch<React.SetStateAction<string[]>>,
  ): ModelSelectProps => ({
    value: settings[field],
    options: Array.from(new Set([...base, ...custom, settings[field]].filter(Boolean))),
    downloaded: downloadedModels,
    downloading: downloadingModels,
    onChange: (model) => setSettings((current) => ({ ...current, [field]: model })),
    onAdd: (model) => {
      setCustom((current) => (current.includes(model) ? current : [...current, model]));
      log(`Added custom model ${model}`);
    },
    onDownload: (model) => {
      setCustom((current) => (current.includes(model) ? current : [...current, model]));
      startDownload(model);
    },
  });

  const signIn = () => {
    setAccount({ name: 'Hari Krishna', email: 'harikrishnac005@gmail.com' });
    log('Signed in as harikrishnac005@gmail.com');
  };

  const signOut = () => {
    setAccount(null);
    log('Signed out');
  };

  const openMcpPage = () => {
    setMcpOpen(false);
    setSidebarOpen(false);
    setPage('mcps');
  };

  const saveSettings = async () => {
    const updated = await updateSettings({ ...settings, enableOCR: true, enableImageEmbeddings: true });
    setSettings({ ...updated, enableOCR: true, enableImageEmbeddings: true });
    log('Settings saved');
  };

  const confirmDelete = async (label: string, action: () => Promise<{ deleted: number }>) => {
    if (!window.confirm(`${label}? This deletes local memories, screenshots, thumbnails, and vectors.`)) return;
    const result = await action();
    log(`${label}: deleted ${result.deleted} memories`);
    void refresh();
  };

  const captureSpec = captureField === 'interval'
    ? { key: 'captureIntervalSeconds' as const, unit: 'seconds', min: 1, max: 3600 }
    : { key: 'retentionDays' as const, unit: 'days', min: 1, max: 3650 };
  const captureValue = settings[captureSpec.key];
  const setCaptureValue = (next: number) => {
    const clamped = Math.min(captureSpec.max, Math.max(captureSpec.min, Number.isNaN(next) ? captureSpec.min : next));
    setSettings((current) => ({ ...current, [captureSpec.key]: clamped }));
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
          <div className="mcp-head"><Plug size={14} /> Connectors</div>
          {connected.length === 0
            ? <p>No connectors enabled. Connect an app to give answers extra tools and context.</p>
            : <p>{connected.length} connector{connected.length === 1 ? '' : 's'} enabled.</p>}
          <button className="mcp-link" onClick={openMcpPage}>Manage connectors</button>
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

          {account ? (
            <div className="account-card">
              <span className="account-avatar">{account.name.charAt(0).toUpperCase()}</span>
              <span className="account-info">
                <span className="account-name">{account.name}</span>
                <span className="account-email">{account.email}</span>
              </span>
              <button className="account-action" onClick={signOut} title="Sign out" aria-label="Sign out"><User size={16} /></button>
            </div>
          ) : (
            <button className="account-card signin" onClick={signIn} title="Sign in">
              <span className="account-avatar empty"><User size={16} /></span>
              <span className="account-info"><span className="account-name">Sign in</span><span className="account-email">Sync your account</span></span>
              <LogIn size={16} className="account-chevron" />
            </button>
          )}
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

              <nav className="settings-tabs">
                {SETTINGS_TABS.map(({ id, label }) => (
                  <button key={id} className={settingsTab === id ? 'settings-tab active' : 'settings-tab'} onClick={() => setSettingsTab(id)}>{label}</button>
                ))}
              </nav>

              {settingsTab === 'general' && (
                <>
                  <section className="settings-card capture-card">
                    <div className="capture-seg">
                      <button type="button" className={captureField === 'interval' ? 'capture-seg-btn active' : 'capture-seg-btn'} onClick={() => setCaptureField('interval')}>Capture interval</button>
                      <button type="button" className={captureField === 'retention' ? 'capture-seg-btn active' : 'capture-seg-btn'} onClick={() => setCaptureField('retention')}>Retention</button>
                    </div>
                    <div className="stepper">
                      <button type="button" className="stepper-btn" onClick={() => setCaptureValue(captureValue - 1)} disabled={captureValue <= captureSpec.min} aria-label="Decrease"><Minus size={26} /></button>
                      <div className="stepper-mid">
                        <input className="stepper-num" type="number" value={captureValue} min={captureSpec.min} max={captureSpec.max} onChange={(e) => setCaptureValue(Number(e.target.value))} />
                        <span className="stepper-unit">{captureSpec.unit}</span>
                      </div>
                      <button type="button" className="stepper-btn" onClick={() => setCaptureValue(captureValue + 1)} disabled={captureValue >= captureSpec.max} aria-label="Increase"><Plus size={26} /></button>
                    </div>
                  </section>

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
                </>
              )}

              {settingsTab === 'models' && (
                <section className="settings-card">
                  <h3>Models</h3>
                  <div className="settings-rows">
                    <div className="srow"><span>Cerebras model</span>
                      <ModelSelect {...modelFieldProps('cerebrasModel', MODEL_OPTIONS, customModels, setCustomModels)} />
                    </div>
                    <div className="srow"><span>Text embedding model</span>
                      <ModelSelect {...modelFieldProps('textEmbeddingModel', TEXT_EMBED_OPTIONS, customTextModels, setCustomTextModels)} />
                    </div>
                    <div className="srow"><span>Image embedding model</span>
                      <ModelSelect {...modelFieldProps('imageEmbeddingModel', IMAGE_EMBED_OPTIONS, customImageModels, setCustomImageModels)} />
                    </div>
                  </div>
                </section>
              )}

              {settingsTab === 'privacy' && (
                <>
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
                    <h3>Data</h3>
                    <p className="settings-hint">Capture, OCR, embeddings, and vectors stay local. Answer generation sends the question and retrieved OCR text to the Cerebras API.</p>
                    <div className="danger-zone">
                      <button onClick={() => confirmDelete('Delete last 15 minutes', deleteLast15Minutes)}>Delete last 15 minutes</button>
                      <button onClick={() => confirmDelete('Delete last hour', deleteLastHour)}>Delete last hour</button>
                      <button onClick={() => confirmDelete('Delete today', deleteToday)}>Delete today</button>
                      <button className="danger" onClick={() => confirmDelete('Delete all data', deleteAllData)}>Delete all data</button>
                    </div>
                  </section>
                </>
              )}

              {settingsTab === 'logs' && (
                <section className="settings-card logs-card open">
                  <div className="logs-head static">
                    <span className="logs-title"><Terminal size={14} /> Logs <span className="logs-count">{logs.length}</span></span>
                    {logs.length > 0 && <span className="logs-clear" role="button" tabIndex={0} onClick={() => setLogs([])}>clear</span>}
                  </div>
                  <div className="logs-body" ref={logBodyRef}>
                    {logs.length === 0 && <div className="log-empty">No activity yet.</div>}
                    {logs.map((entry, index) => (
                      <div className={`log-line ${entry.level}`} key={index}>
                        <span className="log-time">{entry.time}</span>
                        <span className="log-text">{entry.text}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        )}

        {page === 'mcps' && (
          <section className="settings">
            <div className="settings-wrap">
              <header className="settings-top">
                <h2>Connectors</h2>
                <span className="mcp-summary">{connected.length} connected</span>
              </header>
              <p className="settings-hint mcp-intro">Connect your apps over MCP to give answers extra tools and context. Everything stays on your machine until you run a query.</p>

              <div className="connector-grid">
                {CONNECTORS.map((connector) => {
                  const { id, name, description, Icon } = connector;
                  const isOn = connected.includes(id);
                  return (
                    <div className={isOn ? 'connector-card on' : 'connector-card'} key={id}>
                      <div className="connector-top">
                        <span className="connector-icon"><Icon size={20} /></span>
                        {isOn && <span className="connector-badge"><Check size={12} /> Connected</span>}
                      </div>
                      <div className="connector-name">{name}</div>
                      <p className="connector-desc">{description}</p>
                      <button className={isOn ? 'connector-btn on' : 'connector-btn'} onClick={() => toggleConnector(connector)}>
                        {isOn ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </section>

      {preview && <div className="modal" onClick={() => setPreview(null)}><img src={fileUrl(preview.screenshotPath)} /></div>}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
