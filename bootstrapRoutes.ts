import type express from 'express';
import { resolveCompanyId, supabase, supabaseEnabled } from './db.js';

/**
 * Informations publiques et non sensibles nécessaires à l'écran de démarrage.
 * Aucune adresse, coordonnée bancaire, clé API, donnée de paie ou donnée
 * d'employé n'est exposée ici.
 */
export function registerBootstrapRoutes(app: express.Express): void {
  app.get('/api/bootstrap', async (_req, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.json({ enabled: false, company: null });
    }

    try {
      const companyId = await resolveCompanyId();
      const { data, error } = await supabase
        .from('companies')
        .select([
          'name',
          'logo',
          'country',
          'region',
          'is_onboarded',
          'tax_rate1',
          'tax_rate2',
          'tax_rate1_name',
          'tax_rate2_name'
        ].join(','))
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;

      return res.json({
        enabled: true,
        company: data
          ? {
              name: data.name || 'Hailite Manager',
              logo: data.logo || '',
              country: data.country || 'CA',
              region: data.region || '',
              isOnboarded: data.is_onboarded ?? false,
              taxRate1: Number(data.tax_rate1 || 0),
              taxRate2: Number(data.tax_rate2 || 0),
              taxRate1Name: data.tax_rate1_name || '',
              taxRate2Name: data.tax_rate2_name || ''
            }
          : null
      });
    } catch (error: any) {
      console.error('Error on /api/bootstrap:', error);
      return res.status(500).json({ error: 'Impossible de charger l’identité de la compagnie' });
    }
  });
}
