from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# STORE — défense en profondeur : le contenu d’un contrat signé ne peut plus
# être modifié ou supprimé, même si une interface appelle directement le store.
# La transition opérationnelle « accepté -> travaux terminés » reste permise.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')

update_anchor = """  updateGCPDocument: (doc) => {
    const { documents } = get();
    
    // Recompute on update to keep financials robust and fresh
"""
update_guard = """  updateGCPDocument: (doc) => {
    const { documents } = get();

    // SIGNED_CONTRACT_CONTENT_LOCK — les données juridiques et financières
    // d’un contrat signé restent un instantané immuable. Seule la progression
    // opérationnelle vers « completed » est acceptée après la signature.
    const existingDocument = documents.find(item => item.id === doc.id);
    const existingIsSignedContract = Boolean(
      existingDocument?.type === 'contract' &&
      existingDocument.clientSignature &&
      existingDocument.ownerSignature &&
      existingDocument.signedAt
    );
    if (existingDocument && existingIsSignedContract) {
      if (existingDocument.status === 'accepted' && doc.status === 'completed') {
        const lifecycleDocument: GCPDocument = { ...existingDocument, status: 'completed' };
        const lifecycleDocuments = documents.map(item => item.id === doc.id ? lifecycleDocument : item);
        set({ documents: lifecycleDocuments });
        saveState('gcp_documents', lifecycleDocuments);
        syncUpdate('documents', doc.id, documentToRow(lifecycleDocument));
      }
      return;
    }
    
    // Recompute on update to keep financials robust and fresh
"""
text = replace_once(text, update_anchor, update_guard, 'verrou store mise à jour contrat')

delete_anchor = """  deleteGCPDocument: (id) => {
    const { documents } = get();
    const updated = documents.filter(d => d.id !== id);
"""
delete_guard = """  deleteGCPDocument: (id) => {
    const { documents } = get();
    const target = documents.find(item => item.id === id);
    const targetIsSignedContract = Boolean(
      target?.type === 'contract' && target.clientSignature && target.ownerSignature && target.signedAt
    );
    if (targetIsSignedContract) return;
    const updated = documents.filter(d => d.id !== id);
"""
text = replace_once(text, delete_anchor, delete_guard, 'verrou store suppression contrat')
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# DOCUMENT MANAGER — formulaire commun de création/modification, contrat
# brouillon modifiable, signature en deux parties, puis verrou définitif.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

text = text.replace(
    "  CreditCard, X, ChevronDown, Check, Coins, Layers, HardHat\n",
    "  CreditCard, X, ChevronDown, Check, Coins, Layers, HardHat, Lock\n"
)

text = replace_once(
    text,
    "  const [sourceDocument, setSourceDocument] = useState<GCPDocument | null>(null);\n",
    """  const [sourceDocument, setSourceDocument] = useState<GCPDocument | null>(null);
  const [editingDocument, setEditingDocument] = useState<GCPDocument | null>(null);
""",
    'état document en modification'
)

text = replace_once(
    text,
    "  const [newDueDate, setNewDueDate] = useState('');\n",
    """  const [newDueDate, setNewDueDate] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
""",
    'état adresse chantier document'
)

if 'const isSignedContract = (doc: GCPDocument)' not in text:
    clause_end = """  const clausePresets = {
    changeOrder: "Toute modification ou travaux additionnels feront l'objet d'un avenant écrit (Ordre de changement) décrivant les coûts additionnels et les impacts sur l'échéancier global, dûment signé par les deux parties avant l'exécution.",
    resiliation: "En cas de résiliation volontaire par le client par simple avis écrit, l'acompte de signature de 25% sera intégralement conservé par l'entrepreneur à titre de dommages-intérêts fixes pour couvrir les frais de dossier, de logistique et d'ingénierie.",
    warranty: "L'entrepreneur garantit la pose mécanique du revêtement extérieur pour une période de 10 ans selon la norme de l'AEPQ. La garantie du fabricant s'applique séparément sur les matériaux.",
    holdback: "Retenue de garantie contractuelle limitée à un maximum de 10% de la valeur des travaux en vertu de la loi sur le privilège de construction, libérable 45 jours après la réception finale de l'ouvrage sans réserve."
  };
"""
    lock_helper = clause_end + """

  const isSignedContract = (doc: GCPDocument): boolean => Boolean(
    doc.type === 'contract' && doc.clientSignature && doc.ownerSignature && doc.signedAt
  );
"""
    text = replace_once(text, clause_end, lock_helper, 'détection contrat signé')

text = text.replace(
    "  const resetCreateForm = () => {\n    setSourceDocument(null);\n",
    "  const resetCreateForm = () => {\n    setSourceDocument(null);\n    setEditingDocument(null);\n"
)
text = text.replace(
    "    setNewDueDate(new Date(Date.now() + 30 * 24 * 3600000).toISOString().split('T')[0]);\n",
    "    setNewDueDate(new Date(Date.now() + 30 * 24 * 3600000).toISOString().split('T')[0]);\n    setNewSiteAddress(clients[0]?.address || '');\n",
    1
)

# Le parcours de création initialise aussi l’adresse de chantier.
text = text.replace(
    """    if (!source) {
      setNewClientId(clients[0]?.id || '');
      return;
    }
""",
    """    if (!source) {
      setNewClientId(clients[0]?.id || '');
      setNewSiteAddress(clients[0]?.address || '');
      return;
    }
"""
)
text = text.replace(
    "    setNewClientId(source.clientId);\n",
    "    setNewClientId(source.clientId);\n    setNewSiteAddress(source.siteAddress || source.clientAddress || '');\n",
    1
)

# Charge toutes les informations d’un document existant dans le même formulaire.
handle_anchor = "  const handleCreateDocument = () => {\n"
if 'const openEditDocument = (doc: GCPDocument)' not in text:
    edit_helper = """  const openEditDocument = (doc: GCPDocument) => {
    if (isSignedContract(doc)) {
      alert(currentLanguage === 'FR'
        ? 'Ce contrat est signé. Son contenu est verrouillé définitivement.'
        : 'This contract is signed. Its content is permanently locked.');
      return;
    }

    resetCreateForm();
    setEditingDocument(doc);
    setSourceDocument(null);
    setNewDocType(doc.type);
    setNewClientId(doc.clientId);
    setNewDueDate(doc.dueDate);
    setNewSiteAddress(doc.siteAddress || doc.clientAddress || '');
    setNewIsSimple(doc.isSimpleLayout);
    setSimpleLines(doc.lineItems.map(line => ({
      desc: line.description,
      qty: line.qty,
      unit: line.unit,
      price: line.unitPrice
    })));
    setRichMaterials(doc.materialLines.map(line => ({
      claddingType: line.claddingType,
      brand: line.brand,
      thickness: line.thickness,
      qtySqft: line.qtySqft,
      supplier: line.supplier,
      price: line.unitPrice
    })));
    setRichLabours(doc.labourLines.map(line => ({
      task: line.task,
      hours: line.estimatedHours,
      rate: line.rate,
      isFlat: line.isFlatRate
    })));
    setRichOthers(doc.otherLines.map(line => ({ desc: line.description, amount: line.amount })));
    setRichSubcontracts(doc.subcontractLines.map(line => ({
      companyName: line.companyName,
      phone: line.phone,
      workType: line.workType,
      amount: line.amount
    })));
    setDiscountPct(doc.discountPct || 0);
    setHoldbackPct(doc.holdbackPct || 0);
    setDepositAmount(doc.depositAmount || 0);
    setDepositPct(doc.depositPct || 25);
    setMidPct(doc.paymentMidPct || 25);
    setFinalPct(doc.paymentFinalPct || 50);
    setWarrantyYears(doc.warrantyYears || companyInfo.defaultWarrantyYears || 2);
    setHasInsurance(doc.hasInsurance);
    setSubcontractAuthorized(doc.subcontractAuthorized);
    setRemarks(doc.contractObject || '');
    setClauseChange(doc.clauseChangeOrder || companyInfo.defaultClauseChangeOrder || clausePresets.changeOrder);
    setClauseResil(doc.clauseResiliation || companyInfo.defaultClauseResiliation || clausePresets.resiliation);
    setClauseWarr(doc.clauseWarrantyDetails || clausePresets.warranty);
    setOwnerSignatureData(doc.ownerSignature || null);
    setClientSignatureData(doc.clientSignature || null);
    setSignaturePadResetKey(key => key + 1);
    setShowCreateModal(true);
  };

"""
    text = replace_once(text, handle_anchor, edit_helper + handle_anchor, 'assistant modification document')

# Remplace le gestionnaire de création par une fonction création OU mise à jour.
start = text.find("  const handleCreateDocument = () => {")
end = text.find("\n  const handleCapturePayment", start)
if start == -1 or end == -1:
    raise RuntimeError(f'Gestionnaire document introuvable: debut={start}, fin={end}')

save_handler = """  const handleCreateDocument = () => {
    const cli = clients.find(c => c.id === newClientId) || clients[0];
    if (!cli) {
      alert(t.cdmSelectClientFirst);
      return;
    }
    if (editingDocument && isSignedContract(editingDocument)) {
      alert(currentLanguage === 'FR'
        ? 'Ce contrat est déjà signé et ne peut plus être modifié.'
        : 'This contract is already signed and can no longer be edited.');
      return;
    }

    const hasOwnerSignature = Boolean(ownerSignatureData);
    const hasClientSignature = Boolean(clientSignatureData);
    if (newDocType !== 'contract' && !hasOwnerSignature) {
      alert(t.cdmContractorSignRequired);
      return;
    }
    if (newDocType === 'contract' && hasOwnerSignature !== hasClientSignature) {
      alert(currentLanguage === 'FR'
        ? 'Pour signer le contrat, la signature de l’entrepreneur ET celle du client sont requises. Effacez les deux signatures pour garder un brouillon modifiable.'
        : 'To sign the contract, both contractor and client signatures are required. Clear both signatures to keep an editable draft.');
      return;
    }

    const contractWillBeSigned = newDocType === 'contract' && hasOwnerSignature && hasClientSignature;
    const idFor = (group: 'simple' | 'material' | 'labour' | 'other' | 'subcontract', index: number): string => {
      if (!editingDocument) return genId();
      if (group === 'simple') return editingDocument.lineItems[index]?.id || genId();
      if (group === 'material') return editingDocument.materialLines[index]?.id || genId();
      if (group === 'labour') return editingDocument.labourLines[index]?.id || genId();
      if (group === 'other') return editingDocument.otherLines[index]?.id || genId();
      return editingDocument.subcontractLines[index]?.id || genId();
    };

    const lineItems: GCPDocumentLineItem[] = simpleLines
      .filter(line => line.desc.trim() || Number(line.qty) || Number(line.price))
      .map((line, index) => ({
        id: idFor('simple', index),
        description: line.desc.trim(),
        qty: Number(line.qty) || 0,
        unit: line.unit,
        unitPrice: Number(line.price) || 0,
        total: Number(((line.qty || 0) * (line.price || 0)).toFixed(2))
      }));
    const materialLines: GCPDocumentMaterialLine[] = richMaterials.map((line, index) => ({
      id: idFor('material', index),
      claddingType: line.claddingType,
      brand: line.brand,
      thickness: line.thickness,
      qtySqft: Number(line.qtySqft) || 0,
      supplier: line.supplier,
      unitPrice: Number(line.price) || 0,
      total: Number(((line.qtySqft || 0) * (line.price || 0)).toFixed(2))
    }));
    const labourLines: GCPDocumentLabourLine[] = richLabours.map((line, index) => ({
      id: idFor('labour', index),
      task: line.task,
      estimatedHours: Number(line.hours) || 0,
      rate: Number(line.rate) || 0,
      isFlatRate: line.isFlat,
      total: line.isFlat ? Number(line.rate) || 0 : Number(((line.hours || 0) * (line.rate || 0)).toFixed(2))
    }));
    const otherLines: GCPDocumentOtherLine[] = richOthers.map((line, index) => ({
      id: idFor('other', index),
      description: line.desc,
      amount: Number(line.amount) || 0
    }));
    const subcontractLines: GCPDocumentSubcontractLine[] = richSubcontracts.map((line, index) => ({
      id: idFor('subcontract', index),
      companyName: line.companyName,
      phone: line.phone,
      workType: line.workType,
      amount: Number(line.amount) || 0
    }));

    const unsignedContractStatus = editingDocument && ['draft', 'sent'].includes(editingDocument.status)
      ? editingDocument.status
      : 'draft';
    const nextStatus = newDocType === 'contract'
      ? contractWillBeSigned
        ? (editingDocument?.status === 'completed' ? 'completed' : 'accepted')
        : unsignedContractStatus
      : (editingDocument?.status || 'draft');
    const now = new Date().toISOString();

    const commonDocument = {
      type: newDocType,
      date: editingDocument?.date || new Date().toISOString().split('T')[0],
      dueDate: newDueDate,
      status: nextStatus as GCPDocument['status'],
      refQuote: editingDocument?.refQuote || (newDocType === 'contract' && sourceDocument?.type === 'quote' ? sourceDocument.number : newDocType === 'invoice' ? sourceDocument?.refQuote : undefined),
      refContract: editingDocument?.refContract || (newDocType === 'invoice' && sourceDocument?.type === 'contract' ? sourceDocument.number : undefined),
      clientId: cli.id,
      clientName: cli.name,
      clientAddress: cli.address,
      clientEmail: cli.email,
      clientPhone: cli.phone,
      siteAddress: newSiteAddress.trim() || cli.address,
      isSimpleLayout: newIsSimple,
      lineItems,
      materialLines,
      labourLines,
      otherLines,
      subcontractLines,
      subtotal: editingDocument?.subtotal || 0,
      discountPct: Number(discountPct) || 0,
      taxRate: Number((((companyInfo.taxRate1 !== undefined ? companyInfo.taxRate1 : 0.05) + (companyInfo.taxRate2 !== undefined ? companyInfo.taxRate2 : 0.09975)) * 100).toFixed(4)),
      taxAmount: editingDocument?.taxAmount || 0,
      total: editingDocument?.total || 0,
      holdbackPct: Number(holdbackPct) || 0,
      holdbackAmount: editingDocument?.holdbackAmount || 0,
      depositAmount: Number(depositAmount) || 0,
      balanceDue: editingDocument?.balanceDue || 0,
      acceptedPayments: editingDocument?.acceptedPayments || (['virement', 'etransfer'] as Array<'virement' | 'etransfer'>),
      lateInterestPct: editingDocument?.lateInterestPct || 2,
      depositPct,
      paymentMidPct: midPct,
      paymentFinalPct: finalPct,
      quoteValidDays: editingDocument?.quoteValidDays || 30,
      permitBy: editingDocument?.permitBy || ('contractor' as const),
      warrantyYears,
      hasInsurance,
      subcontractAuthorized,
      contractObject: remarks || `Remplacement et pose méticuleuse du revêtement extérieur chez ${cli.name}.`,
      clauseChangeOrder: clauseChange,
      clauseResiliation: clauseResil,
      clauseWarrantyDetails: clauseWarr,
      ownerName: editingDocument?.ownerName || companyInfo.name || 'Hailite Xteriors Inc.',
      paymentsHistory: editingDocument?.paymentsHistory || [],
      clientSignature: newDocType === 'contract' && contractWillBeSigned ? (clientSignatureData || undefined) : undefined,
      ownerSignature: newDocType === 'contract'
        ? (contractWillBeSigned ? (ownerSignatureData || undefined) : undefined)
        : (ownerSignatureData || undefined),
      signedAt: newDocType === 'contract'
        ? (contractWillBeSigned ? (editingDocument?.signedAt || now) : undefined)
        : (editingDocument?.signedAt || now)
    };

    if (editingDocument) {
      updateGCPDocument({
        ...editingDocument,
        ...commonDocument,
        id: editingDocument.id,
        number: editingDocument.number
      });
    } else {
      addGCPDocument(commonDocument);
    }

    setShowCreateModal(false);
    setActiveTypeTab(newDocType);
    setActiveStatusTab('all');
    resetCreateForm();
  };
"""
text = text[:start] + save_handler + text[end:]

# Le client choisi met à jour l’adresse proposée, qui demeure modifiable.
text = text.replace(
    "onChange={e => setNewClientId(e.target.value)}",
    """onChange={e => {
                      setNewClientId(e.target.value);
                      const selectedClient = clients.find(client => client.id === e.target.value);
                      if (selectedClient) setNewSiteAddress(selectedClient.address || '');
                    }}""",
    1
)

site_address_block = """              {/* Adresse réelle des travaux — modifiable indépendamment de l’adresse de facturation. */}
              <div className="space-y-1.5">
                <label className="text-gray-400">{currentLanguage === 'FR' ? 'Adresse du chantier / des travaux' : 'Project / work address'}</label>
                <input
                  type="text"
                  value={newSiteAddress}
                  onChange={event => setNewSiteAddress(event.target.value)}
                  placeholder={currentLanguage === 'FR' ? 'Adresse où les travaux seront exécutés' : 'Address where the work will be performed'}
                  className="w-full rounded-lg border border-gray-800 bg-gray-900 p-2 text-sm text-white outline-none focus:border-orange-500"
                />
              </div>

"""
layout_anchor = "              {/* Layout layout option toggler */}\n"
if site_address_block not in text:
    text = replace_once(text, layout_anchor, site_address_block + layout_anchor, 'adresse chantier formulaire document')

# Ajout/suppression de lignes simples pour répondre aux changements demandés.
old_simple_header = """                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">{t.cdmMainFlatLine}</span>
                  </div>
"""
new_simple_header = """                  <div className="flex justify-between items-center mb-1 gap-3">
                    <span className="font-bold text-white">{t.cdmMainFlatLine}</span>
                    <button
                      type="button"
                      onClick={() => setSimpleLines([...simpleLines, { desc: '', qty: 1, unit: 'unité', price: 0 }])}
                      className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-orange-300 hover:bg-orange-500/20"
                    >
                      + {currentLanguage === 'FR' ? 'Ajouter une ligne' : 'Add line'}
                    </button>
                  </div>
"""
text = replace_once(text, old_simple_header, new_simple_header, 'ajout ligne simple')
text = text.replace('className="grid grid-cols-7 gap-2 items-center"', 'className="grid grid-cols-8 gap-2 items-center"', 1)

price_input = """                      <input
                        type="number"
                        min="0"
                        value={l.price}
                        onChange={e => {
                          const dup = [...simpleLines];
                          dup[idx].price = Math.max(0, parseFloat(e.target.value) || 0);
                          setSimpleLines(dup);
                        }}
                        placeholder="$/unit"
                        className="col-span-2 bg-gray-900 border border-gray-800 text-white rounded p-1.5 text-xs text-right"
                      />
"""
price_with_delete = price_input + """                      <button
                        type="button"
                        onClick={() => setSimpleLines(simpleLines.filter((_, lineIndex) => lineIndex !== idx))}
                        className="col-span-1 flex h-9 items-center justify-center rounded border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                        aria-label={currentLanguage === 'FR' ? 'Supprimer la ligne' : 'Delete line'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
"""
text = replace_once(text, price_input, price_with_delete, 'suppression ligne simple')

# Les signatures du contrat sont facultatives tant qu’il demeure brouillon.
text = text.replace(
    """                    value={ownerSignatureData}
                    onChange={setOwnerSignatureData}
                    required
""",
    """                    value={ownerSignatureData}
                    onChange={setOwnerSignatureData}
                    required={newDocType !== 'contract'}
""",
    1
)
text = text.replace(
    """                      value={clientSignatureData}
                      onChange={setClientSignatureData}
                      required
""",
    """                      value={clientSignatureData}
                      onChange={setClientSignatureData}
                      required={false}
""",
    1
)

signature_anchor = "              {/* Signatures tactiles réelles (dessinées au doigt ou à la souris) */}\n"
signature_notice = """              {newDocType === 'contract' && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                    <div>
                      <p className="font-black">{currentLanguage === 'FR' ? 'Règle de verrouillage du contrat' : 'Contract locking rule'}</p>
                      <p className="mt-1 text-xs text-amber-100/80">
                        {currentLanguage === 'FR'
                          ? 'Sans signature, le contrat est enregistré comme brouillon et reste modifiable. Dès que les deux signatures sont présentes et que vous enregistrez, le contenu devient définitivement non modifiable.'
                          : 'Without signatures, the contract is saved as an editable draft. Once both signatures are present and you save, the content becomes permanently locked.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

"""
if signature_notice not in text:
    text = replace_once(text, signature_anchor, signature_notice + signature_anchor, 'avis verrouillage signature')

# Modal et bouton adaptés à la création ou à la modification.
professional_title = "<h3 className=\"text-sm font-black font-mono uppercase tracking-widest text-white\">{newDocType === 'quote' ? (currentLanguage === 'FR' ? 'Créer un devis professionnel' : 'Create professional quote') : newDocType === 'contract' ? (currentLanguage === 'FR' ? 'Créer et signer le contrat' : 'Create and sign contract') : (currentLanguage === 'FR' ? 'Créer la facture' : 'Create invoice')}</h3>"
editable_title = "<h3 className=\"text-sm font-black font-mono uppercase tracking-widest text-white\">{editingDocument ? (currentLanguage === 'FR' ? `Modifier ${editingDocument.number}` : `Edit ${editingDocument.number}`) : newDocType === 'quote' ? (currentLanguage === 'FR' ? 'Créer un devis professionnel' : 'Create professional quote') : newDocType === 'contract' ? (currentLanguage === 'FR' ? 'Créer ou préparer le contrat' : 'Create or prepare contract') : (currentLanguage === 'FR' ? 'Créer la facture' : 'Create invoice')}</h3>"
text = replace_once(text, professional_title, editable_title, 'titre modal modification')
text = text.replace(
    "<button onClick={() => setShowCreateModal(false)} className=\"text-gray-400 hover:text-white cursor-pointer\">",
    "<button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className=\"text-gray-400 hover:text-white cursor-pointer\">",
    1
)

professional_button = "<span>{newDocType === 'quote' ? (currentLanguage === 'FR' ? 'Enregistrer le devis' : 'Save quote') : newDocType === 'contract' ? (currentLanguage === 'FR' ? 'Signer et créer le contrat' : 'Sign and create contract') : (currentLanguage === 'FR' ? 'Enregistrer la facture' : 'Save invoice')}</span>"
editable_button = "<span>{editingDocument ? (newDocType === 'contract' && ownerSignatureData && clientSignatureData ? (currentLanguage === 'FR' ? 'Signer et verrouiller le contrat' : 'Sign and lock contract') : (currentLanguage === 'FR' ? 'Enregistrer les modifications' : 'Save changes')) : newDocType === 'quote' ? (currentLanguage === 'FR' ? 'Enregistrer le devis' : 'Save quote') : newDocType === 'contract' ? (ownerSignatureData && clientSignatureData ? (currentLanguage === 'FR' ? 'Signer et verrouiller le contrat' : 'Sign and lock contract') : (currentLanguage === 'FR' ? 'Enregistrer le brouillon modifiable' : 'Save editable draft')) : (currentLanguage === 'FR' ? 'Enregistrer la facture' : 'Save invoice')}</span>"
text = replace_once(text, professional_button, editable_button, 'bouton modal modification')

# Bouton Modifier visible pour tous les documents sauf le contrat signé.
action_anchor = "                  {/* Devis accepté -> contrat signé */}\n"
if action_anchor not in text:
    action_anchor = "                  {/* Send action */}\n"
edit_action = """                  {/* Modification autorisée pour tous les documents sauf le contrat signé. */}
                  {isSignedContract(doc) ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-amber-300" title={currentLanguage === 'FR' ? 'Le contenu de ce contrat signé est définitivement verrouillé.' : 'The content of this signed contract is permanently locked.'}>
                      <Lock className="h-3.5 w-3.5" />
                      {currentLanguage === 'FR' ? 'Signé · verrouillé' : 'Signed · locked'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEditDocument(doc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-orange-300 transition hover:bg-orange-500/20"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      {currentLanguage === 'FR' ? 'Modifier' : 'Edit'}
                    </button>
                  )}

"""
if edit_action not in text:
    text = replace_once(text, action_anchor, edit_action + action_anchor, 'action modifier document')

# Un contrat signé ne peut pas non plus être supprimé.
delete_button = """                <button
                  onClick={() => deleteGCPDocument(doc.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 border border-transparent hover:border-red-950 hover:bg-red-950/20 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
"""
locked_delete = """                {!isSignedContract(doc) ? (
                  <button
                    onClick={() => {
                      const confirmed = window.confirm(currentLanguage === 'FR' ? `Supprimer définitivement ${doc.number}?` : `Permanently delete ${doc.number}?`);
                      if (confirmed) deleteGCPDocument(doc.id);
                    }}
                    className="p-1.5 text-gray-500 hover:text-red-400 border border-transparent hover:border-red-950 hover:bg-red-950/20 rounded-lg transition"
                    aria-label={currentLanguage === 'FR' ? 'Supprimer le document' : 'Delete document'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="p-1.5 text-amber-400" title={currentLanguage === 'FR' ? 'Suppression interdite après signature' : 'Deletion prohibited after signing'}><Lock className="h-4 w-4" /></span>
                )}
"""
text = replace_once(text, delete_button, locked_delete, 'suppression protégée contrat')

# Le parcours explique désormais l’étape brouillon/révision/signature.
text = text.replace(
    "Commencez par un devis. Lorsqu’il est accepté, transformez-le en contrat signé. Quand les travaux sont terminés, transformez le contrat en facture.",
    "Commencez par un devis. Préparez ensuite un contrat brouillon, révisez-le, puis faites-le signer. Dès la signature, son contenu est verrouillé. Quand les travaux sont terminés, transformez le contrat en facture."
)
text = text.replace(
    "Start with a quote. Once accepted, turn it into a signed contract. When work is complete, turn the contract into an invoice.",
    "Start with a quote. Then prepare and review a draft contract before signing it. Once signed, its content is locked. When work is complete, turn the contract into an invoice."
)
text = text.replace(
    "Contrat autonome ou contrat prérempli depuis un devis accepté, avec clauses et signatures.",
    "Contrat autonome ou prérempli, sauvegardé comme brouillon modifiable avant les deux signatures."
)
text = text.replace(
    "Standalone contract or one prefilled from an accepted quote, with clauses and signatures.",
    "Standalone or prefilled contract saved as an editable draft before both signatures."
)

path.write_text(text, encoding='utf-8')
print('Documents modifiables intégrés; contrats brouillons révisables et contrats signés verrouillés.')
