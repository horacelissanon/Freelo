'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCreateMenu } from '@/contexts/CreateMenuContext';
import { useApi, invalidateCache } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import { formatPrice, formatDate, formatLongDate } from '@/lib/utils';
import { resolveDocumentIdentity } from '@/lib/documentIdentity';
import { Icon } from '@/components/ui/Icon';
import { StarRating } from '@/components/ui/StarRating';
import { Modal } from '@/components/ui/Modal';
import { BackButton } from '@/components/ui/BackButton';
import { InvoiceRow } from '@/components/invoices/InvoiceRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/PageStates';
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ICONS,
  FREELANCE_SECTOR_LABELS,
  FREELANCE_SECTOR_ICONS,
  SECTOR_PROJECT_TYPES,
  resolveFreelanceSector,
  STEP_STATUS_LABELS,
  type ProjectStatus,
  type ProjectType,
  type FreelanceSector,
  type ProjectStepStatus,
  type InvoiceStatus,
  type InvoiceDocType,
} from '@/lib/constants';

const FREELANCE_SECTORS = Object.keys(FREELANCE_SECTOR_LABELS) as FreelanceSector[];

interface ProjectDetailStep {
  id: string;
  order: number;
  title: string;
  description: string | null;
  status: ProjectStepStatus;
  completedAt: string | null;
}

interface ProjectDetailComment {
  id: string;
  author: 'FREELANCER' | 'CLIENT';
  body: string;
  attachmentUrl: string | null;
  attachmentType: 'IMAGE' | 'AUDIO' | null;
  createdAt: string;
}

interface ProjectDetailInvoice {
  id: string;
  number: string;
  docType: InvoiceDocType;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  dueDate: string | null;
}

interface ProjectDetailFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface ProjectDetail {
  project: {
    id: string;
    name: string;
    sector: string;
    type: ProjectType;
    description: string | null;
    status: ProjectStatus;
    progress: number;
    amount: number;
    currency: string;
    dueDate: string | null;
    step: string | null;
    publicToken: string;
    depositPercent: number;
    createdAt: string;
    client: { id: string; name: string };
  };
  steps: ProjectDetailStep[];
  comments: ProjectDetailComment[];
  review: { rating: number; comment: string | null; createdAt: string } | null;
  invoices: ProjectDetailInvoice[];
  files: ProjectDetailFile[];
  deposit: { amount: number; paid: boolean };
  balance: { amount: number; paid: boolean };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ProjectDetailPage() {
  const user = useUser();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { openCreate } = useCreateMenu();
  const { data, loading, error, refresh } = useApi<ProjectDetail>(`/api/projects/${id}`);

  if (!user) return null;

  async function copyTrackingLink() {
    if (!data) return;
    const url = `${window.location.origin}/suivi/${data.project.publicToken}`;
    await navigator.clipboard.writeText(url);
    toast('Lien de suivi copié.', 'success');
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <BackButton fallbackHref="/projects" label="Projets" className="mb-4" />

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Projet introuvable.'} onRetry={refresh} />
      ) : (
        <ProjectDetailView
          data={data}
          onCopyLink={copyTrackingLink}
          onCreateInvoice={() => openCreate('invoice')}
        />
      )}
    </div>
  );
}

function ProjectDetailView({
  data,
  onCopyLink,
  onCreateInvoice,
}: {
  data: ProjectDetail;
  onCopyLink: () => void;
  onCreateInvoice: () => void;
}) {
  const { project, steps, comments, review, invoices, files, deposit, balance } = data;
  const { toast } = useToast();
  const user = useUser();
  const statusColors = PROJECT_STATUS_COLORS[project.status];
  const effectiveSector = resolveFreelanceSector(project.sector, project.type).code;
  const trackingUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/suivi/${project.publicToken}` : '';
  const studioLabel = user ? resolveDocumentIdentity(user).name : '';
  const whatsappMessage = `Bonjour ${project.client.name}, voici le lien de suivi de votre projet « ${project.name} » avec ${studioLabel} : vous pourrez y consulter l'avancement, les étapes et les paiements en temps réel.\n\n${trackingUrl}`;

  const [pendingStepId, setPendingStepId] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [savingType, setSavingType] = useState(false);

  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newStepTitle, setNewStepTitle] = useState('');
  const [addingStep, setAddingStep] = useState(false);
  const [removingStepId, setRemovingStepId] = useState<string | null>(null);
  const [stepEditorError, setStepEditorError] = useState<string | null>(null);

  const firstOpenStep = steps.find((s) => s.status !== 'COMPLETED');

  async function patchProject(partial: {
    name?: string;
    sector?: string;
    type?: ProjectType;
    description?: string | null;
    amount?: number;
    dueDate?: string | null;
  }) {
    await api(`/api/projects/${project.id}`, { method: 'PATCH', body: partial });
    invalidateCache(`/api/projects/${project.id}`);
    invalidateCache('/api/projects?limit=50');
  }

  async function onQuickTypeChange(type: ProjectType) {
    if (type === project.type) return;
    setSavingType(true);
    try {
      await patchProject({ type });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue.', 'error');
    } finally {
      setSavingType(false);
    }
  }

  async function patchStep(
    stepId: string,
    body:
      | { action: 'status'; status: ProjectStepStatus }
      | { action: 'move'; direction: 'up' | 'down' },
  ) {
    setPendingStepId(stepId);
    setStepError(null);
    try {
      await api(`/api/projects/${project.id}/steps/${stepId}`, { method: 'PATCH', body });
      invalidateCache(`/api/projects/${project.id}`);
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setPendingStepId(null);
    }
  }

  async function onAddStep(e: FormEvent) {
    e.preventDefault();
    const title = newStepTitle.trim();
    if (!title) return;
    setAddingStep(true);
    setStepEditorError(null);
    try {
      await api(`/api/projects/${project.id}/steps`, { method: 'POST', body: { title } });
      setNewStepTitle('');
      invalidateCache(`/api/projects/${project.id}`);
    } catch (err) {
      setStepEditorError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setAddingStep(false);
    }
  }

  async function removeStep(stepId: string) {
    setRemovingStepId(stepId);
    setStepEditorError(null);
    try {
      await api(`/api/projects/${project.id}/steps/${stepId}`, { method: 'DELETE' });
      invalidateCache(`/api/projects/${project.id}`);
    } catch (err) {
      setStepEditorError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setRemovingStepId(null);
    }
  }

  async function onSubmitComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPosting(true);
    setCommentError(null);
    try {
      await api(`/api/projects/${project.id}/comments`, {
        method: 'POST',
        body: { body: commentBody.trim() },
      });
      setCommentBody('');
      invalidateCache(`/api/projects/${project.id}`);
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setPosting(false);
    }
  }

  async function sendAttachment(file: File, attachmentType: 'IMAGE' | 'AUDIO') {
    setPosting(true);
    setCommentError(null);
    try {
      const uploaded = await uploadFile(file);
      await api(`/api/projects/${project.id}/comments`, {
        method: 'POST',
        body: { body: '', attachmentUrl: uploaded.url, attachmentType },
      });
      invalidateCache(`/api/projects/${project.id}`);
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : "Échec de l'envoi.");
    } finally {
      setPosting(false);
    }
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await sendAttachment(file, 'IMAGE');
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const file = new File([blob], 'note-vocale.webm', { type: blob.type });
        void sendAttachment(file, 'AUDIO');
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setCommentError('Micro indisponible ou accès refusé.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFile(true);
    setFileError(null);
    try {
      await uploadFile(file, project.id);
      invalidateCache(`/api/projects/${project.id}`);
    } catch (err) {
      setFileError(err instanceof ApiError ? err.message : 'Échec du téléversement.');
    } finally {
      setUploadingFile(false);
    }
  }

  return (
    <>
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
        <div className="lg:col-start-1 lg:row-start-1">
          <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-canvas shadow-card p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-headings text-xl font-bold text-foreground sm:text-2xl">
                  {project.name}
                </h1>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors.bg} ${statusColors.fg}`}
                >
                  {PROJECT_STATUS_LABELS[project.status]}
                </span>
              </div>
              <Link
                href={`/clients/${project.client.id}`}
                className="mt-1 inline-flex items-center gap-1.5 font-body text-sm text-muted-foreground hover:text-foreground"
              >
                <Icon i="user" size={13} />
                {project.client.name}
              </Link>
              <p className="mt-0.5 font-body text-xs text-muted-foreground">
                Démarré le {formatLongDate(project.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex flex-shrink-0 items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-foreground"
            >
              <Icon i="pen-line" size={15} />
              Modifier
            </button>
          </div>

          <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
            <h2 className="mb-1 font-headings text-sm font-bold text-foreground">
              Code de suivi client
            </h2>
            <p className="mb-3 font-body text-xs text-muted-foreground">
              Partagez ce lien avec votre client pour qu&apos;il suive l&apos;avancement.
            </p>
            <p className="mb-3 truncate rounded-md border border-border bg-input px-3 py-2.5 font-mono text-xs text-foreground">
              {trackingUrl}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-tag-green px-3 py-2 font-body text-xs font-medium text-tag-green-fg"
              >
                <Icon i="send" size={14} />
                WhatsApp
              </a>
              <button
                type="button"
                onClick={onCopyLink}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-xs font-medium text-foreground"
              >
                <Icon i="link" size={14} />
                Copier
              </button>
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-body text-xs font-medium text-foreground"
              >
                <Icon i="globe" size={14} />
                Ouvrir
              </a>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-canvas shadow-card p-4">
              <p className="font-body text-xs text-muted-foreground">Budget</p>
              <p className="mt-1 font-headings text-base font-bold text-foreground">
                {formatPrice(project.amount)} {project.currency}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-canvas shadow-card p-4">
              <p className="font-body text-xs text-muted-foreground">Échéance</p>
              <p className="mt-1 font-headings text-base font-bold text-foreground">
                {project.dueDate ? formatDate(project.dueDate) : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-canvas shadow-card p-4">
              <p className="font-body text-xs text-muted-foreground">Avancement</p>
              <p className="mt-1 font-headings text-base font-bold text-foreground">
                {project.progress}%
              </p>
            </div>
            <div className="rounded-lg border border-border bg-canvas shadow-card p-4">
              <p className="font-body text-xs text-muted-foreground">Étape en cours</p>
              <p className="mt-1 truncate font-headings text-base font-bold text-foreground">
                {firstOpenStep?.title ?? '—'}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
            <h2 className="mb-3 font-headings text-sm font-bold text-foreground">
              Type de projet
              <span className="ml-2 font-body text-xs font-normal text-muted-foreground">
                {FREELANCE_SECTOR_LABELS[effectiveSector]}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {SECTOR_PROJECT_TYPES[effectiveSector].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={savingType}
                  onClick={() => void onQuickTypeChange(value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-body text-xs font-medium disabled:opacity-50 ${
                    project.type === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-canvas text-foreground'
                  }`}
                >
                  <Icon i={PROJECT_TYPE_ICONS[value]} size={13} />
                  {PROJECT_TYPE_LABELS[value]}
                </button>
              ))}
            </div>
            {project.description && (
              <p className="mt-3 font-body text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mb-0">
          <h2 className="mb-4 font-headings text-sm font-bold text-foreground">Étapes du projet</h2>
          <div className="flex flex-col">
            {steps.map((step, index) => {
              const busy = pendingStepId === step.id;
              const isCurrent = firstOpenStep?.id === step.id;
              const isCompleted = step.status === 'COMPLETED';
              return (
                <div key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < steps.length - 1 && (
                    <div className="absolute top-9 bottom-0 left-4 w-px bg-border" />
                  )}
                  <div
                    className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-body text-xs font-bold ${
                      isCompleted
                        ? 'bg-tag-green text-tag-green-fg'
                        : isCurrent
                          ? 'border-2 border-primary bg-canvas text-primary'
                          : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? <Icon i="check-circle" size={16} /> : step.order}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-body text-sm font-medium text-foreground">{step.title}</p>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 font-body text-xs font-medium ${
                          isCompleted
                            ? 'bg-tag-green text-tag-green-fg'
                            : isCurrent
                              ? 'bg-tag-orange text-tag-orange-fg'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {isCompleted
                          ? STEP_STATUS_LABELS.COMPLETED
                          : isCurrent
                            ? 'En cours'
                            : 'À venir'}
                      </span>
                    </div>
                    {step.description && (
                      <p className="mt-0.5 font-body text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    )}
                    {isCurrent && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void patchStep(step.id, { action: 'status', status: 'COMPLETED' })
                        }
                        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-body text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        <Icon i="check-circle" size={13} />
                        Valider cette étape
                      </button>
                    )}
                  </div>
                  {!isCompleted && (
                    <div className="flex flex-shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label="Monter l'étape"
                        disabled={busy || index === 0}
                        onClick={() => void patchStep(step.id, { action: 'move', direction: 'up' })}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"
                      >
                        <Icon i="chevron-up" size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Descendre l'étape"
                        disabled={busy || index === steps.length - 1}
                        onClick={() =>
                          void patchStep(step.id, { action: 'move', direction: 'down' })
                        }
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"
                      >
                        <Icon i="chevron-down" size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {stepError && (
            <p role="alert" className="mt-3 font-body text-sm text-tag-red-fg">
              {stepError}
            </p>
          )}
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
            <h2 className="mb-4 font-headings text-sm font-bold text-foreground">Paiements</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
                <div>
                  <p className="font-body text-sm font-medium text-foreground">
                    Acompte ({project.depositPercent}%)
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {formatPrice(deposit.amount)} {project.currency}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1.5 font-body text-xs font-medium ${deposit.paid ? 'bg-tag-green text-tag-green-fg' : 'bg-muted text-muted-foreground'}`}
                >
                  {deposit.paid ? 'Payé' : 'En attente'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
                <div>
                  <p className="font-body text-sm font-medium text-foreground">Solde</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {formatPrice(balance.amount)} {project.currency}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1.5 font-body text-xs font-medium ${balance.paid ? 'bg-tag-green text-tag-green-fg' : 'bg-muted text-muted-foreground'}`}
                >
                  {balance.paid ? 'Payé' : 'En attente'}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-headings text-sm font-bold text-foreground">
                Livrable final ({files.length}/5)
              </h2>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,application/zip,application/postscript"
              className="hidden"
              onChange={(e) => void onFilesSelected(e)}
            />
            <button
              type="button"
              disabled={uploadingFile || files.length >= 5}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Icon i="upload" size={18} className="text-muted-foreground" />
              </div>
              <p className="font-body text-sm font-medium text-foreground">
                {uploadingFile ? 'Envoi en cours…' : 'Déposer un fichier ici'}
              </p>
              <p className="font-body text-xs text-muted-foreground">
                PDF, AI, PNG, JPG, ZIP — max 50 Mo ({files.length}/5)
              </p>
            </button>
            {fileError && (
              <p role="alert" className="mt-2 font-body text-sm text-tag-red-fg">
                {fileError}
              </p>
            )}
            {files.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {files.map((f) => (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-secondary"
                  >
                    <Icon i="file-text" size={16} className="flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-body text-sm text-foreground">
                      {f.filename}
                    </span>
                    <span className="flex-shrink-0 font-body text-xs text-muted-foreground">
                      {formatBytes(f.sizeBytes)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
            <h2 className="mb-4 font-headings text-sm font-bold text-foreground">
              Messagerie ({comments.length})
            </h2>
            {comments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Icon i="message-circle" size={22} className="text-muted-foreground" />
                <p className="font-body text-sm text-muted-foreground">
                  Aucun message pour ce projet.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {comments.map((c) => (
                  <div key={c.id} className="border-b border-border pb-3 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <p className="font-body text-xs font-semibold text-foreground">
                        {c.author === 'CLIENT' ? project.client.name : 'Vous'}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </p>
                    </div>
                    {c.body && <p className="mt-0.5 font-body text-sm text-foreground">{c.body}</p>}
                    {c.attachmentType === 'IMAGE' && c.attachmentUrl && (
                      <a href={c.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={c.attachmentUrl}
                          alt="Pièce jointe"
                          className="mt-1.5 max-h-48 rounded-md border border-border"
                        />
                      </a>
                    )}
                    {c.attachmentType === 'AUDIO' && c.attachmentUrl && (
                      <audio
                        controls
                        src={c.attachmentUrl}
                        className="mt-1.5 h-9 w-full max-w-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={onSubmitComment} className="mt-4 flex items-center gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void onPhotoSelected(e)}
              />
              <button
                type="button"
                disabled={posting}
                onClick={() => photoInputRef.current?.click()}
                aria-label="Envoyer une photo"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-50"
              >
                <Icon i="camera" size={16} />
              </button>
              <button
                type="button"
                disabled={posting}
                onClick={() => (recording ? stopRecording() : void startRecording())}
                aria-label={recording ? 'Arrêter l’enregistrement' : 'Enregistrer un message vocal'}
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border disabled:opacity-50 ${
                  recording
                    ? 'border-tag-red-fg bg-tag-red text-tag-red-fg'
                    : 'border-border text-muted-foreground'
                }`}
              >
                <Icon i="mic" size={16} />
              </button>
              <input
                type="text"
                placeholder="Répondre au client…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                maxLength={2000}
                className="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={posting || !commentBody.trim()}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <Icon i="send" size={14} />
                Envoyer
              </button>
            </form>
            {commentError && (
              <p role="alert" className="mt-2 font-body text-sm text-tag-red-fg">
                {commentError}
              </p>
            )}
          </div>

          {review && (
            <div className="mb-6 rounded-lg border border-border bg-canvas shadow-card p-5">
              <h2 className="mb-3 font-headings text-sm font-bold text-foreground">
                Avis du client
              </h2>
              <div className="flex items-center gap-3">
                <StarRating value={review.rating} size={18} />
                <p className="font-body text-xs text-muted-foreground">
                  {formatDate(review.createdAt)}
                </p>
              </div>
              {review.comment && (
                <p className="mt-2 font-body text-sm text-foreground">{review.comment}</p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border bg-canvas shadow-card">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-headings text-sm font-bold text-foreground">
                Factures &amp; devis ({invoices.length})
              </h2>
              <button
                type="button"
                onClick={onCreateInvoice}
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary"
              >
                <Icon i="plus" size={14} />
                Nouvelle facture
              </button>
            </div>
            <div className="p-5">
              {invoices.length === 0 ? (
                <EmptyState
                  icon="file-text"
                  title="Aucune facture"
                  description="Les factures et devis liés à ce projet apparaîtront ici."
                />
              ) : (
                <div>
                  {invoices.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      invoice={{
                        id: inv.id,
                        number: inv.number,
                        docType: inv.docType,
                        status: inv.status,
                        clientName: project.client.name,
                        amount: inv.amount,
                        currency: inv.currency,
                        dueDateLabel: inv.dueDate ? formatDate(inv.dueDate) : null,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
            <h2 className="mb-1 font-headings text-sm font-bold text-foreground">
              Personnaliser les étapes
            </h2>
            <p className="mb-4 font-body text-xs text-muted-foreground">
              Ajoutez ou retirez des étapes selon les besoins de ce projet.
            </p>
            <div className="flex flex-col gap-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <span className="min-w-0 flex-1 truncate font-body text-sm text-foreground">
                    {step.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeStep(step.id)}
                    disabled={removingStepId === step.id || steps.length <= 1}
                    aria-label="Supprimer l'étape"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30"
                  >
                    <Icon i="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={onAddStep} className="mt-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Nouvelle étape…"
                value={newStepTitle}
                onChange={(e) => setNewStepTitle(e.target.value)}
                maxLength={200}
                className="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingStep || !newStepTitle.trim()}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <Icon i="plus" size={14} />
                Ajouter
              </button>
            </form>
            {stepEditorError && (
              <p role="alert" className="mt-2 font-body text-sm text-tag-red-fg">
                {stepEditorError}
              </p>
            )}
          </div>
        </div>
      </div>

      {editOpen && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSave={patchProject}
        />
      )}
    </>
  );
}

function EditProjectModal({
  project,
  onClose,
  onSave,
}: {
  project: ProjectDetail['project'];
  onClose: () => void;
  onSave: (partial: {
    name?: string;
    sector?: string;
    type?: ProjectType;
    description?: string | null;
    amount?: number;
    dueDate?: string | null;
  }) => Promise<void>;
}) {
  const { toast } = useToast();
  const resolvedSector = resolveFreelanceSector(project.sector, project.type);
  const [name, setName] = useState(project.name);
  const [sector, setSector] = useState<FreelanceSector>(resolvedSector.code);
  const [sectorOther, setSectorOther] = useState(resolvedSector.other);
  const [type, setType] = useState<ProjectType>(project.type);
  const [description, setDescription] = useState(project.description ?? '');
  const [amount, setAmount] = useState(String(project.amount));
  const [dueDate, setDueDate] = useState(project.dueDate ? project.dueDate.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        sector: sector === 'OTHER' ? sectorOther.trim() || 'OTHER' : sector,
        type,
        description: description.trim() ? description.trim() : null,
        amount: Number(amount),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      toast('Projet mis à jour.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Modifier le projet" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Titre du projet *
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Secteur freelance
          <div className="flex flex-wrap gap-2">
            {FREELANCE_SECTORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSector(value);
                  setType(
                    value === 'OTHER' ? 'OTHER' : (SECTOR_PROJECT_TYPES[value][0] ?? 'OTHER'),
                  );
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  sector === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-canvas text-foreground'
                }`}
              >
                <Icon i={FREELANCE_SECTOR_ICONS[value]} size={13} />
                {FREELANCE_SECTOR_LABELS[value]}
              </button>
            ))}
          </div>
          {sector === 'OTHER' && (
            <input
              type="text"
              value={sectorOther}
              onChange={(e) => setSectorOther(e.target.value)}
              placeholder="Précisez votre secteur…"
              maxLength={100}
              className={`${inputClass} mt-1`}
            />
          )}
        </div>
        {sector !== 'OTHER' && (
          <div className="flex flex-col gap-1.5 font-body text-sm text-foreground">
            Type de projet
            <div className="flex flex-wrap gap-2">
              {SECTOR_PROJECT_TYPES[sector].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    type === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-canvas text-foreground'
                  }`}
                >
                  <Icon i={PROJECT_TYPE_ICONS[value]} size={13} />
                  {PROJECT_TYPE_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Montant (XOF) *
          <input
            type="number"
            required
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Échéance
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-sm text-foreground">
          Brief
          <textarea
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="font-body text-sm text-tag-red-fg">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-2 rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </Modal>
  );
}
