/**
 * DocumentosPage — Sprint 4: RAG document management.
 *
 * WHY a single page instead of separate upload/list components: the document
 * lifecycle is tightly coupled — uploading immediately adds to the list, and
 * the list polls while processing. Splitting them would require lifting state
 * to a parent or using a shared context, adding complexity without benefit
 * for a page with only two sections.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getContractsToken } from '@/store/useAuthStore';
import {
  FileText, Upload, Trash2, Download, Loader2, AlertCircle, X,
} from 'lucide-react';
import {
  fetchCompanyDocuments,
  uploadCompanyDocument,
  deleteCompanyDocument,
} from '@/lib/api/company';
import type { CompanyDocument, DocumentStatus, DocumentType } from '@/types/document';
import {
  DOC_TYPE_LABELS,
  DOC_TYPES,
  PENDING_STATUSES,
} from '@/types/document';

/** 10 MB in bytes — backend rejects larger files */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Polling interval when documents are being processed (5 seconds) */
const POLL_INTERVAL_MS = 5_000;

const inputCls = `w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white
  placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors`;

// ── Status badge ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  UPLOADED:  { label: 'Subido',           cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  CHUNKING:  { label: 'Procesando...',    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' },
  EMBEDDING: { label: 'Generando IA...',  cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' },
  INDEXED:   { label: '✓ Listo para IA',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  FAILED:    { label: 'Error',            cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const FALLBACK_STATUS = { label: 'Desconocido', cls: 'bg-stone-500/10 text-stone-400 border-stone-500/20' };

function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, cls } = STATUS_MAP[status] ?? FALLBACK_STATUS;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// ── File size formatter ────────────────────────────────────────────────────

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
  if (bytes >= BYTES_PER_KB) {
    return `${(bytes / BYTES_PER_KB).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

// ── Date formatter (es-CO) ─────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

// ── Document card ──────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: CompanyDocument;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setDeleting(true);
    onDelete(doc.id);
  };

  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4 hover:border-white/12 transition-colors">
      {/* Top row: filename + status */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium text-sm leading-snug truncate mb-1">
            {doc.filename}
          </h3>
          <span className="text-xs text-stone-500">
            {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
          </span>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 mb-3">
        <span>{formatFileSize(doc.file_size_bytes)}</span>
        <span>{formatDate(doc.created_at)}</span>
        {doc.status === 'INDEXED' && doc.chunk_count > 0 && (
          <span className="text-emerald-500">
            {doc.chunk_count} fragmento{doc.chunk_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
        {doc.download_url ? (
          <a
            href={doc.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-emerald-400
              transition-colors px-2 py-1 rounded-lg hover:bg-emerald-500/5"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar
          </a>
        ) : (
          <span />
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-lg ${
            confirming
              ? 'text-red-400 bg-red-500/10'
              : 'text-stone-600 hover:text-red-400 hover:bg-red-500/5'
          }`}
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          {confirming ? '¿Eliminar?' : 'Eliminar'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function DocumentosPage() {
  const [docs, setDocs]             = useState<CompanyDocument[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [selectedType, setSelectedType] = useState<DocumentType>('RUP');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging]     = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // ── Fetch documents ──────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    const token = getContractsToken();
    if (!token) return;
    try {
      const response = await fetchCompanyDocuments(token);
      setDocs(response.documents);
      setError('');
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : 'Error cargando documentos';
      setError(message);
      console.error('[DocumentosPage] fetchDocs failed:', { message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  // Auto-poll when any document has a pending status
  useEffect(() => {
    const hasPending = docs.some(d =>
      (PENDING_STATUSES as readonly string[]).includes(d.status),
    );
    if (!hasPending) return;
    const intervalId = setInterval(() => void fetchDocs(), POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [docs, fetchDocs]);

  // ── File selection helpers ───────────────────────────────────────────

  const validateAndSetFile = useCallback((file: File | undefined) => {
    setUploadError('');
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Solo se permiten archivos PDF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`El archivo excede el límite de 10 MB (${formatFileSize(file.size)}).`);
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      validateAndSetFile(e.target.files?.[0]);
      // Reset input so re-selecting the same file triggers onChange
      e.target.value = '';
    },
    [validateAndSetFile],
  );

  // ── Drag and drop ───────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      validateAndSetFile(e.dataTransfer.files[0]);
    },
    [validateAndSetFile],
  );

  // ── Upload ──────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return;
    const token = getContractsToken();
    if (!token) {
      setUploadError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      await uploadCompanyDocument(token, selectedFile, selectedType);
      setSelectedFile(null);
      await fetchDocs();
    } catch (uploadErr) {
      const message = uploadErr instanceof Error ? uploadErr.message : 'Error subiendo documento';
      setUploadError(message);
      console.error('[DocumentosPage] upload failed:', { message, fileName: selectedFile.name });
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (documentId: string) => {
    const token = getContractsToken();
    if (!token) return;
    try {
      await deleteCompanyDocument(token, documentId);
      setDocs(prev => prev.filter(d => d.id !== documentId));
    } catch (deleteErr) {
      const message = deleteErr instanceof Error ? deleteErr.message : 'Error eliminando documento';
      setError(message);
      console.error('[DocumentosPage] delete failed:', { message, documentId });
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Documentos RAG</h1>
          <p className="text-stone-500 text-sm">
            Sube documentos para que la IA evalúe licitaciones con tu información
          </p>
        </div>
        {/* P1 Fix: show doc limit visibly */}
        <div className="ml-auto text-right">
          <p className="text-xs text-stone-500">
            {documents.length} <span className="text-stone-700">/</span>{' '}
            <span className={documents.length >= 10 ? 'text-red-400' : 'text-stone-500'}>
              {isPro ? '10' : '0'}
            </span> docs
          </p>
          <p className="text-[10px] text-stone-700">límite del plan</p>
        </div>
      </div>

      {/* Upload section */}
      <div className="mb-8 bg-white/[0.02] border border-white/8 rounded-2xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Subir documento</h2>

        {/* Document type selector */}
        <div className="mb-4">
          <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
            Tipo de documento
          </label>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value as DocumentType)}
            className={`${inputCls} [&>option]:bg-[#0F1929]`}
          >
            {DOC_TYPES.map(dt => (
              <option key={dt} value={dt}>{DOC_TYPE_LABELS[dt]}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-white/10 hover:border-emerald-500/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="hidden"
            aria-label="Seleccionar archivo PDF"
          />

          <Upload className={`w-8 h-8 mx-auto mb-3 ${
            dragging ? 'text-emerald-400' : 'text-stone-600'
          }`} />

          {selectedFile ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-white text-sm font-medium truncate max-w-xs">
                {selectedFile.name}
              </span>
              <span className="text-stone-500 text-xs shrink-0">
                ({formatFileSize(selectedFile.size)})
              </span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="text-stone-500 hover:text-red-400 transition-colors ml-1"
                aria-label="Quitar archivo seleccionado"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-stone-400 text-sm mb-1">
                Arrastra un archivo PDF aquí o haz clic para seleccionar
              </p>
              <p className="text-stone-600 text-xs">
                Máximo 10 MB
              </p>
            </>
          )}
        </div>

        {/* Upload error */}
        {uploadError && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl
            text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {uploadError}
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r
            from-emerald-500 to-teal-400 text-white font-semibold px-5 py-2.5 rounded-xl
            hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploading ? 'Subiendo...' : 'Subir documento'}
        </button>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Document list */}
      <h2 className="text-stone-500 text-xs uppercase tracking-wider font-medium mb-4">
        Tus documentos
      </h2>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-stone-700 mx-auto mb-4" />
          <p className="text-stone-400 font-medium mb-2">Sin documentos</p>
          <p className="text-stone-600 text-sm max-w-sm mx-auto">
            Sube tu RUP, estados financieros o certificados para que la IA evalúe licitaciones.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 pt-4 border-t border-white/5">
        <Link
          to="/dashboard"
          className="text-stone-500 hover:text-stone-300 text-sm transition-colors"
        >
          ← Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
