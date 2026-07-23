from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'components' / 'CatalogueManager.tsx'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    text = text.replace(old, new, 1)


# Message visible après une mise à jour, afin que l’utilisateur sache que le
# produit existant a été modifié et qu’aucun doublon n’a été créé.
replace_once(
    "  const [newSupplierPhone, setNewSupplierPhone] = useState('');\n",
    """  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [priceUpdateNotice, setPriceUpdateNotice] = useState('');
""",
    'état confirmation prix'
)

replace_once(
    """    setEditingId(null);
  };
""",
    """    setEditingId(null);
    setPriceUpdateNotice(currentLanguage === 'FR'
      ? `Les prix de « ${editForm.name} » ont été mis à jour. Aucun nouveau matériau n’a été créé.`
      : `Prices for “${editForm.name}” were updated. No new material was created.`);
    window.setTimeout(() => setPriceUpdateNotice(''), 5000);
  };
""",
    'confirmation sauvegarde prix'
)

# Affiche une confirmation compacte au-dessus du catalogue.
header_anchor = """      </div>

      {/* Supplier Manager */}
"""
header_replacement = """      </div>

      {priceUpdateNotice && (
        <div role="status" className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-200">
          <Check className="mr-2 inline h-4 w-4" />
          {priceUpdateNotice}
        </div>
      )}

      {/* Supplier Manager */}
"""
replace_once(header_anchor, header_replacement, 'avis mise à jour catalogue')

# Rend l’éditeur existant beaucoup plus explicite, avec les prix au cœur de la
# fiche et un rappel concernant les anciens documents.
edit_anchor = """              <div key={cat.id} className="p-4 bg-gray-900 border border-orange-500/40 rounded-2xl text-xs space-y-3 text-left">
                <input
"""
edit_replacement = """              <div key={cat.id} className="p-4 bg-gray-900 border border-orange-500/40 rounded-2xl text-xs space-y-4 text-left">
                <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-3">
                  <h5 className="text-base font-black text-white">
                    {currentLanguage === 'FR' ? 'Modifier les prix du matériau' : 'Edit material prices'}
                  </h5>
                  <p className="mt-1 text-xs leading-relaxed text-gray-300">
                    {currentLanguage === 'FR'
                      ? 'Modifiez librement le prix fournisseur, le prix sous-traitant et le prix client. Cette action met à jour le matériau existant sans en créer un autre.'
                      : 'Update the supplier, subcontractor, and client prices freely. This updates the existing material without creating another one.'}
                  </p>
                </div>
                <input
"""
replace_once(edit_anchor, edit_replacement, 'entête éditeur prix')

price_anchor = """                {renderPriceFields(editForm, setEditForm)}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-850">
"""
price_replacement = """                <div className="rounded-xl border border-gray-800 bg-black/20 p-3">
                  <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-orange-300">
                    {currentLanguage === 'FR' ? 'Prix modifiables en tout temps' : 'Prices editable at any time'}
                  </p>
                  {renderPriceFields(editForm, setEditForm)}
                  <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                    {currentLanguage === 'FR'
                      ? 'Les nouveaux prix seront proposés pour les prochains devis, contrats et factures. Les documents déjà enregistrés conservent leurs montants historiques.'
                      : 'New prices will be used for future quotes, contracts, and invoices. Existing documents keep their historical amounts.'}
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-850">
"""
replace_once(price_anchor, price_replacement, 'bloc prix éditable')

save_anchor = """                    <Check className="w-3.5 h-3.5" /> {t.saveBtn}
"""
save_replacement = """                    <Check className="w-3.5 h-3.5" />
                    {currentLanguage === 'FR' ? 'Enregistrer les nouveaux prix' : 'Save new prices'}
"""
replace_once(save_anchor, save_replacement, 'libellé sauvegarde prix')

button_anchor = """                    <Edit className="w-3.5 h-3.5" />
                    <span>{t.editBtn}</span>
"""
button_replacement = """                    <Edit className="w-3.5 h-3.5" />
                    <span>{currentLanguage === 'FR' ? 'Modifier les prix' : 'Edit prices'}</span>
"""
replace_once(button_anchor, button_replacement, 'bouton modifier prix')

path.write_text(text, encoding='utf-8')
print('Modification claire des prix du catalogue intégrée sans création de doublon.')
