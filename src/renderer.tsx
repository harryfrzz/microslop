import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

const blankSettings: Settings = {
  captureEnabled: false,
  captureIntervalSeconds: 5,
  retentionDays: 30,
  backendUrl: 'http://127.0.0.1:8765',
  ollamaModel: 'gemma4:e2b',
  textEmbeddingModel: 'nomic-embed-text',
  imageEmbeddingModel: 'sentence-transformers/clip-ViT-B-32',
  enableOCR: true,
  enableImageEmbeddings: true,
  excludedApps: [],
  excludedWindowTitlePatterns: [],
};

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
      setAnswer(generated.status === 'ok' ? generated.answer : generated.error || 'Gemma answer generation failed. Search results are still shown.');
    }
  };

  const saveSettings = async () => {
    const updated = await updateSettings(settings);
    setSettings(updated);
    setMessage('Settings saved. If the Gemma tag differs locally, set the exact Ollama model name here.');
  };

  const confirmDelete = async (label: string, action: () => Promise<{ deleted: number }>) => {
    if (!window.confirm(`${label}? This deletes local memories, screenshots, thumbnails, and vectors.`)) return;
    const result = await action();
    setMessage(`Deleted ${result.deleted} memories.`);
    void refresh();
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>microslop</span></div>
        {(['dashboard', 'search', 'settings', 'privacy'] as const).map((item) => (
          <button key={item} className={page === item ? 'nav active' : 'nav'} onClick={() => setPage(item)}>{item}</button>
        ))}
        <p className="local-note">Local screen memory. Private by default.</p>
      </aside>

      <section className="content">
        {backendError && <div className="banner bad">{backendError}</div>}
        {message && <div className="banner">{message}</div>}

        {page === 'dashboard' && (
          <section className="panel hero-panel">
            <div>
              <p className="eyebrow">Local Recall</p>
              <h1>Search your screen history.</h1>
              <p className="lede">Private screenshots, OCR, embeddings, and answers running locally on your machine.</p>
              <div className="actions">
                <button onClick={startCapture}>Start capture</button>
                <button className="secondary" onClick={pause}>Pause capture</button>
                <button className="secondary" onClick={captureNow}>Capture now</button>
                <button className="ghost" onClick={() => window.microslop?.openDataFolder()}>Open data folder</button>
              </div>
            </div>
            <div className="status-card">
              <Pill label="SQLite" value={status?.sqlite || 'unknown'} />
              <Pill label="LanceDB" value={status?.lancedb || 'unknown'} />
              <Pill label="Ollama" value={status?.ollama || 'unknown'} />
              <Pill label="OCR" value={status?.ocr || 'unknown'} />
              <dl>
                <dt>Capture</dt><dd>{settings.captureEnabled ? 'Running' : 'Paused'}</dd>
                <dt>Today</dt><dd>{status?.captureStats.snapshotsToday || 0} snapshots</dd>
                <dt>Last capture</dt><dd>{prettyTime(status?.captureStats.lastCapturedAt)}</dd>
                <dt>Storage</dt><dd>{prettyBytes(status?.captureStats.storageUsedBytes)}</dd>
              </dl>
            </div>
          </section>
        )}

        {page === 'search' && (
          <section className="panel">
            <h2>Search</h2>
            <div className="searchbar">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="what was I reading about Gemma?" />
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
            <label>Capture interval seconds<input type="number" value={settings.captureIntervalSeconds} onChange={(e) => setSettings({ ...settings, captureIntervalSeconds: Number(e.target.value) })} /></label>
            <label>Retention days<input type="number" value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })} /></label>
            <label>Backend URL<input value={settings.backendUrl} readOnly /></label>
            <label>Ollama model<input value={settings.ollamaModel} onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })} /></label>
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
