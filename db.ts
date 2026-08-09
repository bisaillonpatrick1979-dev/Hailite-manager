// Charge .env avant de lire process.env ci-dessous : ce module est importé en
// tête de server.ts, donc son code s'exécute avant l'appel dotenv.config() de
// server.ts (l'évaluation des imports ES précède le corps du module).
import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Les nouvelles clés `sb_secret_...` sont privilégiées. La clé service_role
// historique demeure acceptée afin de permettre une migration sans coupure.
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = !!(supabaseUrl && supabaseServerKey);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(supabaseUrl as string, supabaseServerKey as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  : null;

// Toute table exposée par l'API générique porte company_id. Cela permet aux
// routes utilisant la service_role de toujours ajouter un filtre de tenant,
// y compris pour les anciennes tables enfants.
export const TABLES_WITH_COMPANY_ID = new Set([
  'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'tool_assets', 'tool_theft_reports',
  'supplier_orders', 'supplier_order_items', 'clients', 'documents', 'document_items', 'document_payments',
  'payroll_entries', 'payroll_payments', 'production_entries', 'weekly_goals',
  'motivation_teams', 'motivation_goals', 'hr_alerts', 'expenses',
  'project_photos', 'change_orders', 'insurance_claims', 'leads', 'shift_assignments', 'safety_records'
]);

// Tables dont la clé primaire n'est pas "id"
export const TABLE_ID_COLUMN: Record<string, string> = {
  weekly_goals: 'employee_id'
};

let cachedCompanyId: string | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Résolution publique utilisée seulement avant la connexion (bootstrap et
// annuaire). Dès qu'une session existe, auth.companyId est l'unique source de
// vérité. Avec plusieurs compagnies, DEFAULT_COMPANY_ID devient obligatoire :
// choisir arbitrairement la première ligne serait une fuite interentreprises.
export async function resolveCompanyId(): Promise<string> {
  if (cachedCompanyId) return cachedCompanyId;
  if (!supabase) throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SECRET_KEY manquants)');

  const configured = String(process.env.DEFAULT_COMPANY_ID || '').trim();
  if (configured) {
    if (!UUID_RE.test(configured)) throw new Error('DEFAULT_COMPANY_ID invalide');
    const { data, error } = await supabase.from('companies').select('id').eq('id', configured).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('DEFAULT_COMPANY_ID ne correspond à aucune compagnie');
    cachedCompanyId = configured;
    return configured;
  }

  const { data: companies, error: selectErr } = await supabase
    .from('companies')
    .select('id')
    .limit(2);
  if (selectErr) throw selectErr;

  if ((companies || []).length === 1) {
    cachedCompanyId = String(companies![0].id);
    return cachedCompanyId;
  }

  if ((companies || []).length > 1) {
    throw new Error('Plusieurs compagnies existent : DEFAULT_COMPANY_ID est requis pour les routes publiques');
  }

  // Une simple requête publique de démarrage ne doit jamais provisionner un
  // tenant. La première compagnie est créée par une migration ou un flux
  // d'administration explicitement autorisé.
  throw new Error('Aucune compagnie configurée; provisionnement administrateur requis');
}
