import React, { useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { authHeaders } from '../apiClient';
import { apiFetch } from '../runtimeConfig';

type Props = {
  language: 'FR' | 'EN';
  response: string;
  provider: string;
  source: 'main' | 'assistant';
};

export default function AiContentReport({ language, response, provider, source }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('unsafe');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportId, setReportId] = useState('');
  const [error, setError] = useState('');
  const t = (fr: string, en: string) => language === 'FR' ? fr : en;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || reportId) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/ai/reports', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: response.slice(0, 16000), reason, comment, provider, source }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await res.json();
      if (!res.ok || typeof data.reportId !== 'string' || !data.reportId) {
        setError(res.status === 401
          ? t('Reconnectez-vous pour envoyer le signalement.', 'Sign in again to submit the report.')
          : res.status === 429
            ? t('Trop de signalements. Réessayez dans quelques minutes.', 'Too many reports. Try again in a few minutes.')
            : t('Le signalement n’a pas été enregistré. Réessayez.', 'The report was not saved. Please try again.'));
        return;
      }
      setReportId(data.reportId);
      setOpen(false);
    } catch {
      setError(t('Envoi non confirmé. Vérifiez votre connexion et réessayez.', 'Submission not confirmed. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (reportId) return <p role="status" className="mt-2 text-sm text-emerald-300 whitespace-normal">
    {t('Signalement reçu. Merci.', 'Report received. Thank you.')}
    <span className="block text-xs break-all">{t('Référence : ', 'Reference: ')}{reportId}</span>
  </p>;

  return <div className="mt-2 whitespace-normal">
    <button type="button" onClick={() => setOpen(!open)} disabled={busy} aria-expanded={open} aria-controls={id}
      className="min-h-11 inline-flex items-center gap-2 text-sm underline text-gray-300 hover:text-white disabled:opacity-50">
      <Flag className="w-4 h-4" aria-hidden="true" />{t('Signaler cette réponse', 'Report this response')}
    </button>
    {open && <form id={id} onSubmit={submit} className="mt-2 space-y-3 rounded-xl border border-gray-600 p-3 bg-gray-950 text-gray-100 text-sm">
      <p>{t('La réponse affichée, le motif et votre commentaire seront envoyés à l’équipe Hailite Manager avec votre identifiant de compte. Les photos et les autres messages ne sont pas joints. N’ajoutez aucun NIP ni renseignement sensible.',
        'The displayed response, reason and your comment will be sent to the Hailite Manager team with your account ID. Photos and other messages are not included. Do not add a PIN or sensitive information.')}</p>
      <label className="block" htmlFor={`${id}-reason`}>{t('Motif', 'Reason')}</label>
      <select id={`${id}-reason`} value={reason} onChange={event => setReason(event.target.value)} disabled={busy}
        className="w-full min-h-11 p-2 rounded-lg bg-gray-800 border border-gray-600">
        <option value="unsafe">{t('Contenu dangereux ou illégal', 'Dangerous or illegal content')}</option>
        <option value="hateful">{t('Haine ou harcèlement', 'Hate or harassment')}</option>
        <option value="sexual">{t('Contenu sexuel inapproprié', 'Inappropriate sexual content')}</option>
        <option value="privacy">{t('Atteinte à la vie privée', 'Privacy concern')}</option>
        <option value="other">{t('Autre problème', 'Other concern')}</option>
      </select>
      <label className="block" htmlFor={`${id}-comment`}>{t('Commentaire (facultatif)', 'Comment (optional)')}</label>
      <textarea id={`${id}-comment`} value={comment} onChange={event => setComment(event.target.value)} maxLength={1000}
        disabled={busy} rows={3} className="w-full p-2 rounded-lg bg-gray-800 border border-gray-600" />
      {error && <p role="alert" className="text-amber-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-11 px-3 rounded-lg bg-orange-700 font-bold disabled:opacity-50">
          {busy ? t('Envoi…', 'Sending…') : t('Envoyer le signalement', 'Submit report')}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="min-h-11 px-3 rounded-lg border border-gray-600">
          {t('Annuler', 'Cancel')}
        </button>
      </div>
    </form>}
  </div>;
}
