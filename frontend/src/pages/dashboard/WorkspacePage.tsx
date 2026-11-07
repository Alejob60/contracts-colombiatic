/**
 * WorkspacePage — Sprint 9: SECOP II document workspace.
 *
 * Accessed at /dashboard/workspace/{proceso_id}.
 *
 * The page has three zones:
 *   1. Upload zone — user drops the ZIP from SECOP II (2 manual clicks there)
 *   2. Document list — files extracted from the ZIP, classified by type
 *   3. Generated quotes — pre-filled Excel templates ready to download
 *
 * Why manual upload instead of auto-download:
 *   community.secop.gov.co requires an authenticated browser session to serve
 *   documents; the public GetDocuments endpoint returns 0 bytes without login.
 *   Auto-download via Playwright is planned for Phase 2 once we have the
 *   containerised scraper set up.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText, Upload, Download, Loader2, Check, AlertCircle,
  RefreshCw, ExternalLink, Bot, FileSpreadsheet,
  ChevronLeft, Info,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────

interface FetchJob {
  id: string; status: string; error_msg?: string; created_at: string;
}
interface ProcessDoc {
  id: string; file_name: string; file_type: string;
  file_size_kb: number; s3_key: string;
}
interface GeneratedQuote {
  id: string; status: string; fill_pct: number;
  source_file_name?: string; generated_at: string;
}
interface WorkspaceStatus {
  job?: FetchJob;
  documents: ProcessDoc[];
  quotes: GeneratedQuote[];
  has_excel_templates: boolean;
}

// ── File type icon ─────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, { label: string; cls: string; Icon: typeof FileText }> = {
  EXCEL_TEMPLATE: { label: 'Plantilla Excel', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', Icon: FileSpreadsheet },
  PDF_PLIEGO:     { label: 'Pliego / Estudio', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20',       Icon: FileText },
  PDF_ANEXO:      { label: 'Anexo PDF',        cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',    Icon: FileText },
  OTHER:          { label: 'Documento',        cls: 'text-stone-400 bg-stone-500/10 border-stone-500/20',    Icon: FileText },
};

// ── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    QUEUED:        'bg-stone-500/10 text-stone-400',
    DOWNLOADING:   'bg-blue-500/10  text-blue-400',
    EXTRACTING:    'bg-amber-500/10 text-amber-400',
    MANUAL_UPLOAD: 'bg-amber-500/10 text-amber-400',
    READY:         'bg-emerald-500/10 text-emerald-400',
    FAILED:        'bg-red-500/10   text-red-400',
  };
  const labels: Record<string, string> = {
    QUEUED: 'En cola', DOWNLOADING: 'Descargando…', EXTRACTING: 'Extrayendo…',
    MANUAL_UPLOAD: 'Procesando…', READY: 'Listo', FAILED: 'Error',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? map.QUEUED}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function WorkspacePage() {
  const { procesoId } = useParams<{ procesoId: string }>();
  const navigate      = useNavigate();
  const { isAuthenticated, isPro } = useAuthStore();

  const [ws,          setWs]          = useState<WorkspaceStatus | null>(null);
  const [loading,     setLoading]      = useState(true);
  const [uploading,   setUploading]    = useState(false);
  const [quoting,     setQuoting]      = useState<string | null>(null); // doc_id being quoted
  const [error,       setError]        = useState<string | null>(null);
  const [dragOver,    setDragOver]     = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = () => getContractsToken();

  // ── Load workspace status ──────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    if (!procesoId) return;
    const res = await fetch(`${API_BASE}/api/v1/workspace/${procesoId}/status`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) {
      const data: WorkspaceStatus = await res.json();
      setWs(data);
      // Stop polling when job is terminal
      const jobStatus = data.job?.status;
      if (jobStatus === 'READY' || jobStatus === 'FAILED' || !jobStatus) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }
    setLoading(false);
  }, [procesoId]);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth'); return; }
    if (!isPro) { navigate('/dashboard'); return; }
    loadStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isAuthenticated, isPro, navigate, loadStatus]);

  // Start polling when a job is in progress
  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(loadStatus, 3000);
  };

  // ── Upload ZIP ────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Solo se aceptan archivos .zip (el ZIP que descargaste de SECOP II)');
      return;
    }
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/v1/workspace/${procesoId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      await loadStatus();
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo el archivo');
    } finally {
      setUploading(false);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  // ── Generate quote ────────────────────────────────────────────────

  const handleGenerateQuote = async (docId: string) => {
    setQuoting(docId); setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspace/${procesoId}/quote/${docId}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token()}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startPolling();
    } catch (err) {
      setError('No se pudo iniciar la generación de cotización');
    } finally {
      setQuoting(null);
    }
  };

  // ── Download presigned URL ─────────────────────────────────────────

  const downloadDoc = async (docId: string) => {
    const res = await fetch(`${API_BASE}/api/v1/workspace/download/doc/${docId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) { const d = await res.json(); window.open(d.download_url, '_blank'); }
  };

  const downloadQuote = async (quoteId: string) => {
    const res = await fetch(`${API_BASE}/api/v1/workspace/download/quote/${quoteId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) { const d = await res.json(); window.open(d.download_url, '_blank'); }
  };

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const job     = ws?.job;
  const docs    = ws?.documents ?? [];
  const quotes  = ws?.quotes ?? [];
  const isWorking = job && ['QUEUED','DOWNLOADING','EXTRACTING','MANUAL_UPLOAD'].includes(job.status);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/dashboard/guardados"
          className="p-2 rounded-lg text-stone-500 hover:text-white hover:bg-white/5">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-white font-bold text-xl">Workspace de Proceso</h1>
          <p className="text-stone-500 text-sm font-mono truncate max-w-sm">
            {procesoId}
          </p>
        </div>
        {job && <StatusBadge status={job.status} />}
        <button onClick={loadStatus}
          className="ml-auto p-2 rounded-lg text-stone-600 hover:text-stone-300
            hover:bg-white/5 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-400
          bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload zone */}
      {(!job || job.status === 'FAILED') && !isWorking && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 mb-4">
          <h2 className="text-stone-300 font-semibold text-sm mb-1 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-500" />
            Carga los documentos del proceso
          </h2>

          {/* Instructions */}
          <div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl
            flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-stone-400 space-y-1">
              <p className="font-medium text-stone-300">Cómo obtener el ZIP de SECOP II:</p>
              <ol className="space-y-0.5 pl-3 list-decimal list-outside">
                <li>Abre el proceso en SECOP II <span className="text-stone-500">(botón abajo)</span></li>
                <li>Ve a la pestaña <strong className="text-stone-300">"Documentos del proceso"</strong></li>
                <li>Haz clic en <strong className="text-stone-300">"Descargar todos"</strong> → obtienes un .zip</li>
                <li>Sube ese .zip aquí ↓</li>
              </ol>
            </div>
          </div>

          {/* Open SECOP II */}
          <div className="flex gap-2 mb-4">
            <a
              href={`https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${procesoId?.replace('CO1.REQ.','CO1.NTC.')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-emerald-400
                border border-white/10 hover:border-emerald-500/20 px-3 py-2 rounded-lg
                bg-white/5 hover:bg-emerald-500/5 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en SECOP II
            </a>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-colors ${
                dragOver
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-white/15 hover:border-emerald-500/30 hover:bg-white/[0.02]'
              }`}>
            {uploading ? (
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
            ) : (
              <Upload className="w-8 h-8 text-stone-600 mx-auto mb-2" />
            )}
            <p className="text-stone-400 text-sm font-medium">
              {uploading ? 'Subiendo y procesando…' : 'Arrastra el .zip aquí o haz clic para seleccionar'}
            </p>
            <p className="text-stone-600 text-xs mt-1">Máximo 50 MB · Solo archivos .zip</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".zip"
            className="hidden" onChange={onFileSelect} />

          {job?.status === 'FAILED' && job.error_msg && (
            <p className="text-xs text-red-400 mt-2">{job.error_msg}</p>
          )}
        </div>
      )}

      {/* Processing state */}
      {isWorking && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
            <div>
              <p className="text-white text-sm font-medium">
                {job?.status === 'MANUAL_UPLOAD' || job?.status === 'EXTRACTING'
                  ? 'Extrayendo y clasificando archivos…'
                  : 'Descargando documentos…'}
              </p>
              <p className="text-stone-500 text-xs">
                Esto tarda unos segundos. Actualizando automáticamente…
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-emerald-500" />
            Documentos del proceso
            <span className="text-stone-600 font-normal text-xs">({docs.length})</span>
          </h2>

          <div className="space-y-2">
            {docs.map(doc => {
              const { label, cls, Icon } = FILE_ICONS[doc.file_type] ?? FILE_ICONS.OTHER;
              return (
                <div key={doc.id}
                  className="flex items-center justify-between gap-3 p-3
                    bg-white/[0.02] rounded-xl border border-white/5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 p-1.5 rounded-lg border ${cls}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-stone-300 truncate font-medium">
                        {doc.file_name}
                      </p>
                      <p className="text-xs text-stone-600">
                        {label} · {doc.file_size_kb} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.file_type === 'EXCEL_TEMPLATE' && (
                      <button
                        onClick={() => handleGenerateQuote(doc.id)}
                        disabled={quoting === doc.id}
                        className="flex items-center gap-1 text-xs text-emerald-400
                          bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg
                          hover:bg-emerald-500/15 transition-colors disabled:opacity-50">
                        {quoting === doc.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Bot className="w-3.5 h-3.5" />}
                        Auto-llenar
                      </button>
                    )}
                    <button onClick={() => downloadDoc(doc.id)}
                      className="p-1.5 text-stone-500 hover:text-white hover:bg-white/5
                        rounded-lg transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Re-upload option */}
          {job?.status === 'READY' && (
            <button
              onClick={() => { setWs(prev => prev ? { ...prev, job: undefined } : null); fileInputRef.current?.click(); }}
              className="mt-3 text-xs text-stone-500 hover:text-stone-300 flex items-center gap-1">
              <Upload className="w-3 h-3" /> Subir otro ZIP
            </button>
          )}
        </div>
      )}

      {/* Generated quotes */}
      {quotes.length > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            Cotizaciones pre-llenadas
            <span className="text-stone-600 font-normal text-xs">({quotes.length})</span>
          </h2>

          <div className="space-y-2">
            {quotes.map(q => (
              <div key={q.id}
                className="flex items-center justify-between gap-3 p-3
                  bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                <div>
                  <p className="text-sm text-stone-300 font-medium">
                    {q.source_file_name
                      ? `Cotización de ${q.source_file_name}`
                      : 'Cotización pre-llenada'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {q.status === 'PROCESSING' ? (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Generando…
                      </span>
                    ) : q.status === 'READY' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {q.fill_pct}% auto-llenado
                      </span>
                    ) : (
                      <span className="text-xs text-red-400">Error en generación</span>
                    )}
                  </div>
                </div>
                {q.status === 'READY' && (
                  <button onClick={() => downloadQuote(q.id)}
                    className="flex items-center gap-1.5 text-xs text-emerald-400
                      bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg
                      hover:bg-emerald-500/15 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Descargar
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-stone-600">
            Revisa los valores, firma y sube el Excel a SECOP II.
          </p>
        </div>
      )}

      {/* Empty state after job READY with no excel templates */}
      {job?.status === 'READY' && docs.length > 0 && !ws?.has_excel_templates && (
        <div className="text-center py-6">
          <p className="text-stone-500 text-sm">
            Este proceso no tiene plantillas Excel para generar cotización.
            Revisa los documentos descargados.
          </p>
        </div>
      )}
    </div>
  );
}
