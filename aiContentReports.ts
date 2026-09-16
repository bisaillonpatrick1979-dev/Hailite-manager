import type express from 'express';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, type AuthedRequest } from './auth.js';
import { supabase } from './db.js';

const REASONS = new Set(['unsafe', 'hateful', 'sexual', 'privacy', 'other']);
const PROVIDERS = new Set(['gemini', 'openai', 'anthropic']);

export interface AiReportEntry {
  id: string;
  at: string;
  user_id: string;
  company_id: string;
  action: 'ai_content_report';
  target: 'ai';
  details: {
    reason: string;
    response: string;
    comment: string;
    provider: string;
    source: string;
    reviewStatus: 'new';
  };
}

type SaveReport = (entry: AiReportEntry) => Promise<void>;

// Reports must be durably saved before acknowledging them. logAudit is
// deliberately best-effort and must not be used for this user-facing action.
const saveReport: SaveReport = async entry => {
  if (!supabase) throw new Error('REPORT_STORAGE_UNAVAILABLE');
  const { error } = await supabase.from('audit_logs').insert(entry);
  if (error) throw error;
};

export function registerAiContentReportRoutes(app: express.Express, save: SaveReport = saveReport): void {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => (req as AuthedRequest).auth!.userId,
    message: { code: 'REPORT_RATE_LIMITED' }
  });

  app.post('/api/ai/reports', requireAuth, limiter, async (req: AuthedRequest, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || typeof body.response !== 'string' || !body.response.trim() || body.response.length > 16000
      || typeof body.reason !== 'string' || !REASONS.has(body.reason)
      || (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.length > 1000))
      || typeof body.provider !== 'string' || !PROVIDERS.has(body.provider)
      || !['main', 'assistant'].includes(body.source)) {
      return res.status(400).json({ code: 'INVALID_REPORT' });
    }

    const entry: AiReportEntry = {
      id: randomUUID(),
      at: new Date().toISOString(),
      // Identity and organization always come from the authenticated session.
      user_id: req.auth!.userId,
      company_id: req.auth!.companyId,
      action: 'ai_content_report',
      target: 'ai',
      details: {
        reason: body.reason,
        response: body.response.trim(),
        comment: (body.comment || '').trim(),
        provider: body.provider,
        source: body.source,
        reviewStatus: 'new'
      }
    };
    try {
      await save(entry);
      return res.status(201).json({ reportId: entry.id });
    } catch {
      // Do not put the reported content, identity, or provider errors in logs.
      return res.status(503).json({ code: 'REPORT_NOT_SAVED' });
    }
  });
}
