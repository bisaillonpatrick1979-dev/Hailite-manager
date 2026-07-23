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
# TYPES — un contrat peut être marqué terminé avant sa facturation.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'types.ts'
text = path.read_text(encoding='utf-8')
text = text.replace(
    "  status: 'draft' | 'sent' | 'accepted' | 'paid' | 'overdue';",
    "  status: 'draft' | 'sent' | 'accepted' | 'completed' | 'paid' | 'overdue';"
)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# DOCUMENTS MANAGER — parcours professionnel Devis -> Contrat -> Facture.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

# L’ancienne conversion directe devis -> facture n’est plus utilisée dans l’écran.
text = text.replace(
    "    convertQuoteToInvoice, addPartialPayment, clients, projects, companyInfo,\n",
    "    addPartialPayment, clients, projects, companyInfo,\n"
)

# Source de conversion pour conserver la filiation et préremplir le prochain document.
if 'const [sourceDocument, setSourceDocument]' not in text:
    text = replace_once(
        text,
        "  const [showCreateModal, setShowCreateModal] = useState(false);\n",
        "  const [showCreateModal, setShowCreateModal] = useState(false);\n  const [sourceDocument, setSourceDocument] = useState<GCPDocument | null>(null);\n",
        'état document source'
    )

# Réinitialise aussi la filiation lors d’une création indépendante.
text = text.replace(
    "  const resetCreateForm = () => {\n    setNewDocType('quote');\n",
    "  const resetCreateForm = () => {\n    setSourceDocument(null);\n    setNewDocType('quote');\n"
)

# Assistant de création ou conversion préremplie.
if 'const openCreateDocument = (' not in text:
    anchor = "  const handleCreateDocument = () => {\n"
    helper = """  const openCreateDocument = (type: 'invoice' | 'quote' | 'contract', source?: GCPDocument) => {
    resetCreateForm();
    setNewDocType(type);
    setShowCreateModal(true);

    if (!source) {
      setNewClientId(clients[0]?.id || '');
      return;
    }

    setSourceDocument(source);
    setNewClientId(source.clientId);
    setNewDueDate(new Date(Date.now() + 30 * 24 * 3600000).toISOString().split('T')[0]);
    setNewIsSimple(source.isSimpleLayout);
    setSimpleLines(source.lineItems.map(line => ({
      desc: line.description,
      qty: line.qty,
      unit: line.unit,
      price: line.unitPrice
    })));
    setRichMaterials(source.materialLines.map(line => ({
      claddingType: line.claddingType,
      brand: line.brand,
      thickness: line.thickness,
      qtySqft: line.qtySqft,
      supplier: line.supplier,
      price: line.unitPrice
    })));
    setRichLabours(source.labourLines.map(line => ({
      task: line.task,
      hours: line.estimatedHours,
      rate: line.rate,
      isFlat: line.isFlatRate
    })));
    setRichOthers(source.otherLines.map(line => ({ desc: line.description, amount: line.amount })));
    setRichSubcontracts(source.subcontractLines.map(line => ({
      companyName: line.companyName,
      phone: line.phone,
      workType: line.workType,
      amount: line.amount
    })));
    setDiscountPct(source.discountPct || 0);
    setHoldbackPct(source.holdbackPct || 0);
    setDepositAmount(source.depositAmount || 0);
    setDepositPct(source.depositPct || 25);
    setMidPct(source.paymentMidPct || 25);
    setFinalPct(source.paymentFinalPct || 50);
    setWarrantyYears(source.warrantyYears || companyInfo.defaultWarrantyYears || 2);
    setHasInsurance(source.hasInsurance);
    setSubcontractAuthorized(source.subcontractAuthorized);
    setRemarks(source.contractObject || '');
    setClauseChange(source.clauseChangeOrder || companyInfo.defaultClauseChangeOrder || clausePresets.changeOrder);
    setClauseResil(source.clauseResiliation || companyInfo.defaultClauseResiliation || clausePresets.resiliation);
    setClauseWarr(source.clauseWarrantyDetails || clausePresets.warranty);
    // Un nouveau document légal reçoit ses propres signatures. On ne recopie
    // jamais silencieusement la signature d’un devis sur un contrat.
    setOwnerSignatureData(null);
    setClientSignatureData(null);
    setSignaturePadResetKey(key => key + 1);
  };

"""
    text = replace_once(text, anchor, helper + anchor, 'assistant création et conversion')

# Statut et références du document créé.
text = text.replace(
    "      status: 'draft',\n      clientId: cli.id,\n",
    """      status: newDocType === 'contract' ? 'accepted' : 'draft',
      refQuote: newDocType === 'contract' && sourceDocument?.type === 'quote'
        ? sourceDocument.number
        : newDocType === 'invoice'
          ? sourceDocument?.refQuote
          : undefined,
      refContract: newDocType === 'invoice' && sourceDocument?.type === 'contract'
        ? sourceDocument.number
        : undefined,
      clientId: cli.id,
"""
)
text = text.replace(
    "      siteAddress: cli.address,\n",
    "      siteAddress: sourceDocument?.siteAddress || cli.address,\n"
)
text = text.replace(
    "    setShowCreateModal(false);\n    resetCreateForm();\n",
    """    setShowCreateModal(false);
    setActiveTypeTab(newDocType);
    setActiveStatusTab('all');
    resetCreateForm();
"""
)

# Compteurs du parcours.
if 'const quoteDocumentCount' not in text:
    anchor = "  const getStatusColor = (status: string) => {\n"
    counters = """  const quoteDocumentCount = documents.filter(doc => doc.type === 'quote').length;
  const contractDocumentCount = documents.filter(doc => doc.type === 'contract').length;
  const invoiceDocumentCount = documents.filter(doc => doc.type === 'invoice').length;
  const acceptedQuoteCount = documents.filter(doc => doc.type === 'quote' && doc.status === 'accepted').length;
  const completedContractCount = documents.filter(doc => doc.type === 'contract' && doc.status === 'completed').length;

"""
    text = replace_once(text, anchor, counters + anchor, 'compteurs parcours documents')

# Statut terminé.
text = text.replace(
    "      case 'accepted': return 'bg-purple-950/40 text-purple-400 border-purple-900/30';\n",
    "      case 'accepted': return 'bg-purple-950/40 text-purple-400 border-purple-900/30';\n      case 'completed': return 'bg-teal-950/40 text-teal-300 border-teal-900/30';\n"
)
text = text.replace(
    "      case 'accepted': return t.cdmStatusAccepted;\n",
    "      case 'accepted': return t.cdmStatusAccepted;\n      case 'completed': return currentLanguage === 'FR' ? 'Travaux terminés' : 'Work completed';\n"
)

# Grand parcours visible avant les statistiques.
if 'id="document-professional-workflow"' not in text:
    anchor = "    <div id=\"clients-documents-manager\" className=\"space-y-6\">\n"
    workflow = """    <div id=\"clients-documents-manager\" className=\"space-y-6\">

      <section id=\"document-professional-workflow\" className=\"rounded-3xl border border-orange-500/25 bg-gradient-to-br from-[#16191F] to-[#0F1115] p-4 sm:p-6 shadow-xl\">
        <div className=\"flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between\">
          <div>
            <div className=\"flex items-center gap-2 text-orange-300\"><Layers className=\"h-6 w-6\" /><span className=\"text-xs font-black uppercase tracking-[0.2em]\">{currentLanguage === 'FR' ? 'Parcours des documents' : 'Document workflow'}</span></div>
            <h2 className=\"mt-2 text-2xl font-black text-white\">{currentLanguage === 'FR' ? 'Devis → Contrat → Facture' : 'Quote → Contract → Invoice'}</h2>
            <p className=\"mt-1 max-w-3xl text-sm leading-relaxed text-gray-400\">{currentLanguage === 'FR' ? 'Commencez par un devis. Lorsqu’il est accepté, transformez-le en contrat signé. Quand les travaux sont terminés, transformez le contrat en facture.' : 'Start with a quote. Once accepted, turn it into a signed contract. When work is complete, turn the contract into an invoice.'}</p>
          </div>
          <div className=\"rounded-xl border border-gray-800 bg-black/20 px-4 py-3 text-xs text-gray-300\">
            <b className=\"text-orange-300\">{acceptedQuoteCount}</b> {currentLanguage === 'FR' ? 'devis accepté(s) prêt(s) pour contrat' : 'accepted quote(s) ready for contract'}<br />
            <b className=\"text-teal-300\">{completedContractCount}</b> {currentLanguage === 'FR' ? 'contrat(s) prêt(s) à facturer' : 'contract(s) ready to invoice'}
          </div>
        </div>

        <div className=\"mt-5 grid gap-3 lg:grid-cols-3\">
          <button type=\"button\" onClick={() => openCreateDocument('quote')} className=\"group min-h-40 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-left transition hover:border-blue-300 hover:bg-blue-500/15\">
            <div className=\"flex items-center justify-between\"><FileText className=\"h-8 w-8 text-blue-300\" /><span className=\"rounded-full bg-black/30 px-3 py-1 text-xs font-black text-blue-200\">{quoteDocumentCount}</span></div>
            <h3 className=\"mt-4 text-xl font-black text-white\">1. {currentLanguage === 'FR' ? 'Créer un devis' : 'Create a quote'}</h3>
            <p className=\"mt-1 text-xs leading-relaxed text-gray-400\">{currentLanguage === 'FR' ? 'Description des travaux, matériaux, main-d’œuvre, prix, taxes et durée de validité.' : 'Work description, materials, labour, pricing, taxes, and validity period.'}</p>
          </button>

          <button type=\"button\" onClick={() => openCreateDocument('contract')} className=\"group min-h-40 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 text-left transition hover:border-purple-300 hover:bg-purple-500/15\">
            <div className=\"flex items-center justify-between\"><FileCheck className=\"h-8 w-8 text-purple-300\" /><span className=\"rounded-full bg-black/30 px-3 py-1 text-xs font-black text-purple-200\">{contractDocumentCount}</span></div>
            <h3 className=\"mt-4 text-xl font-black text-white\">2. {currentLanguage === 'FR' ? 'Créer un contrat' : 'Create a contract'}</h3>
            <p className=\"mt-1 text-xs leading-relaxed text-gray-400\">{currentLanguage === 'FR' ? 'Contrat autonome ou contrat prérempli depuis un devis accepté, avec clauses et signatures.' : 'Standalone contract or one prefilled from an accepted quote, with clauses and signatures.'}</p>
          </button>

          <button type=\"button\" onClick={() => openCreateDocument('invoice')} className=\"group min-h-40 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-500/15\">
            <div className=\"flex items-center justify-between\"><DollarSign className=\"h-8 w-8 text-emerald-300\" /><span className=\"rounded-full bg-black/30 px-3 py-1 text-xs font-black text-emerald-200\">{invoiceDocumentCount}</span></div>
            <h3 className=\"mt-4 text-xl font-black text-white\">3. {currentLanguage === 'FR' ? 'Créer une facture' : 'Create an invoice'}</h3>
            <p className=\"mt-1 text-xs leading-relaxed text-gray-400\">{currentLanguage === 'FR' ? 'Facture autonome ou facture préremplie depuis un contrat terminé, avec références complètes.' : 'Standalone invoice or one prefilled from a completed contract, with full references.'}</p>
          </button>
        </div>
      </section>
"""
    text = replace_once(text, anchor, workflow, 'parcours professionnel visible')

# Le petit bouton rapide devient explicitement un devis.
text = text.replace(
    "onClick={() => { resetCreateForm(); setShowCreateModal(true); }}",
    "onClick={() => openCreateDocument('quote')}"
)
text = text.replace(
    "<span>{t.cdmNewDocBtn}</span>",
    "<span>{currentLanguage === 'FR' ? 'Créer un devis' : 'Create quote'}</span>"
)

# Ajoute le statut terminé dans les filtres.
text = text.replace(
    "              { id: 'accepted', label: t.cdmStatusAccepted },\n              { id: 'paid', label: t.cdmStatusPaidShort },\n",
    "              { id: 'accepted', label: t.cdmStatusAccepted },\n              { id: 'completed', label: currentLanguage === 'FR' ? 'Terminé' : 'Completed' },\n              { id: 'paid', label: t.cdmStatusPaidShort },\n"
)

# Affiche aussi la référence au contrat sur les factures.
text = text.replace(
    "                  {doc.refQuote && (\n                    <p className=\"text-[9px] text-blue-400 font-mono\">{t.cdmQuoteRef} {doc.refQuote}</p>\n                  )}\n",
    """                  {doc.refQuote && (
                    <p className=\"text-[9px] text-blue-400 font-mono\">{t.cdmQuoteRef} {doc.refQuote}</p>
                  )}
                  {doc.refContract && (
                    <p className=\"text-[9px] text-purple-300 font-mono\">{currentLanguage === 'FR' ? 'Contrat réf.' : 'Contract ref.'} {doc.refContract}</p>
                  )}
"""
)

# Remplace la conversion directe devis -> facture par devis -> contrat.
pattern = re.compile(r"\s*\{\/\* Convert quote option \*\/\}\s*\{doc\.type === 'quote' && doc\.status === 'accepted' && \(.*?\n\s*\)\}\n", re.S)
replacement = """
                  {/* Devis accepté -> contrat signé */}
                  {doc.type === 'quote' && doc.status === 'accepted' && !documents.some(item => item.type === 'contract' && item.refQuote === doc.number) && (
                    <button
                      onClick={() => openCreateDocument('contract', doc)}
                      className=\"px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase rounded-lg transition flex items-center gap-1 cursor-pointer\"
                    >
                      <ArrowRight className=\"w-3 h-3\" />
                      <span>{currentLanguage === 'FR' ? 'Créer contrat' : 'Create contract'}</span>
                    </button>
                  )}
                  {doc.type === 'quote' && documents.some(item => item.type === 'contract' && item.refQuote === doc.number) && (
                    <span className=\"rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[10px] font-black text-purple-300\">{currentLanguage === 'FR' ? 'Contrat créé' : 'Contract created'}</span>
                  )}
"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1 and 'Devis accepté -> contrat signé' not in text:
    raise RuntimeError(f'conversion devis vers contrat: remplacement={count}')

# Ajoute les étapes contrat terminé puis facturation avant l’action Envoyer.
if 'Contrat signé -> travaux terminés' not in text:
    anchor = "                  {/* Send action */}\n"
    actions = """                  {/* Contrat signé -> travaux terminés */}
                  {doc.type === 'contract' && doc.status === 'accepted' && (
                    <button
                      onClick={() => updateGCPDocument({ ...doc, status: 'completed' })}
                      className=\"px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-black uppercase rounded-lg transition flex items-center gap-1 cursor-pointer\"
                    >
                      <CheckCircle className=\"w-3 h-3\" />
                      <span>{currentLanguage === 'FR' ? 'Travaux terminés' : 'Work completed'}</span>
                    </button>
                  )}

                  {/* Contrat terminé -> facture */}
                  {doc.type === 'contract' && doc.status === 'completed' && !documents.some(item => item.type === 'invoice' && item.refContract === doc.number) && (
                    <button
                      onClick={() => openCreateDocument('invoice', doc)}
                      className=\"px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase rounded-lg transition flex items-center gap-1 cursor-pointer\"
                    >
                      <ArrowRight className=\"w-3 h-3\" />
                      <span>{currentLanguage === 'FR' ? 'Créer facture' : 'Create invoice'}</span>
                    </button>
                  )}
                  {doc.type === 'contract' && documents.some(item => item.type === 'invoice' && item.refContract === doc.number) && (
                    <span className=\"rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300\">{currentLanguage === 'FR' ? 'Facture créée' : 'Invoice created'}</span>
                  )}

"""
    text = replace_once(text, anchor, actions + anchor, 'actions contrat vers facture')

# Titre professionnel et type verrouillé dans le formulaire choisi.
text = text.replace(
    "<h3 className=\"text-sm font-black font-mono uppercase tracking-widest text-white\">{t.cdmNewDocGenTitle}</h3>",
    "<h3 className=\"text-sm font-black font-mono uppercase tracking-widest text-white\">{newDocType === 'quote' ? (currentLanguage === 'FR' ? 'Créer un devis professionnel' : 'Create professional quote') : newDocType === 'contract' ? (currentLanguage === 'FR' ? 'Créer et signer le contrat' : 'Create and sign contract') : (currentLanguage === 'FR' ? 'Créer la facture' : 'Create invoice')}</h3>"
)

pattern = re.compile(r"\s*\{\/\* Type toggle \*\/\}\s*<div className=\"grid grid-cols-3 gap-2\">.*?</div>\n", re.S)
selected_type = """
              {/* Type choisi depuis le parcours principal */}
              <div className=\"rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4\">
                <div className=\"flex items-center justify-between gap-3\">
                  <div>
                    <span className=\"text-[10px] font-black uppercase tracking-[0.2em] text-orange-300\">{currentLanguage === 'FR' ? 'Document sélectionné' : 'Selected document'}</span>
                    <p className=\"mt-1 text-xl font-black text-white\">{newDocType === 'quote' ? (currentLanguage === 'FR' ? 'DEVIS' : 'QUOTE') : newDocType === 'contract' ? (currentLanguage === 'FR' ? 'CONTRAT' : 'CONTRACT') : (currentLanguage === 'FR' ? 'FACTURE' : 'INVOICE')}</p>
                  </div>
                  {sourceDocument && <div className=\"text-right text-xs text-gray-300\"><span className=\"block text-gray-500\">{currentLanguage === 'FR' ? 'Prérempli depuis' : 'Prefilled from'}</span><b className=\"font-mono text-orange-200\">{sourceDocument.number}</b></div>}
                </div>
              </div>
"""
text, count = pattern.subn(selected_type, text, count=1)
if count != 1 and 'Type choisi depuis le parcours principal' not in text:
    raise RuntimeError(f'sélecteur type formulaire: remplacement={count}')

# Bouton final explicite.
text = text.replace(
    "                <span>{t.cdmGenerateBtn}</span>",
    "                <span>{newDocType === 'quote' ? (currentLanguage === 'FR' ? 'Enregistrer le devis' : 'Save quote') : newDocType === 'contract' ? (currentLanguage === 'FR' ? 'Signer et créer le contrat' : 'Sign and create contract') : (currentLanguage === 'FR' ? 'Enregistrer la facture' : 'Save invoice')}</span>"
)

# Filigrane professionnel : type + numéro + logo réel seulement s’il existe.
watermark_pattern = re.compile(r"\s*\{\/\* Dynamic Logo Watermark.*?\{\/\* Real PDF Sheet Content structure \*\/\}", re.S)
watermark = """
              {/* Filigrane professionnel imprimable : logo, type et numéro */}
              <div className=\"absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden\">
                <div className=\"relative -rotate-12 opacity-[0.075] flex max-w-[90%] flex-col items-center justify-center text-center\">
                  {companyInfo.logo && (
                    <img
                      src={companyInfo.logo}
                      alt=\"\"
                      className=\"mb-4 h-44 w-44 object-contain grayscale\"
                      referrerPolicy=\"no-referrer\"
                    />
                  )}
                  <span className=\"text-5xl font-black uppercase tracking-[0.18em] text-slate-900\">
                    {selectedDocForView.type === 'quote' ? (currentLanguage === 'FR' ? 'DEVIS' : 'QUOTE') : selectedDocForView.type === 'contract' ? (currentLanguage === 'FR' ? 'CONTRAT' : 'CONTRACT') : (currentLanguage === 'FR' ? 'FACTURE' : 'INVOICE')}
                  </span>
                  <span className=\"mt-3 break-all font-mono text-2xl font-black tracking-[0.12em] text-slate-900\">{selectedDocForView.number}</span>
                </div>
              </div>

              {/* Real PDF Sheet Content structure */}
"""
text, count = watermark_pattern.subn(watermark, text, count=1)
if count != 1 and 'Filigrane professionnel imprimable' not in text:
    raise RuntimeError(f'filigrane professionnel: remplacement={count}')

# Logo réel dans l’en-tête du document; monogramme seulement en absence de logo.
text = text.replace(
    "<div className=\"w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center font-bold text-white text-xl\">H</div>",
    "{companyInfo.logo ? <img src={companyInfo.logo} alt={companyInfo.name || 'Logo'} className=\"h-12 w-20 rounded-lg object-contain\" /> : <div className=\"w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center font-bold text-white text-xl\">{(companyInfo.name || 'H').charAt(0).toUpperCase()}</div>}"
)

# Référence contrat dans l’en-tête imprimé.
text = text.replace(
    "                    {selectedDocForView.refQuote && (\n                      <p className=\"text-[10px] text-blue-600 font-mono mt-1\">{t.cdmRefQuoteColon} {selectedDocForView.refQuote}</p>\n                    )}\n",
    """                    {selectedDocForView.refQuote && (
                      <p className=\"text-[10px] text-blue-600 font-mono mt-1\">{t.cdmRefQuoteColon} {selectedDocForView.refQuote}</p>
                    )}
                    {selectedDocForView.refContract && (
                      <p className=\"text-[10px] text-purple-700 font-mono mt-1\">{currentLanguage === 'FR' ? 'Contrat de référence :' : 'Reference contract:'} {selectedDocForView.refContract}</p>
                    )}
"""
)

path.write_text(text, encoding='utf-8')
print('Parcours professionnel Devis -> Contrat -> Facture et filigranes intégrés.')
