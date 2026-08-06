import type express from 'express';
import { resolveCompanyId, supabase, supabaseEnabled } from './db.js';

interface PublicCompanyIdentity {
  name?: string | null;
  logo?: string | null;
  country?: string | null;
  region?: string | null;
  is_onboarded?: boolean | null;
  tax_rate1?: number | string | null;
  tax_rate2?: number | string | null;
  tax_rate1_name?: string | null;
  tax_rate2_name?: string | null;
  currency?: string | null;
  unit_system?: string | null;
  date_locale?: string | null;
  data_storage_mode?: string | null;
  cloud_region?: string | null;
  compliance_version?: string | null;
}

/** Informations non sensibles nécessaires à l'écran de démarrage. */
export function registerBootstrapRoutes(app: express.Express): void {
  app.get('/api/bootstrap', async (_req, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.json({ enabled: false, company: null });
    }

    try {
      const companyId = await resolveCompanyId();
      const { data, error } = await supabase
        .from('companies')
        .select('name,logo,country,region,is_onboarded,tax_rate1,tax_rate2,tax_rate1_name,tax_rate2_name,currency,unit_system,date_locale,data_storage_mode,cloud_region,compliance_version')
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;
      const company = data as unknown as PublicCompanyIdentity | null;

      return res.json({
        enabled: true,
        company: company
          ? {
              name: company.name || 'Hailite Manager',
              logo: company.logo || '',
              country: company.country || 'CA',
              region: company.region || '',
              isOnboarded: company.is_onboarded ?? false,
              taxRate1: Number(company.tax_rate1 || 0),
              taxRate2: Number(company.tax_rate2 || 0),
              taxRate1Name: company.tax_rate1_name || '',
              taxRate2Name: company.tax_rate2_name || '',
              currency: company.currency || 'CAD',
              unitSystem: company.unit_system || 'imperial',
              dateLocale: company.date_locale || 'fr-CA',
              dataStorageMode: company.data_storage_mode || 'hybrid',
              cloudRegion: company.cloud_region || 'ca-central-1',
              complianceVersion: company.compliance_version || ''
            }
          : null
      });
    } catch (error: any) {
      console.error('Error on /api/bootstrap:', error);
      return res.status(500).json({ error: 'Impossible de charger l’identité de la compagnie' });
    }
  });
}
