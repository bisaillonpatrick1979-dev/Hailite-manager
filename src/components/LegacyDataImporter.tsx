import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileJson, FileSpreadsheet, Import, RotateCcw, Upload } from 'lucide-react';
import {
  detectMigrationType, getMigrationFields, importMappedMigrationRows, MIGRATION_TYPE_LABELS,
  parseMigrationFile, suggestMigrationMapping,
  type MigrationDataType, type ParsedMigrationFile
} from '../dataMigration';
import { importApplicationBackup } from '../personalBackup';

interface LegacyDataImporterProps {
  isFR: boolean;
  onImported?: (count: number) => void;
}

export default function LegacyDataImporter({ isFR, onImported }: LegacyDataImporterProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const backupRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedMigrationFile | null>(null);
  const [type, setType] = useState<MigrationDataType>('clients');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [totalImported, setTotalImported] = useState(0);

  const fields = useMemo(() => getMigrationFields(type), [type]);
  const preview = parsed?.rows.slice(0, 5) || [];

  const loadGeneric = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage(''); setOk(false);
    try {
      const result = await parseMigrationFile(file);
      if (!result.rows.length) throw new Error('EMPTY');
      const detected = result.detectedType || detectMigrationType(result.columns);
      setParsed(result);
      setType(detected);
      setMapping(suggestMigrationMapping(detected, result.columns));
      setMessage(isFR
        ? `${result.rows.length} lignes détectées. Vérifiez les associations de colonnes avant l’importation.`
        : `${result.rows.length} rows detected. Review column mapping before import.`);
    } catch (error: any) {
      setParsed(null);
      setMessage(error?.message === 'FILE_TOO_LARGE'
        ? (isFR ? 'Le fichier dépasse 50 Mo.' : 'The file exceeds 50 MB.')
        : (isFR ? 'Le fichier CSV ou JSON ne peut pas être analysé.' : 'The CSV or JSON file cannot be parsed.'));
    } finally { setBusy(false); }
  };

  const changeType = (next: MigrationDataType) => {
    setType(next);
    if (parsed) setMapping(suggestMigrationMapping(next, parsed.columns));
  };

  const runImport = () => {
    if (!parsed) return;
    const result = importMappedMigrationRows({ type, rows: parsed.rows, mapping });
    setOk(result.ok);
    setMessage(isFR
      ? `${result.imported} élément(s) importé(s), ${result.skipped} ignoré(s).`
      : `${result.imported} item(s) imported, ${result.skipped} skipped.`);
    if (result.ok) {
      const next = totalImported + result.imported;
      setTotalImported(next);
      onImported?.(next);
      setParsed(null);
      setMapping({});
    }
  };

  const restoreNative = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const result = await importApplicationBackup(file);
    setBusy(false); setOk(result.ok);
    setMessage(isFR
      ? result.message
      : result.ok ? `${result.count} data sections restored.` : 'Invalid Hailite Manager backup file.');
    if (result.ok) {
      setTotalImported(current => current + result.count);
      onImported?.(totalImported + result.count);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
        <h3 className="flex items-center gap-2 text-lg font-black text-cyan-100"><Import className="h-5 w-5" />{isFR ? 'Changer d’application sans perdre vos données' : 'Switch applications without losing data'}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {isFR
            ? 'Importez les données de votre année fiscale déjà commencée : clients, chantiers, employés, heures, contrats, devis, factures, dépenses, paie, fournisseurs, inventaire et outils. Cette étape est facultative et peut être répétée plus tard.'
            : 'Import data from an already-started fiscal year: clients, projects, employees, hours, contracts, quotes, invoices, expenses, payroll, suppliers, inventory, and tools. This step is optional and can be repeated later.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => backupRef.current?.click()} className="min-h-24 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left disabled:opacity-40">
          <FileJson className="h-7 w-7 text-emerald-300" /><b className="mt-2 block text-white">{isFR ? 'Restaurer une sauvegarde Hailite' : 'Restore a Hailite backup'}</b><span className="text-xs text-slate-400">JSON complet créé par Hailite Manager</span>
        </button>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="min-h-24 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-left disabled:opacity-40">
          <FileSpreadsheet className="h-7 w-7 text-blue-300" /><b className="mt-2 block text-white">{isFR ? 'Importer d’un autre logiciel' : 'Import from another app'}</b><span className="text-xs text-slate-400">CSV ou JSON exporté par l’ancien logiciel</span>
        </button>
        <input ref={backupRef} type="file" accept="application/json,.json" className="hidden" onChange={event => { restoreNative(event.target.files?.[0]); event.target.value = ''; }} />
        <input ref={inputRef} type="file" accept="text/csv,.csv,application/json,.json,text/plain" className="hidden" onChange={event => { loadGeneric(event.target.files?.[0]); event.target.value = ''; }} />
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        {isFR
          ? 'Chaque logiciel exporte ses données différemment. Hailite détecte les colonnes courantes, mais vous devez vérifier l’association avant l’importation. Les pièces jointes, signatures et clauses complexes peuvent nécessiter un ajout manuel si elles ne figurent pas dans le fichier exporté.'
          : 'Every app exports data differently. Hailite detects common columns, but you must review the mapping before import. Attachments, signatures, and complex clauses may require manual addition if they are not present in the export.'}
      </div>

      {parsed && (
        <div className="space-y-5 rounded-3xl border border-blue-500/30 bg-slate-950 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black text-white">{parsed.fileName}</p><p className="text-xs text-slate-400">{parsed.rows.length} {isFR ? 'lignes' : 'rows'} · {parsed.columns.length} {isFR ? 'colonnes' : 'columns'}</p></div>
            <button type="button" onClick={() => { setParsed(null); setMapping({}); }} className="min-h-10 rounded-xl border border-slate-700 px-3 text-xs font-black text-slate-300"><RotateCcw className="mr-1 inline h-4 w-4" />{isFR ? 'Recommencer' : 'Start over'}</button>
          </div>

          <label className="block"><span className="mb-2 block font-black text-slate-200">{isFR ? 'Type de données dans ce fichier' : 'Data type in this file'}</span><select value={type} onChange={event => changeType(event.target.value as MigrationDataType)} className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3">{(Object.keys(MIGRATION_TYPE_LABELS) as MigrationDataType[]).map(item => <option key={item} value={item}>{isFR ? MIGRATION_TYPE_LABELS[item].fr : MIGRATION_TYPE_LABELS[item].en}</option>)}</select></label>

          <div><h4 className="font-black text-white">{isFR ? 'Association des colonnes' : 'Column mapping'}</h4><div className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(field => <label key={field.key} className="rounded-xl border border-slate-700 bg-slate-900 p-3"><span className="mb-2 block text-xs font-black text-slate-300">{isFR ? field.labelFR : field.labelEN}{field.required ? ' *' : ''}</span><select value={mapping[field.key] || ''} onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm"><option value="">{isFR ? 'Ne pas importer' : 'Do not import'}</option>{parsed.columns.map(column => <option key={column} value={column}>{column}</option>)}</select></label>)}</div></div>

          <div className="overflow-x-auto rounded-xl border border-slate-700"><table className="min-w-full text-xs"><thead className="bg-slate-900"><tr>{parsed.columns.slice(0, 8).map(column => <th key={column} className="whitespace-nowrap p-2 text-left text-slate-300">{column}</th>)}</tr></thead><tbody>{preview.map((row, index) => <tr key={index} className="border-t border-slate-800">{parsed.columns.slice(0, 8).map(column => <td key={column} className="max-w-48 truncate p-2 text-slate-400">{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div>

          <button type="button" onClick={runImport} className="min-h-13 w-full rounded-xl bg-blue-600 px-5 font-black text-white"><Upload className="mr-2 inline h-5 w-5" />{isFR ? `Importer ${parsed.rows.length} ligne(s)` : `Import ${parsed.rows.length} row(s)`}</button>
        </div>
      )}

      {message && <div className={`rounded-xl border p-3 text-sm ${ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{ok && <Check className="mr-2 inline h-4 w-4" />}{message}</div>}
      {totalImported > 0 && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center"><b className="text-2xl text-emerald-200">{totalImported}</b><p className="text-xs text-emerald-100">{isFR ? 'éléments migrés pendant cette configuration' : 'items migrated during this setup'}</p></div>}
    </div>
  );
}
