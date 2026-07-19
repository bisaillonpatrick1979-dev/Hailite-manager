import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { motion, useDragControls } from 'motion/react';
import useAppStore from './store';
import { authHeaders } from './apiClient';
import { translations, fmt } from './translations';
import { Employee, CompanyInfo, EmployeeRole, Invoice } from './types';
import { useGeofencing } from './hooks/useGeofencing';
import {
  CANADIAN_REGIONS, US_REGIONS, TaxRegion,
  getRegionPayrollMeta, regionWithPreposition, CA_FEDERAL_BRACKETS, CA_PROVINCIAL_BRACKETS, CA_PROVINCIAL_FALLBACK_RATE, computeBracketTax
} from './regionsData';
// Composants chargés à la demande (code-splitting) : chacun n'est nécessaire
// que sur un onglet précis, inutile de les inclure dans le bundle initial.
const OnboardingScreen = lazy(() => import('./components/OnboardingScreen'));
const MotivationTab = lazy(() => import('./components/MotivationTab'));
const ClientDocumentsManager = lazy(() => import('./components/ClientDocumentsManager'));
const CatalogueManager = lazy(() => import('./components/CatalogueManager'));
const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));
const EmployeeWorkCalendar = lazy(() => import('./components/EmployeeWorkCalendar'));
import EmployeeAvatar from './components/EmployeeAvatar';
import SignaturePad from './components/SignaturePad';
import {
  Building2, Calendar, DollarSign, Clock, User, Plus, Trash, Edit, Check, 
  ChevronRight, ChevronLeft, Send, Activity, FileText, Layers, ShoppingBag, 
  BarChart2, Settings, AlertTriangle, MapPin, RotateCw, Search, Sparkles, 
  X, Briefcase, Percent, ShieldAlert, Laptop, CheckSquare, Dumbbell,
  Play, Pause, Award, HelpCircle, Phone, Mail, Coins, Camera, Mic, Volume2, VolumeX
} from 'lucide-react';

// Petites icônes-avatars générées localement (SVG en data URI) : aucune
// dépendance réseau, donc toujours disponibles même hors ligne, en plus des
// photos ci-dessous pour élargir le choix.
function makeIconAvatar(emoji: string, bg: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' rx='75' fill='${bg}'/><text x='75' y='96' font-size='72' text-anchor='middle'>${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Libellés courts pour les unités de vente du catalogue (voir CatalogueManager)
const CATALOGUE_UNIT_LABELS: Record<'FR' | 'EN', Record<string, string>> = {
  FR: { pi2: 'pi²', pi_lin: 'pi lin.', boite: 'boîte', rouleau: 'rouleau', unite: 'unité', lot: 'lot' },
  EN: { pi2: 'sq ft', pi_lin: 'lin. ft', boite: 'box', rouleau: 'roll', unite: 'unit', lot: 'lot' }
};

// Repli affiché brièvement pendant le chargement à la demande d'un composant
function LazySectionFallback() {
  const lang = useAppStore(s => s.currentLanguage);
  return (
    <div className="flex items-center justify-center p-10 text-gray-500 text-xs font-mono uppercase tracking-wider">
      {translations[lang].loading}
    </div>
  );
}

const EMPLOYEE_PRESET_AVATARS: Array<{ url: string; labelFR: string; labelEN: string }> = [
  { url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&q=80', labelFR: 'Marc (Charpentier)', labelEN: 'Marc (Carpenter)' },
  { url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&q=80', labelFR: 'Jessica (Bureau)', labelEN: 'Jessica (Office)' },
  { url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&q=80', labelFR: 'Stéphane (Couvreur)', labelEN: 'Stéphane (Roofer)' },
  { url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&q=80', labelFR: 'Patrick (Directeur)', labelEN: 'Patrick (Director)' },
  { url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&q=80', labelFR: 'Sarah (Apprentie)', labelEN: 'Sarah (Apprentice)' },
  { url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&h=150&fit=crop&q=80', labelFR: 'Lucas (Ferblantier)', labelEN: 'Lucas (Tinsmith)' },
  { url: makeIconAvatar('👷', '#F97316'), labelFR: 'Icône Casque Orange', labelEN: 'Orange Helmet Icon' },
  { url: makeIconAvatar('👷‍♀️', '#0EA5E9'), labelFR: 'Icône Casque Bleu', labelEN: 'Blue Helmet Icon' },
  { url: makeIconAvatar('🦺', '#22C55E'), labelFR: 'Icône Sécurité Verte', labelEN: 'Green Safety Icon' },
  { url: makeIconAvatar('🏗️', '#A855F7'), labelFR: 'Icône Chantier Mauve', labelEN: 'Purple Site Icon' },
  { url: makeIconAvatar('🔨', '#EF4444'), labelFR: 'Icône Marteau Rouge', labelEN: 'Red Hammer Icon' },
  { url: makeIconAvatar('🧰', '#EAB308'), labelFR: 'Icône Boîte à Outils Jaune', labelEN: 'Yellow Toolbox Icon' },
];

const TOUR_STEPS_I18N: Record<'FR' | 'EN', Array<{ title: string; description: string; targetTab: string | null; highlightId: string | null; badgeText: string }>> = {
  FR: [
    {
      title: "Bienvenue dans l'app Toiture Pro ! 🎩",
      description: "Ce guide interactif vous permet de faire le tour complet de l'application et de valider toutes ses fonctionnalités clés (pointage, géorepérage, inventaire, commandes) avant le déploiement de production.",
      targetTab: null,
      highlightId: null,
      badgeText: "Découverte"
    },
    {
      title: "1. Changement de Profil Ouvrier 👥",
      description: "L'application s'adapte dynamiquement selon le rôle de l'ouvrier connecté (Admin vs Équipe terrain). En tant qu'Admin, vous bénéficiez du tableau de bord complet, tandis que vos compagnons ont accès à un portail de pointage simple et rapide. Utilisez le sélecteur d'employé en haut pour basculer !",
      targetTab: "board",
      highlightId: "user-persona-selector",
      badgeText: "Rôles & Accès"
    },
    {
      title: "2. Pointage Géolocalisé intelligent ⏰",
      description: "Revenez à l'accueil pour tester le Punch In / Punch Out. Le gros bouton central animé permet de débuter une session. Il enregistre la date, les coordonnées GPS et associe les données de paie en direct.",
      targetTab: "board",
      highlightId: "center-pointage-button",
      badgeText: "Horodateur"
    },
    {
      title: "3. Sécurité & Géolocalisation (Geofencing) 📡",
      description: "Le système calcule la distance séparant l'ouvrier du projet de toiture actif. Si la distance dépasse le niveau configuré (ex: 100m), une alerte rouge persistante et une notification RH s'activent pour assurer l'intégrité.",
      targetTab: "board",
      highlightId: "geofence-alert-indicator",
      badgeText: "Géorepérage"
    },
    {
      title: "4. Gestion de l'Inventaire & Matériaux 🪵",
      description: "Lorsque vos employés effectuent leur Punch Out (fin de journée), l'application leur présente un pop-up intelligent pour déclarer les matériaux posés d'une toiture ou retournés à l'entrepôt. Vous pouvez suivre l'état de l'inventaire physique dans cet onglet.",
      targetTab: "inventory",
      highlightId: "view-inventory-content",
      badgeText: "Consommation"
    },
    {
      title: "5. Catalogue Devis & Tarification 🏷️",
      description: "Découvrez le catalogue de tarification dans l'onglet 'Inventaire' (Sous-onglet 'Catalogue'). Vous pouvez ajouter ou supprimer des articles du catalogue de devis pour vos estimations clients en un clic !",
      targetTab: "inventory",
      highlightId: "view-inventory-catalog",
      badgeText: "Ventes & Devis"
    },
    {
      title: "6. Émettre des Bons de Commande Fournisseur 📦",
      description: "Dans l'onglet 'Commandes', vous pouvez créer des bons de commande officiels en spécifiant le fournisseur, l'article et le prix de gros. Une fois confirmés comme 'Reçus', les stocks de l'entrepôt se rechargent automatiquement !",
      targetTab: "commandes",
      highlightId: "view-orders-content",
      badgeText: "Achats"
    },
    {
      title: "7. Gestion des Ouvriers & Avatars 📸",
      description: "Naviguez vers l'onglet 'Paramètres' pour embaucher ou modifier des employés, ajuster leurs taux horaires individuels, mettre à jour leurs codes NIP à 4 chiffres ou leur sélectionner un superbe profil photo !",
      targetTab: "settings",
      highlightId: "settings-view-panel",
      badgeText: "Ressources Humaines"
    },
    {
      title: "Prêt pour Production et API d'Intégration ! 🌐",
      description: "Bravo ! Vous avez parcouru toutes les étapes de validation. Toutes les données sont persistées en direct sous LocalStorage. Vos architectures de pointage, d'alertes RH et d'inventaire sont prêtes pour l'API !",
      targetTab: null,
      highlightId: null,
      badgeText: "API Ready"
    }
  ],
  EN: [
    {
      title: "Welcome to the Roofing Pro app! 🎩",
      description: "This interactive guide walks you through the entire application and validates all its key features (time tracking, geofencing, inventory, orders) before production deployment.",
      targetTab: null,
      highlightId: null,
      badgeText: "Discovery"
    },
    {
      title: "1. Switching Worker Profiles 👥",
      description: "The application adapts dynamically to the role of the signed-in worker (Admin vs Field team). As an Admin you get the full dashboard, while your workers get a simple and fast punch portal. Use the employee selector at the top to switch!",
      targetTab: "board",
      highlightId: "user-persona-selector",
      badgeText: "Roles & Access"
    },
    {
      title: "2. Smart Geolocated Time Tracking ⏰",
      description: "Go back to the home screen to test Punch In / Punch Out. The large animated central button starts a session. It records the date, GPS coordinates and links live payroll data.",
      targetTab: "board",
      highlightId: "center-pointage-button",
      badgeText: "Time Clock"
    },
    {
      title: "3. Security & Geolocation (Geofencing) 📡",
      description: "The system computes the distance between the worker and the active roofing project. If the distance exceeds the configured level (e.g. 100m), a persistent red alert and an HR notification are triggered to ensure integrity.",
      targetTab: "board",
      highlightId: "geofence-alert-indicator",
      badgeText: "Geofencing"
    },
    {
      title: "4. Inventory & Materials Management 🪵",
      description: "When your employees Punch Out (end of day), the app shows them a smart pop-up to report materials installed on a roof or returned to the warehouse. You can track the physical inventory status in this tab.",
      targetTab: "inventory",
      highlightId: "view-inventory-content",
      badgeText: "Consumption"
    },
    {
      title: "5. Quote Catalog & Pricing 🏷️",
      description: "Discover the pricing catalog in the 'Inventory' tab ('Catalog' sub-tab). You can add or remove items from the quote catalog for your client estimates in one click!",
      targetTab: "inventory",
      highlightId: "view-inventory-catalog",
      badgeText: "Sales & Quotes"
    },
    {
      title: "6. Issue Supplier Purchase Orders 📦",
      description: "In the 'Orders' tab, you can create official purchase orders by specifying the supplier, the item and the wholesale price. Once confirmed as 'Received', warehouse stock is automatically replenished!",
      targetTab: "commandes",
      highlightId: "view-orders-content",
      badgeText: "Purchasing"
    },
    {
      title: "7. Workers & Avatars Management 📸",
      description: "Navigate to the 'Settings' tab to hire or edit employees, adjust their individual hourly rates, update their 4-digit PIN codes or pick them a great profile photo!",
      targetTab: "settings",
      highlightId: "settings-view-panel",
      badgeText: "Human Resources"
    },
    {
      title: "Ready for Production and Integration API! 🌐",
      description: "Well done! You have completed every validation step. All data is persisted live in LocalStorage. Your time tracking, HR alerts and inventory architectures are API-ready!",
      targetTab: null,
      highlightId: null,
      badgeText: "API Ready"
    }
  ]
};

// Résout la province/état de la compagnie (fixé au Québec seulement si rien n'a
// été configuré), pour que les libellés et calculs de paie s'adaptent au bon
// endroit au lieu de présumer le Québec partout.
function getCompanyRegion(companyInfo: CompanyInfo): { country: 'CA' | 'US'; region: TaxRegion } {
  const country = companyInfo.country || 'CA';
  const list = country === 'US' ? US_REGIONS : CANADIAN_REGIONS;
  const region = list.find(r => r.code === companyInfo.region) || list[0];
  return { country, region };
}

export default function App() {
  const {
    employees, projects, punchSessions, invoices, catalogue, inventory,
    orders, clients, companyInfo, hrAlerts, activeEmployee, currentLanguage,
    currentTheme, login, logout, setTheme, setLanguage, addEmployee, updateEmployee,
    deleteEmployee, addProject, updateProject, deleteProject,
    addInventoryItem, updateInventoryItem,
    deleteInventoryItem, addSupplierOrder, updateSupplierOrder, addClient, updateClient,
    deleteClient, updateCompanyInfo, resolveHRAlert, startPunchSession, pausePunchSession,
    resumePunchSession, stopPunchSession, generateDraftInvoiceForEmployee, updateInvoice,
    isOnboarded, weeklyGoals, motivationTeams, updateMotivationTeam,
    documents, expenses, payrollPayments, addExpense, deleteExpense, addPayrollPayment, deletePayrollPayment,
    hydrateCloud
  } = useAppStore();

  // Hydratation depuis Supabase au démarrage (best effort, non bloquant : l'app
  // fonctionne déjà avec les données LocalStorage chargées de façon synchrone ci-dessus),
  // puis rafraîchissement périodique et au retour sur l'onglet pour approcher du
  // temps réel sans dépendre de connexions persistantes (compatible hébergement serverless).
  const [cloudSyncing, setCloudSyncing] = useState(true);
  useEffect(() => {
    hydrateCloud().finally(() => setCloudSyncing(false));

    const interval = setInterval(() => { hydrateCloud(); }, 45000);
    const onFocus = () => hydrateCloud();
    const onVisibility = () => { if (!document.hidden) hydrateCloud(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const dragControls = useDragControls();
  const t = translations[currentLanguage];
  const TOUR_STEPS = TOUR_STEPS_I18N[currentLanguage];
  const dateLocale = currentLanguage === 'FR' ? 'fr-CA' : 'en-CA';
  const unitLabels = CATALOGUE_UNIT_LABELS[currentLanguage];
  const { country: companyCountry, region: companyRegion } = getCompanyRegion(companyInfo);
  const payrollMeta = getRegionPayrollMeta(companyRegion, companyCountry);
  const isQuebec = companyCountry === 'CA' && companyRegion.code === 'QC';
  const regionName = currentLanguage === 'FR' ? companyRegion.nameFR : companyRegion.nameEN;
  const pensionName = currentLanguage === 'FR' ? payrollMeta.pensionNameFR : payrollMeta.pensionNameEN;
  const secondaryDeductionName = currentLanguage === 'FR' ? payrollMeta.secondaryDeductionNameFR : payrollMeta.secondaryDeductionNameEN;
  const workersCompName = currentLanguage === 'FR' ? payrollMeta.workersCompNameFR : payrollMeta.workersCompNameEN;
  const breakRuleText = currentLanguage === 'FR' ? payrollMeta.breakRuleFR : payrollMeta.breakRuleEN;
  const businessNumberLabel = currentLanguage === 'FR' ? payrollMeta.businessNumberLabelFR : payrollMeta.businessNumberLabelEN;
  const { coords, gpsError, isChecking, checkLocation, evaluateProjectGeofence } = useGeofencing();

  // App Navigation state
  const [activeTab, setActiveTab] = useState<'home' | 'invoice' | 'projects' | 'documents' | 'inventory' | 'commandes' | 'stats' | 'settings' | 'motivation'>('home');
  const [activeSettingsTab, setActiveSettingsTab] = useState<number>(0);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  // Les employés non-admin (incl. sous-traitants) ne doivent voir que les
  // réglages personnels (Thème, Langue) — jamais les réglages de compagnie,
  // paie ou d'équipe. On limite l'onglet affiché sans toucher à l'état réel,
  // pour ne jamais rendre un onglet réservé même si activeSettingsTab dérive.
  const visibleSettingsTab = (activeEmployee && activeEmployee.role !== 'admin' && ![2, 3].includes(activeSettingsTab))
    ? 2
    : activeSettingsTab;
  const [statsMonth, setStatsMonth] = useState<string>('2026-06');
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [teamCalendarEmployeeId, setTeamCalendarEmployeeId] = useState<string>('');
  const [statsSubTab, setStatsSubTab] = useState<'analytics' | 'payroll'>('analytics');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [payrollFocusEmployeeId, setPayrollFocusEmployeeId] = useState<string>('');
  const [editEmployeeForm, setEditEmployeeForm] = useState<any>(null);

  // Login PIN workflow state
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [pinBuffer, setPinBuffer] = useState<string>('');
  const [showPinMask, setShowPinMask] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Employee active session state
  const [activePunchSession, setActivePunchSession] = useState<any>(null);
  const [homePunchProject, setHomePunchProject] = useState<string>(() => {
    try {
      return activeEmployee
        ? localStorage.getItem(`gcp_lastPunchProject_${activeEmployee.id}`) || ''
        : '';
    } catch {
      return '';
    }
  });
  const [homePayMode, setHomePayMode] = useState<'horaire' | 'surface' | 'forfait'>('horaire');
  const [homeRateCustom, setHomeRateCustom] = useState<number>(0);
  const [timerDisplay, setTimerDisplay] = useState<string>('00:00:00');
  const [earningsSimulation, setEarningsSimulation] = useState<number>(0);

  // Accounting management local inputs
  const [accountingViewMode, setAccountingViewMode] = useState<'expenses' | 'payroll'>('expenses');
  const [newExpenseFormSetting, setNewExpenseFormSetting] = useState({ date: '2026-06-03', description: '', category: 'Materials', amount: 0, projectId: '' });
  const [newPayrollFormSetting, setNewPayrollFormSetting] = useState({ date: '2026-06-03', employeeId: '', amount: 0, hours: 0, projectId: '', status: 'paid' });

  // Custom corporate payroll benefits simulation state
  const [simHourlyRate, setSimHourlyRate] = useState<number>(45);
  const [simHoursCount, setSimHoursCount] = useState<number>(40);
  const [selectedSimEmployeeStateId, setSelectedSimEmployeeStateId] = useState<string>('');
  const [cotisationsSectionTab, setCotisationsSectionTab] = useState<'mandatory' | 'optional' | 'custom' | 'simulator'>('optional');

  // Modals state
  const [showPunchInModal, setShowPunchInModal] = useState<boolean>(false);
  const [showPunchOutModal, setShowPunchOutModal] = useState<boolean>(false);

  // Signature tactile requise avant l'envoi d'une facture sous-traitant à la compagnie
  const [invoiceToSign, setInvoiceToSign] = useState<Invoice | null>(null);
  const [invoiceSignatureData, setInvoiceSignatureData] = useState<string | null>(null);

  // Punch-Out Surface materials reporting state
  const [reportedMaterials, setReportedMaterials] = useState<Array<{ name: string; quantity: number; unitPrice: number; emoji: string; unit: string }>>([]);

  // Admin CRUD wizard states
  const [pendingEmployeeAvatar, setPendingEmployeeAvatar] = useState<string>('');
  const newEmployeeAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const [newEmployeeForm, setNewEmployeeForm] = useState<{
    name: string;
    nip: string;
    role: EmployeeRole;
    hourlyRate: number;
    workerType: string;
    asNumber: string;
    phone: string;
    address: string;
    hireDate: string;
    avatar: string;
    businessName: string;
    gstNumber: string;
    sin: string;
    employeeProvince: string;
    payFrequency: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly';
    annualSalary: number;
  }>({
    name: '',
    nip: '',
    role: 'employee',
    hourlyRate: 35,
    workerType: 'salaried',
    asNumber: '',
    phone: '',
    address: '',
    hireDate: '2026-06-03',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&q=80',
    businessName: '',
    gstNumber: '',
    sin: '',
    employeeProvince: 'QC',
    payFrequency: 'weekly',
    annualSalary: 0
  });
  const [newProjectForm, setNewProjectForm] = useState({ name: '', clientName: '', address: '', latitude: 45.5088, longitude: -73.5540, radius: 100, status: 'active' });
  // Éditeur GPS d'un chantier existant (ex: chantier créé par l'IA sans coordonnées)
  const [gpsEditProjectId, setGpsEditProjectId] = useState<string | null>(null);
  const [gpsEditForm, setGpsEditForm] = useState({ address: '', latitude: 0, longitude: 0, radius: 100 });
  const [newClientForm, setNewClientForm] = useState({ name: '', company: '', email: '', phone: '', address: '' });
  const [newInventoryForm, setNewInventoryForm] = useState({ name: '', quantity: 10, unit: 'pqt', emoji: '📦', minThreshold: 5 });
  const [newOrderForm, setNewOrderForm] = useState({ supplierName: 'Toiture Express', items: [{ name: '', quantity: 1, price: 50 }] });

  // Custom states for Inventory, Catalogue, Supplier Orders & App Tour
  const [inventorySubTab, setInventorySubTab] = useState<'stock' | 'catalogue'>('stock');
  const [showAddInventoryForm, setShowAddInventoryForm] = useState(false);
  const [showAddOrderForm, setShowAddOrderForm] = useState(false);
  const [orderSupplier, setOrderSupplier] = useState('');
  const [orderItems, setOrderItems] = useState<Array<{ name: string; quantity: number; price: number }>>([{ name: '', quantity: 20, price: 5.5 }]);
  const [tourStep, setTourStep] = useState<number | null>(null);

  // Intelligent floating AI Agent state
  const [aiChatOpen, setAiChatOpen] = useState<boolean>(false);
  const [aiMessage, setAiMessage] = useState<string>('');
  const [aiHistory, setAiHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string; simulated?: boolean; imagePreviewUrl?: string; pdfName?: string; sourceLabel?: string }>>([
    { role: 'assistant', text: t.aiWarmWelcome }
  ]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Photo ou document PDF joint au prochain message IA (image redimensionnée côté client)
  const [aiImageAttachment, setAiImageAttachment] = useState<{ dataUrl: string; mimeType: string; name?: string } | null>(null);
  const aiPhotoInputRef = useRef<HTMLInputElement | null>(null);
  // Dictée vocale (Web Speech API) et lecture des réponses à voix haute
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const voiceEnabledRef = useRef<boolean>(false);
  voiceEnabledRef.current = voiceEnabled;

  // Geofencing override simulation tools (helps test geofencing easily without actual hardware gps coordinates matching exactly)
  const [geofencingBypass, setGeofencingBypass] = useState<boolean>(false);

  // Time tracker for active punch
  const timerIntervalRef = useRef<any>(null);

  useEffect(() => {
    // Sync current active session
    if (activeEmployee) {
      const liveSession = punchSessions.find(p => p.employeeId === activeEmployee.id && p.endTime === null);
      setActivePunchSession(liveSession || null);

      if (liveSession && !liveSession.pausedAt) {
        // Run timer
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        
        timerIntervalRef.current = setInterval(() => {
          const start = new Date(liveSession.startTime).getTime();
          const now = new Date().getTime();
          // subtract cumulative pause
          let elapsedMs = now - start;
          const pauseMinutes = liveSession.totalPauseMinutes || 0;
          elapsedMs = elapsedMs - (pauseMinutes * 60 * 1000);
          
          if (elapsedMs < 0) elapsedMs = 0;

          const totalSeconds = Math.floor(elapsedMs / 1000);
          const hrs = Math.floor(totalSeconds / 3600);
          const mins = Math.floor((totalSeconds % 3600) / 60);
          const secs = totalSeconds % 60;
          const display = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          
          setTimerDisplay(display);

          // Simulate earnings in real-time
          let currentEarnings = 0;
          const hoursDecimal = elapsedMs / 3600000;
          if (liveSession.payMode === 'horaire') {
            currentEarnings = hoursDecimal * liveSession.rate;
          } else if (liveSession.payMode === 'forfait') {
            currentEarnings = liveSession.rate;
          } else if (liveSession.payMode === 'surface') {
            currentEarnings = Number(liveSession.rate); // base starting rate, addition occurs on materials submit
          }
          setEarningsSimulation(Number(currentEarnings.toFixed(2)));
        }, 1000);
      } else {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (liveSession && liveSession.pausedAt) {
          setTimerDisplay(translations[currentLanguage].pausedWord);
        } else {
          setTimerDisplay("00:00:00");
          setEarningsSimulation(0);
        }
      }
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setActivePunchSession(null);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeEmployee, punchSessions]);

  // If active project is selected, set Default rates based on employee or mode
  useEffect(() => {
    if (homePunchProject) {
      const selectedProj = projects.find(p => p.id === homePunchProject);
      if (selectedProj && activeEmployee) {
        if (homePayMode === 'horaire') {
          setHomeRateCustom(activeEmployee.hourlyRate);
        } else if (homePayMode === 'forfait') {
          setHomeRateCustom(250); // General daily forfeit
        } else {
          setHomeRateCustom(12); // Mode surface default rate per pi²
        }
      }
    }
  }, [homePunchProject, homePayMode, activeEmployee, projects]);

  // If the company is not onboarded, redirect to the custom onboarding flow
  if (!isOnboarded) {
    return <Suspense fallback={<LazySectionFallback />}><OnboardingScreen /></Suspense>;
  }

  const handleSelectProfile = (empId: string) => {
    setSelectedEmpId(empId);
    setPinBuffer('');
    setLoginError(null);
  };

  const handlePinNumPress = (num: number) => {
    if (pinBuffer.length < 4) {
      const newPin = pinBuffer + String(num);
      setPinBuffer(newPin);
      if (newPin.length === 4) {
        // Trigger verification immediately
        handleTriggerLogin(newPin);
      }
    }
  };

  const handlePinBackspace = () => {
    setPinBuffer(pinBuffer.slice(0, -1));
  };

  const handleTriggerLogin = async (pinToTest: string) => {
    if (!selectedEmpId) return;
    // Le NIP est vérifié côté serveur (jeton de session) dès que le cloud est
    // configuré ; repli sur la vérification locale en mode hors-ligne.
    const res = await login(pinToTest, selectedEmpId);
    if (res.success) {
      // Clear login flow
      setSelectedEmpId(null);
      setPinBuffer('');
      setLoginError(null);
      // Pre-select some visual options
      const preSelProj = projects.find(p => p.assignedEmployees.includes(selectedEmpId)) || projects[0];
      if (preSelProj) {
        setHomePunchProject(preSelProj.id);
      }
    } else {
      setLoginError(res.message);
      setPinBuffer('');
    }
  };

  // Sound cues simulated with Web Audio API when user punches in/out or takes a break!
  const playSoundCue = (type: 'in' | 'out' | 'pause') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioContext();
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      const volume = (companyInfo.voiceReminderVolume || 80) / 100;
      gainNode.gain.setValueAtTime(volume * 0.15, ctx.currentTime);

      if (type === 'in') {
        // High ascending construction alert bim-bam
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.4);
      } else if (type === 'out') {
        // Ascending-descending sound cue
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(600, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.4);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.45);
      } else {
        // Flat double chime for pause
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.15);
      }
    } catch (e) {
      console.warn("Web Audio API not supported or user gesture required first.");
    }
  };

  // Punch intelligent : mémorise et présélectionne le dernier chantier valide.
  useEffect(() => {
    if (!activeEmployee || activePunchSession) return;

    const availableProjects = activeEmployee.role === 'admin'
      ? projects.filter(project => project.status === 'active')
      : projects.filter(project =>
          project.status === 'active' && project.assignedEmployees.includes(activeEmployee.id)
        );

    if (availableProjects.length === 0) {
      if (homePunchProject) setHomePunchProject('');
      return;
    }

    let rememberedProject = '';
    try {
      rememberedProject = localStorage.getItem(`gcp_lastPunchProject_${activeEmployee.id}`) || '';
    } catch {
      rememberedProject = '';
    }

    const currentIsValid = availableProjects.some(project => project.id === homePunchProject);
    const nextProject = currentIsValid
      ? homePunchProject
      : availableProjects.find(project => project.id === rememberedProject)?.id || availableProjects[0].id;

    if (nextProject !== homePunchProject) setHomePunchProject(nextProject);
  }, [activeEmployee, activePunchSession, homePunchProject, projects]);

  const handlePunchInStart = () => {
    if (!activeEmployee || !homePunchProject) return;

    // Check geofencing on current design before allowing punch-in
    const validation = evaluateProjectGeofence(homePunchProject);
    
    // Attempted infraction log if geofencing is on and unauthorized
    if (!validation.canPunch && !geofencingBypass) {
      // Create a simulated punch attempt that gets logged in HR alerts to warn administrators!
      startPunchSession({
        employeeId: activeEmployee.id,
        projectId: homePunchProject,
        payMode: homePayMode,
        rate: homeRateCustom,
        withinGeofence: false,
        attemptedOutsideGeofence: true,
        outsideDetails: fmt(t.outsideDetails, { dist: validation.distance, max: validation.requiredRadius })
      });
      alert(fmt(t.geofenceBlockAlert, { dist: validation.distance }));
      return;
    }

    // Success punch-in
    startPunchSession({
      employeeId: activeEmployee.id,
      projectId: homePunchProject,
      payMode: homePayMode,
      rate: homeRateCustom,
      withinGeofence: true
    });

    try {
      localStorage.setItem(`gcp_lastPunchProject_${activeEmployee.id}`, homePunchProject);
    } catch {
      // Le punch demeure fonctionnel si le stockage local est indisponible.
    }
    
    playSoundCue('in');
    setShowPunchInModal(false);
  };

  const handlePunchOutConfirm = () => {
    if (!activeEmployee || !activePunchSession) return;

    // Stop session and output reported materials
    stopPunchSession(activePunchSession.id, reportedMaterials);
    playSoundCue('out');

    // Ajoute la session tout juste fermée à un brouillon de facture pour cet
    // employé (sous-traitant ou salarié), sans attendre une génération manuelle.
    if (activeEmployee.role !== 'admin') {
      generateDraftInvoiceForEmployee(activeEmployee.id);
    }

    // Reset reported materials list
    setReportedMaterials([]);
    setShowPunchOutModal(false);
  };

  const handleAddMaterialToReport = (materialName: string, quantity: number, unitPrice: number, emoji: string, unit: string) => {
    if (quantity <= 0) return;
    const existing = reportedMaterials.find(m => m.name === materialName);
    if (existing) {
      setReportedMaterials(reportedMaterials.map(m => m.name === materialName ? { ...m, quantity: m.quantity + quantity } : m));
    } else {
      setReportedMaterials([...reportedMaterials, { name: materialName, quantity, unitPrice, emoji, unit }]);
    }
  };

  // L'IA de gestion (données + actions) est réservée aux rôles de bureau ;
  // les employés/sous-traitants gardent l'assistant technique de chantier.
  const aiPrivileged = !!activeEmployee && (activeEmployee.role === 'admin' || activeEmployee.role === 'secretary');

  // Construit le contexte envoyé à l'IA pour les rôles privilégiés : un instantané
  // agrégé des données de l'app (revenus, dépenses, équipes, inventaire, etc.)
  // suivi du protocole d'actions que l'IA peut déclencher dans l'application.
  const buildAiAppContext = (): string => {
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7); // "2026-07"
    const inMonth = (dateStr?: string | null) => !!dateStr && dateStr.startsWith(monthPrefix);

    const monthPunches = punchSessions.filter(p => inMonth(p.startTime) && p.endTime);
    const punchStatsByEmployee = employees.map(emp => {
      const punches = monthPunches.filter(p => p.employeeId === emp.id);
      return {
        nom: emp.name, role: emp.role, tauxHoraire: emp.hourlyRate,
        heuresCeMois: Number(punches.reduce((s, p) => s + (p.totalWorkedHours || 0), 0).toFixed(1)),
        coutMainOeuvreCeMois: Number(punches.reduce((s, p) => s + (p.revenue || 0), 0).toFixed(2))
      };
    });
    const teamStats = motivationTeams.map(team => ({
      equipe: team.name,
      membres: team.memberIds.map(id => employees.find(e => e.id === id)?.name).filter(Boolean),
      heuresCeMois: Number(monthPunches
        .filter(p => team.memberIds.includes(p.employeeId))
        .reduce((s, p) => s + (p.totalWorkedHours || 0), 0).toFixed(1))
    }));
    const revenusClientsCeMois = documents
      .filter(d => d.type === 'invoice')
      .reduce((s, d) => s + (d.paymentsHistory || []).filter(p => inMonth(p.date)).reduce((x, p) => x + p.amount, 0), 0);
    const depensesCeMois = expenses.filter(e => inMonth(e.date)).reduce((s, e) => s + e.amount + (e.tax || 0), 0);
    const paiesVerseesCeMois = payrollPayments.filter(p => inMonth(p.date) && p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const coutMainOeuvreCeMois = monthPunches.reduce((s, p) => s + (p.revenue || 0), 0);

    const data = {
      dateDuJour: now.toISOString().split('T')[0],
      moisCourant: monthPrefix,
      financesDuMois: {
        revenusClientsEncaisses: Number(revenusClientsCeMois.toFixed(2)),
        depenses: Number(depensesCeMois.toFixed(2)),
        paiesVersees: Number(paiesVerseesCeMois.toFixed(2)),
        coutMainOeuvrePunches: Number(coutMainOeuvreCeMois.toFixed(2)),
        profitEstime: Number((revenusClientsCeMois - depensesCeMois - paiesVerseesCeMois).toFixed(2))
      },
      facturesClients: documents.slice(0, 15).map(d => ({
        numero: d.number, type: d.type, client: d.clientName, statut: d.status,
        total: d.total, solde: d.balanceDue
      })),
      employes: punchStatsByEmployee,
      equipes: teamStats,
      chantiers: projects.map(p => ({
        nom: p.name, client: p.clientName, statut: p.status,
        heuresCeMois: Number(monthPunches.filter(x => x.projectId === p.id).reduce((s, x) => s + (x.totalWorkedHours || 0), 0).toFixed(1))
      })),
      inventaire: inventory.map(i => ({
        nom: i.name, quantite: i.quantity, unite: i.unit, seuilMin: i.minThreshold,
        stockBas: i.quantity < i.minThreshold
      })),
      commandes: orders.slice(-8).map(o => ({ fournisseur: o.supplierName, date: o.date, statut: o.status, total: o.totalAmount })),
      clients: clients.map(c => c.name),
      depensesDuMoisParCategorie: expenses.filter(e => inMonth(e.date)).reduce((acc: Record<string, number>, e) => {
        acc[e.category] = Number(((acc[e.category] || 0) + e.amount).toFixed(2));
        return acc;
      }, {})
    };

    // NOTE SÉCURITÉ : cet instantané ne contient JAMAIS de NIP, de NAS/SIN,
    // de clés API ni de coordonnées bancaires. Les actions passent désormais
    // par du function calling à schéma strict défini côté serveur (apiRoutes.ts)
    // — l'ancien protocole texte <<<ACTION>>> est supprimé.
    return `DONNÉES EN DIRECT DE L'APPLICATION (l'utilisateur est ${activeEmployee?.role === 'admin' ? 'administrateur' : 'secrétaire'} : tu peux répondre à ses questions de gestion — profits, heures, équipes, inventaire, factures — à partir de ces données réelles) :
${JSON.stringify(data)}

Des outils (fonctions) te sont fournis pour créer ou modifier des données. N'appelle un outil QUE si l'utilisateur a clairement demandé l'action, n'invente jamais de données (demande les informations manquantes), et confirme en langage naturel ce que tu viens de faire.`;
  };

  // Exécute une action demandée par l'IA (rôles admin/secrétaire seulement) et
  // retourne une phrase de confirmation, ou un message d'erreur explicite.
  const executeAiAction = (params: any): string => {
    switch (params.action) {
      case 'create_employee': {
        if (!params.name || !params.role || typeof params.hourlyRate !== 'number') {
          return t.aiActMissingEmployee;
        }
        const nip = String(Math.floor(1000 + Math.random() * 9000));
        addEmployee({
          name: String(params.name),
          nip,
          role: (['admin', 'employee', 'secretary', 'accountant'].includes(params.role) ? params.role : 'employee') as EmployeeRole,
          hourlyRate: Math.max(0, Number(params.hourlyRate)),
          workerType: String(params.workerType || 'Ouvrier'),
          asNumber: String(params.asNumber || ''),
          phone: String(params.phone || ''),
          address: String(params.address || ''),
          hireDate: new Date().toISOString().split('T')[0],
          avatar: makeIconAvatar('👷', '#F97316')
        });
        return fmt(t.aiActEmployeeCreated, { name: String(params.name), nip });
      }
      case 'create_project': {
        if (!params.name) return t.aiActMissingProject;
        addProject({
          name: String(params.name),
          clientName: String(params.clientName || ''),
          address: String(params.address || ''),
          latitude: 0,
          longitude: 0,
          radius: 100,
          assignedEmployees: [],
          status: 'active'
        });
        return fmt(t.aiActProjectCreated, { name: String(params.name) });
      }
      case 'create_client': {
        if (!params.name) return t.aiActMissingClient;
        addClient({
          name: String(params.name),
          phone: String(params.phone || ''),
          email: String(params.email || ''),
          address: String(params.address || '')
        });
        return fmt(t.aiActClientCreated, { name: String(params.name) });
      }
      case 'add_inventory_item': {
        if (!params.name || typeof params.quantity !== 'number') {
          return t.aiActMissingItem;
        }
        addInventoryItem({
          name: String(params.name),
          quantity: Math.max(0, Number(params.quantity)),
          unit: String(params.unit || t.unitsWord),
          emoji: '📦',
          minThreshold: Math.max(0, Number(params.minThreshold ?? 5))
        });
        return fmt(t.aiActItemAdded, { name: String(params.name), qty: params.quantity, unit: String(params.unit || t.unitsWord) });
      }
      case 'adjust_inventory': {
        const item = inventory.find(i => i.name.toLowerCase() === String(params.name || '').toLowerCase());
        if (!item) return fmt(t.aiActItemNotFound, { name: String(params.name || '') });
        if (typeof params.quantity !== 'number') return t.aiActMissingQty;
        updateInventoryItem({ ...item, quantity: Math.max(0, Number(params.quantity)) });
        return fmt(t.aiActInventoryAdjusted, { name: item.name, qty: Math.max(0, Number(params.quantity)), unit: item.unit });
      }
      case 'create_expense': {
        const validCategories = ['materials', 'tools', 'fuel', 'rental', 'subcontractor', 'admin', 'other'];
        if (!params.provider || typeof params.amount !== 'number' || !validCategories.includes(params.category)) {
          return t.aiActMissingExpense;
        }
        // Associe le chantier par son nom si l'IA en a identifié un sur la facture
        const matchedProject = params.projectName
          ? projects.find(p => p.name.toLowerCase() === String(params.projectName).toLowerCase())
          : undefined;
        const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || ''))
          ? String(params.date)
          : new Date().toISOString().split('T')[0];
        const amount = Math.max(0, Number(params.amount));
        const tax = Math.max(0, Number(params.tax) || 0);
        addExpense({
          provider: String(params.provider),
          category: params.category,
          projectId: matchedProject?.id || '',
          amount,
          tax,
          date: expenseDate,
          notes: params.notes ? String(params.notes) : undefined
        });
        return fmt(t.aiActExpenseCreated, {
          provider: String(params.provider),
          amount: amount.toFixed(2),
          tax: tax.toFixed(2),
          category: String(params.category),
          date: expenseDate
        });
      }
      case 'create_order': {
        if (!params.supplierName || !Array.isArray(params.items) || params.items.length === 0) {
          return t.aiActMissingOrder;
        }
        const items = params.items
          .filter((it: any) => it && it.name)
          .map((it: any) => ({ name: String(it.name), quantity: Math.max(0, Number(it.quantity) || 0), price: Math.max(0, Number(it.price) || 0) }));
        const totalAmount = Number(items.reduce((s: number, it: any) => s + it.quantity * it.price, 0).toFixed(2));
        addSupplierOrder({
          supplierName: String(params.supplierName),
          date: new Date().toISOString().split('T')[0],
          items,
          status: 'ordered',
          totalAmount
        });
        return fmt(t.aiActOrderCreated, { name: String(params.supplierName), count: items.length, total: totalAmount.toFixed(2) });
      }
      default:
        return fmt(t.aiActUnknown, { action: String(params.action) });
    }
  };

  // Exécute les actions structurées retournées par le serveur (function calling
  // à schéma strict — voir AI_TOOL_DEFS dans apiRoutes.ts). Chaque action a déjà
  // été validée contre son schéma JSON côté serveur ; executeAiAction revalide
  // localement les champs requis avant toute mutation. Aucun texte libre n'est
  // jamais interprété comme une commande.
  const executeServerActions = (actions: Array<{ name: string; args: Record<string, any> }>): string[] => {
    if (!aiPrivileged || !Array.isArray(actions)) return [];
    return actions.slice(0, 5).map(a => {
      try {
        return executeAiAction({ action: a.name, ...(a.args || {}) });
      } catch {
        return t.aiActParseError;
      }
    });
  };

  // Lit la réponse de l'assistant à voix haute (si la lecture vocale est activée)
  const speakAiResponse = (text: string) => {
    if (!voiceEnabledRef.current || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    // Retire le formatage markdown et les emojis pour une lecture naturelle
    const clean = text.replace(/[*_#`]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = currentLanguage === 'FR' ? 'fr-CA' : 'en-US';
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  };

  // Dictée vocale : bascule l'écoute du micro (Web Speech API, si supportée)
  const handleToggleVoiceInput = () => {
    const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      alert(t.voiceNotSupported);
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = currentLanguage === 'FR' ? 'fr-CA' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join(' ');
      setAiMessage(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Photo ou PDF joint : les images sont réduites (max 1280px, JPEG) et les PDF
  // acceptés tels quels jusqu'à 3 Mo, pour rester sous les limites de taille des
  // fonctions serverless (~4.5 Mo sur Vercel, marge pour l'encodage base64)
  const handleAiPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      const MAX_PDF_BYTES = 3 * 1024 * 1024;
      if (file.size > MAX_PDF_BYTES) {
        alert(t.pdfTooBig);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAiImageAttachment({ dataUrl: reader.result as string, mimeType: 'application/pdf', name: file.name });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert(t.unsupportedFormat);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1280;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAiImageAttachment({ dataUrl, mimeType: 'image/jpeg', name: file.name });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Envoie le message au fournisseur IA via le proxy serveur protégé (/api/chat).
  // La clé API vit EXCLUSIVEMENT dans les variables d'environnement du serveur
  // (Vercel) : aucune clé n'est transmise au ou depuis le navigateur, et le
  // navigateur n'appelle jamais directement un fournisseur IA.
  const handleSendAiMessage = async () => {
    const attachment = aiImageAttachment;
    if (!aiMessage.trim() && !attachment) return;

    const attachmentIsPdf = attachment?.mimeType === 'application/pdf';
    const userText = aiMessage.trim() || (attachmentIsPdf
      ? t.analyzePdf
      : t.analyzePhoto);
    // Pièce jointe encodée pour l'API : base64 sans le préfixe data:
    const imagePayload = attachment
      ? { mimeType: attachment.mimeType, data: attachment.dataUrl.split(',')[1], name: attachment.name }
      : undefined;
    setAiHistory(prev => [...prev, {
      role: 'user',
      text: userText,
      imagePreviewUrl: attachment && !attachmentIsPdf ? attachment.dataUrl : undefined,
      pdfName: attachmentIsPdf ? (attachment?.name || 'document.pdf') : undefined
    }]);
    setAiMessage('');
    setAiImageAttachment(null);
    setIsAiLoading(true);

    const provider = companyInfo.aiProvider || 'gemini';
    const regionLabel = `${regionName} (${companyCountry === 'US' ? (currentLanguage === 'FR' ? 'États-Unis' : 'United States') : 'Canada'})`;
    // Contexte de gestion (données agrégées, sans données sensibles) : réservé aux admins/secrétaires
    const appContext = aiPrivileged ? buildAiAppContext() : undefined;

    try {
      const PROVIDER_NAMES: Record<string, string> = { anthropic: 'Anthropic Claude', openai: 'OpenAI', gemini: 'Google Gemini' };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          message: userText,
          provider,
          regionLabel,
          image: imagePayload,
          appContext,
          language: currentLanguage,
          // Les outils (actions) ne sont activés que pour les rôles de bureau ;
          // le serveur revérifie le rôle porté par le jeton de session.
          allowActions: aiPrivileged
        })
      });
      let data: any = null;
      try {
        data = JSON.parse(await res.text());
      } catch { /* réponse non-JSON (proxy absent) : traitée comme injoignable */ }

      if (data && res.ok) {
        // Actions structurées (function calling) validées par le serveur
        const notes = executeServerActions(data.actions || []);
        const displayText = String(data.reply || '').trim() || (notes.length ? t.actionDone : t.aiGenericError);
        const sourceLabel = !data.simulated && data.provider
          ? `${PROVIDER_NAMES[data.provider] || data.provider} · ${t.keyServerSource}`
          : undefined;
        setAiHistory(prev => [
          ...prev,
          { role: 'assistant', text: displayText, simulated: data.simulated, sourceLabel },
          ...notes.map(note => ({ role: 'assistant' as const, text: note }))
        ]);
        speakAiResponse(displayText);
      } else if (res.status === 401) {
        setAiHistory(prev => [...prev, { role: 'assistant', text: t.aiAuthRequired }]);
      } else if (data && data.error) {
        setAiHistory(prev => [...prev, { role: 'assistant', text: String(data.error) }]);
      } else {
        setAiHistory(prev => [...prev, { role: 'assistant', text: t.aiServerUnreachable }]);
      }
    } catch (err: any) {
      console.error(err);
      setAiHistory(prev => [...prev, {
        role: 'assistant',
        text: err?.message
          ? fmt(t.aiErrorWithMsg, { msg: err.message })
          : t.aiNetworkError
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Quick statistics totals for Admin Dashboard
  const getAdminStats = () => {
    const totalWages = punchSessions.reduce((sum, p) => sum + p.revenue, 0);
    const totalHrs = punchSessions.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
    const activeWorkersCount = punchSessions.filter(p => p.endTime === null).length;
    return {
      totalWages,
      totalHrs,
      activeWorkersCount
    };
  };

  // Progressive Tax Bracket Estimator — s'adapte au pays/province de la compagnie
  // au lieu de présumer le Québec. Pour les États-Unis, l'impôt fédéral/état n'est
  // pas modélisé en détail (affiché avec une mention "à valider" dans l'UI).
  const calculateProgressiveTax = (annualGross: number, isFederal: boolean) => {
    if (companyCountry === 'US') {
      return 0;
    }
    if (isFederal) {
      return computeBracketTax(annualGross, CA_FEDERAL_BRACKETS);
    }
    const brackets = CA_PROVINCIAL_BRACKETS[companyRegion.code];
    return brackets ? computeBracketTax(annualGross, brackets) : annualGross * CA_PROVINCIAL_FALLBACK_RATE;
  };

  const calculateDetailedPayroll = (emp: Employee, company: CompanyInfo, hours: number) => {
    let gross = hours * emp.hourlyRate;
    const isContractor = emp.workerType === 'contractor';

    if (isContractor) {
      // Contractors (no source deductions or benefits, add sales taxes of the company's region if registered)
      const hasGst = !!emp.gstNumber;
      const gst = hasGst ? gross * companyRegion.taxRate1 : 0;
      const qst = hasGst ? gross * companyRegion.taxRate2 : 0;
      const totalTaxes = gst + qst;
      const net = gross + totalTaxes;

      return {
        gross,
        vacationAmount: 0,
        cpp: 0,
        ei: 0,
        fedTax: 0,
        provTax: 0,
        health: 0,
        dental: 0,
        life: 0,
        ltd: 0,
        rrsp: 0,
        eap: 0,
        custom1: 0,
        custom2: 0,
        gst,
        qst,
        totalTaxes,
        totalDeductions: 0,
        net
      };
    }

    // Pay frequency periods
    const frequency = emp.payFrequency || 'weekly';
    let periods = 52;
    if (frequency === 'biweekly') periods = 26;
    else if (frequency === 'semi-monthly') periods = 24;
    else if (frequency === 'monthly') periods = 12;

    // Use annual base salary if defined
    if (emp.annualSalary && emp.annualSalary > 0) {
      gross = emp.annualSalary / periods;
    }

    // Vacation rate percentage
    const vacRate = emp.vacationRateOverride !== undefined 
      ? emp.vacationRateOverride 
      : (company.payrollVacationRate !== undefined ? company.payrollVacationRate : 6);
    const vacationAmount = gross * (vacRate / 100);

    // Source deductions (pension + secondary deduction rates adapt to the company's province/state)
    const cpp = gross * payrollMeta.pensionRate;
    const ei = gross * payrollMeta.secondaryDeductionRate;
    
    // Income taxes
    const annualGross = gross * periods;
    const fedTaxAnn = calculateProgressiveTax(annualGross, true);
    const provTaxAnn = calculateProgressiveTax(annualGross, false);
    
    const fedTax = fedTaxAnn / periods;
    const provTax = provTaxAnn / periods;

    // Company benefits & deductions
    const health = company.payrollHealthInsurance || 0;
    const dental = company.payrollDentalInsurance || 0;
    const life = company.payrollLifeInsurance || 0;
    const ltd = company.payrollLTD || 0;
    const rrsp = gross * ((company.payrollRRSP || 0) / 100);
    const eap = company.payrollEAP || 0;
    const custom1 = company.payrollCustom1Amount || 0;
    const custom2 = company.payrollCustom2Amount || 0;

    const totalDeductions = cpp + ei + fedTax + provTax + health + dental + life + ltd + rrsp + eap + custom1 + custom2;
    const net = (gross + vacationAmount) - totalDeductions;

    return {
      gross,
      vacationAmount,
      cpp,
      ei,
      fedTax,
      provTax,
      health,
      dental,
      life,
      ltd,
      rrsp,
      eap,
      custom1,
      custom2,
      gst: 0,
      qst: 0,
      totalTaxes: 0,
      totalDeductions,
      net: Math.max(0, net)
    };
  };

  // Simule les déductions à la source pour un salaire brut ponctuel, avec les
  // taux et le régime de retraite adaptés à la province/état de la compagnie.
  const calculateSimulatedDeductions = (gross: number) => {
    const provRate = companyCountry === 'US' ? 0 : (CA_PROVINCIAL_BRACKETS[companyRegion.code]?.[0].rate ?? CA_PROVINCIAL_FALLBACK_RATE);
    const fedTax = companyCountry === 'US' ? 0 : gross * CA_FEDERAL_BRACKETS[0].rate;
    const provTax = gross * provRate;
    const rrq = gross * payrollMeta.pensionRate;
    const ae = gross * payrollMeta.secondaryDeductionRate;
    const net = gross - fedTax - provTax - rrq - ae;
    return {
      fedTax,
      provTax,
      rrq,
      ae,
      net: Math.max(0, net)
    };
  };

  return (
    <div 
      id="main-scaffold-container"
      className="min-h-screen bg-[#0F1115] text-[#E0E2E6] font-sans pb-24 pt-16 flex flex-col relative select-none"
    >
      {cloudSyncing && (
        <div className="fixed top-1 right-1 z-[100] px-2 py-1 rounded bg-black/60 text-[10px] font-mono text-orange-400 tracking-wide pointer-events-none">
          {t.cloudSyncing}
        </div>
      )}
      {/* Top Navbar */}
      <nav id="navbar-scaffold" className="fixed top-0 left-0 right-0 h-16 border-b border-gray-800 bg-[#16191F] px-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-600 rounded flex items-center justify-center font-bold text-white shadow-md">
            HX
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-tight text-white leading-none">
              {companyInfo.name}
            </h1>
            <span className="text-[10px] text-orange-500 font-mono tracking-widest font-bold">
              {t.appName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Guide Interactif de Validation */}
          <button
            onClick={() => setTourStep(0)}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-[10px] font-black rounded cursor-pointer transition shadow border border-orange-500/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            </span>
            <span>{t.validationGuideBtn}</span>
          </button>

          {/* FR / EN Switcher */}
          <button
            id="lang-toggle-nav"
            onClick={() => setLanguage(currentLanguage === 'FR' ? 'EN' : 'FR')}
            className="px-3 py-1 bg-gray-800 text-[11px] font-bold rounded hover:bg-gray-700 transition cursor-pointer"
          >
            {currentLanguage}
          </button>

          {/* User Signout */}
          {activeEmployee && (
            <div className="flex items-center gap-2 border-l border-gray-800 pl-3">
              <span className="hidden md:inline text-xs font-semibold text-gray-300">
                {activeEmployee.name} ({activeEmployee.role === 'admin' ? t.roleAdmin : t.roleEmployee})
              </span>
              <EmployeeAvatar
                src={activeEmployee.avatar}
                name={activeEmployee.name}
                className="w-10 h-10 rounded-full border border-gray-700 object-cover"
              />
              <button
                onClick={logout}
                className="text-xs px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded cursor-pointer transition"
              >
                {t.logoutBtn}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ----------------- LOGIN CANVAS (IF NOT CONNECTED) ----------------- */}
      {!activeEmployee ? (
        <div id="login-container-wrapper" className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-xl bg-[#16191F] border border-gray-800 rounded-2xl shadow-2xl p-6 md:p-8">
            <div className="text-center mb-8">
              <span className="text-xs uppercase font-mono tracking-widest text-orange-500 font-bold">
                {t.loginPortal} — {t.companyPrefix}
              </span>
              <h2 className="text-2xl font-black text-white mt-1">
                {t.welcomeHeader}
              </h2>
              <p className="text-xs text-gray-400 mt-2">
                {t.loginSubtitle}
              </p>
            </div>

            {/* Profile Selection Grid */}
            {!selectedEmpId ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => handleSelectProfile(emp.id)}
                    className="p-4 rounded-xl bg-gray-800/50 hover:bg-orange-500/10 border border-gray-800 hover:border-orange-500/40 text-center flex flex-col items-center justify-center gap-3 transition cursor-pointer"
                  >
                    <EmployeeAvatar
                      src={emp.avatar}
                      name={emp.name}
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-700 shadow"
                    />
                    <div className="min-w-0 w-full">
                      <p className="text-xs font-bold text-white truncate text-center mb-1">{emp.name}</p>
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        {emp.role === 'admin' ? t.roleAdmin : emp.workerType}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* PIN Code Passcode Interface */
              <div className="flex flex-col items-center">
                {/* Back button */}
                <button
                  onClick={() => { setSelectedEmpId(null); setLoginError(null); }}
                  className="self-start text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1 mb-6 cursor-pointer"
                >
                  {t.backToProfiles}
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <EmployeeAvatar
                    src={employees.find(e => e.id === selectedEmpId)?.avatar}
                    name={employees.find(e => e.id === selectedEmpId)?.name || ''}
                    className="w-14 h-14 rounded-full object-cover border border-orange-500"
                  />
                  <div className="text-left">
                    <p className="text-xs text-gray-400 font-mono text-left uppercase">{t.loginInProgress}</p>
                    <h3 className="text-sm font-bold text-white leading-none">
                      {employees.find(e => e.id === selectedEmpId)?.name}
                    </h3>
                  </div>
                </div>

                <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-4">
                  {t.enterPin}
                </p>

                {/* PIN Mask Dots */}
                <div className="flex items-center gap-4 mb-6">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                        pinBuffer.length > index
                          ? 'bg-orange-500 border-orange-400 scale-110 shadow-[0_0_10px_rgba(234,88,12,0.4)]'
                          : 'border-gray-700 bg-transparent'
                      }`}
                    ></div>
                  ))}
                </div>

                {loginError && (
                  <p className="text-[11px] font-bold text-red-500 uppercase mb-4 px-3 py-1.5 bg-red-950/20 border border-red-500/30 rounded">
                    ⚠️ {loginError}
                  </p>
                )}

                {/* Secure Numpad layout */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => handlePinNumPress(num)}
                      className="h-14 rounded-full bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold text-xl cursor-pointer transition flex items-center justify-center border border-gray-700/50"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => setPinBuffer('')}
                    className="h-14 rounded-full bg-gray-900 hover:bg-gray-800 text-[11px] font-bold cursor-pointer text-gray-500 transition flex items-center justify-center"
                  >
                    {t.clearBtn}
                  </button>
                  <button
                    onClick={() => handlePinNumPress(0)}
                    className="h-14 rounded-full bg-gray-800 hover:bg-gray-700 text-white font-bold text-xl cursor-pointer transition flex items-center justify-center border border-gray-700/50"
                  >
                    0
                  </button>
                  <button
                    onClick={handlePinBackspace}
                    className="h-14 rounded-full bg-red-950/20 hover:bg-red-500/20 text-red-400 font-bold text-lg cursor-pointer transition flex items-center justify-center border border-red-500/30"
                  >
                    ⌫
                  </button>
                </div>

                <p className="text-[10px] text-gray-500 font-mono mt-6 text-center">
                  {t.defaultAdminCode} <span className="font-bold text-white">0000</span>
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ----------------- WORKSPACE (LOGGED IN) ----------------- */
        <div id="workspace-scaffold-layout" className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
          
          {/* Main Display Pane */}
          <div id="workspace-main-panel" className="flex-1 min-w-0 flex flex-col gap-6">

            {/* If GPS verification or Geofencing simulation is active, show ambient banner at the top */}
            {activeEmployee && companyInfo.geofencingEnabled && (
              <div className="bg-[#121620] border-2 border-orange-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-xs text-orange-400 font-bold uppercase tracking-wide">
                    {t.geoProximityLabel} {geofencingBypass ? t.simulatedOnSite : t.realGPS}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setGeofencingBypass(!geofencingBypass)}
                    className={`text-[10px] uppercase font-mono px-2 py-1 rounded border cursor-pointer transition ${
                      geofencingBypass ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
                    }`}
                  >
                    {geofencingBypass ? t.bypassActive : t.bypassEnable}
                  </button>
                  <button 
                    onClick={checkLocation}
                    disabled={isChecking}
                    className="p-1 px-2.5 bg-gray-800 text-[10px] font-bold hover:bg-gray-700 text-white rounded border border-gray-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>{t.refreshPosition}</span>
                  </button>
                </div>
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : ACCUEIL -------------------- */}
            {activeTab === 'home' && (
              <div id="view-home-content" className="flex flex-col gap-6">
                
                {/* 1. Header welcome */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-[#16191F] border border-gray-800 rounded-2xl p-6">
                  <div>
                    <h3 className="text-2xl font-black text-white">
                      {t.hello} {activeEmployee.name} !
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">
                      {activeEmployee.role === 'admin' 
                        ? t.adminFullAccess 
                        : `${activeEmployee.workerType} — ${t.teamLevel} ${activeEmployee.level}`}
                    </p>
                  </div>
                  
                  {/* XP progress bar and Gamified Weekly Goals compact widget */}
                  {activeEmployee.role !== 'admin' && (() => {
                    const empWeeklyGoal = weeklyGoals?.find(wg => wg.employeeId === activeEmployee.id);
                    const target = empWeeklyGoal ? empWeeklyGoal.targetAmount : 1500;
                    const current = empWeeklyGoal ? empWeeklyGoal.currentAmount : 0;
                    const streak = empWeeklyGoal ? empWeeklyGoal.streak : 1;
                    const percentGoal = Math.min(100, Math.round((current / target) * 100)) || 0;

                    const getLevelTitle = (lvl: number) => {
                      const idx = Math.min(Math.max(1, lvl), 7) - 1;
                      return t.levelTitles[idx];
                    };

                    return (
                      <div className="w-full lg:w-auto bg-[#1A1E26] rounded-2xl p-4 border border-gray-800 flex flex-col md:flex-row items-center gap-6 shadow-lg">
                        {/* Weekly Revenue progress */}
                        <div className="w-full sm:w-56 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-400">
                            <span>{t.weeklyGoalLabel}</span>
                            <span className="text-orange-400 font-mono font-bold">{current}$ / {target}$</span>
                          </div>
                          <div className="h-2 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                            <div 
                              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-700" 
                              style={{ width: `${percentGoal}%` }}
                            ></div>
                          </div>
                          <p className="text-[9px] text-gray-500 font-mono text-right">{percentGoal}% {t.completedWord}</p>
                        </div>

                        {/* XP and Level title */}
                        <div className="w-full sm:w-56 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-400">
                            <span className="truncate max-w-[130px]">{getLevelTitle(activeEmployee.level)}</span>
                            <span className="text-cyan-400 font-mono font-bold">Lvl {activeEmployee.level}</span>
                          </div>
                          <div className="h-2 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                            <div 
                              className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-full transition-all duration-700" 
                              style={{ width: `${(activeEmployee.xp % 1000) / 10}%` }}
                            ></div>
                          </div>
                          <p className="text-[9px] text-gray-500 font-mono flex justify-between">
                            <span>XP: {activeEmployee.xp % 1000}/1000</span>
                            <span>{t.nextLabel}: {1000 - (activeEmployee.xp % 1000)} XP</span>
                          </p>
                        </div>

                        {/* Streak fire badge */}
                        <div className="flex items-center gap-2 bg-gray-950/60 p-2.5 rounded-xl border border-gray-850 self-stretch justify-center">
                          <span className={`text-xl ${streak >= 3 ? 'animate-bounce' : 'grayscale opacity-60'}`}>🔥</span>
                          <div className="text-left font-mono">
                            <span className="text-amber-500 font-black text-xs block leading-none">{streak} {t.daysLabel}</span>
                            <span className="text-[8px] uppercase font-bold text-gray-500 tracking-wider">{t.streakLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {activeEmployee.role === 'admin' && (() => {
                  const activePunchCount = punchSessions.filter(punch => punch.endTime === null).length;
                  const overdueInvoiceCount = documents.filter(document =>
                    document.type === 'invoice' && document.status === 'overdue'
                  ).length;
                  const outstandingAmount = documents
                    .filter(document => document.type === 'invoice' && ['overdue', 'sent'].includes(document.status))
                    .reduce((sum, document) => sum + Number(document.balanceDue ?? document.total ?? 0), 0);
                  const unresolvedHrAlertCount = hrAlerts.filter(alert => !alert.resolved).length;
                  const todayLabel = new Date().toLocaleDateString(
                    currentLanguage === 'FR' ? 'fr-CA' : 'en-CA',
                    { weekday: 'long', day: 'numeric', month: 'long' }
                  );

                  return (
                    <section id="admin-today-banner" className="bg-[#16191F] border border-gray-800 rounded-2xl p-4 space-y-4">
                      <h3 className="text-base font-black text-white flex flex-wrap items-baseline gap-2">
                        <span>📅 {currentLanguage === 'FR' ? "Aujourd'hui" : 'Today'}</span>
                        <span className="text-xs text-gray-400 font-semibold capitalize">{todayLabel}</span>
                      </h3>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-xl p-3 flex flex-col gap-1 bg-gray-950/60 border border-gray-850">
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'Punchs actifs' : 'Active punches'}
                          </span>
                          <span className={`text-2xl font-black ${activePunchCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                            {activePunchCount > 0 ? '🟢 ' : ''}{activePunchCount}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab('documents')}
                          className={`rounded-xl p-3 flex flex-col gap-1 text-left transition ${
                            overdueInvoiceCount > 0
                              ? 'bg-red-950/35 border border-red-700/70 hover:bg-red-950/50'
                              : 'bg-gray-950/60 border border-gray-850 hover:border-gray-700'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'Factures en retard' : 'Overdue invoices'}
                          </span>
                          <span className={`text-2xl font-black ${overdueInvoiceCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {overdueInvoiceCount > 0 ? '🔴 ' : ''}{overdueInvoiceCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('documents')}
                          className="rounded-xl p-3 flex flex-col gap-1 text-left bg-gray-950/60 border border-gray-850 hover:border-amber-600/60 transition"
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'À encaisser' : 'To collect'}
                          </span>
                          <span className="text-2xl font-black text-amber-400">
                            {outstandingAmount.toLocaleString(currentLanguage === 'FR' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 0 })}$
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { setActiveTab('settings'); setActiveSettingsTab(0); }}
                          className={`rounded-xl p-3 flex flex-col gap-1 text-left transition ${
                            unresolvedHrAlertCount > 0
                              ? 'bg-amber-950/30 border border-amber-700/70 hover:bg-amber-950/45'
                              : 'bg-gray-950/60 border border-gray-850 hover:border-gray-700'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'Alertes RH' : 'HR alerts'}
                          </span>
                          <span className={`text-2xl font-black ${unresolvedHrAlertCount > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                            {unresolvedHrAlertCount > 0 ? '⚠️ ' : ''}{unresolvedHrAlertCount}
                          </span>
                        </button>
                      </div>
                    </section>
                  );
                })()}

                {/* 2. EMPLOYEE DASHBOARD (WITH CENTRAL ROUND PUNCH BUTTON) */}
                {activeEmployee.role !== 'admin' ? (
                  <div className="flex flex-col items-center py-8 bg-[#16191F] border border-gray-800 rounded-2xl p-6 relative overflow-hidden">
                    
                    {/* Punch State Info Banner */}
                    <div className="text-center mb-8 space-y-1">
                      {activePunchSession ? (
                        <>
                          <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-sm font-black uppercase px-4 py-1.5 rounded-full inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span>
                            {t.punchActiveOn} {activePunchSession.projectName}
                          </span>
                          <p className="text-sm font-bold text-gray-300 font-mono tracking-wide">
                            {t.sessionRate} {activePunchSession.rate}$ / {activePunchSession.payMode}
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-black uppercase px-4 py-1.5 rounded-full inline-block">
                            {t.inactiveAvailable}
                          </span>
                          <p className="text-sm text-gray-300 font-bold mt-2 max-w-md">
                            {t.selectSiteHint}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Checklist Tâches & Outils du chantier actif */}
                    {activePunchSession && (() => {
                      const activeProject = projects.find(p => p.id === activePunchSession.projectId);
                      return activeProject ? (
                        <div className="w-full max-w-md mb-8 -mt-4 bg-gray-950/60 border border-gray-800 rounded-2xl p-3">
                          <Suspense fallback={<LazySectionFallback />}>
                            <ProjectTasksAndTools project={activeProject} defaultOpen bordered={false} />
                          </Suspense>
                        </div>
                      ) : null;
                    })()}

                    {/* CENTRAL PUNCH BUTTON with Theme Styles */}
                    <div className="relative w-[230px] h-[230px] flex items-center justify-center mb-8">
                      {/* Concentric ambient backing */}
                      <div className="absolute inset-0 rounded-full border border-gray-800 animate-pulse"></div>
                      <div className="absolute inset-4 rounded-full border border-gray-800"></div>

                      <button
                        onClick={() => {
                          if (activePunchSession) {
                            setShowPunchOutModal(true);
                          } else {
                            setShowPunchInModal(true);
                          }
                        }}
                        className={`relative w-[200px] h-[200px] rounded-full flex flex-col items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-2xl border-2 ${
                          currentTheme === 'quantum' 
                            ? 'bg-gradient-to-br from-[#113a47] via-[#0b2933] to-[#071d24] border-cyan-500 shadow-cyan-950/40 text-cyan-200' 
                            : currentTheme === 'xp' 
                            ? 'bg-gradient-to-br from-[#3e1e5c] via-[#2a133e] to-[#1a0a29] border-purple-500 shadow-purple-950/40 text-purple-200'
                            : currentTheme === 'deco'
                            ? 'bg-gradient-to-br from-[#4e3a1f] via-[#352514] to-[#20150a] border-amber-500 shadow-amber-950/40 text-amber-100'
                            : currentTheme === 'inferno'
                            ? 'bg-gradient-to-br from-[#6b201a] via-[#45120e] to-[#240806] border-orange-600 shadow-orange-950/40 text-orange-200'
                            : currentTheme === 'arctic'
                            ? 'bg-gradient-to-br from-[#1d4c5c] via-[#10303c] to-[#091f27] border-sky-300 shadow-sky-950/45 text-sky-100'
                            : 'bg-gradient-to-br from-[#2f3136] via-[#1e2022] to-[#121314] border-zinc-650 shadow-black text-neutral-200'
                        }`}
                      >
                        {/* Rivets / ornaments for Carbon or Deco */}
                        {currentTheme === 'carbon' && (
                          <>
                            <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-zinc-600 border border-black shadow"></div>
                            <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-zinc-600 border border-black shadow"></div>
                            <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-zinc-600 border border-black shadow"></div>
                            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-zinc-600 border border-black shadow"></div>
                          </>
                        )}
                        {currentTheme === 'deco' && (
                          <div className="absolute inset-1.5 rounded-full border border-amber-600/30"></div>
                        )}

                        {/* Theme Specifc Icons */}
                        <div className="mb-2">
                          {currentTheme === 'quantum' && <User className="w-8 h-8 text-cyan-400 animate-pulse" />}
                          {currentTheme === 'xp' && <Award className="w-8 h-8 text-purple-400" />}
                          {currentTheme === 'deco' && <Coins className="w-8 h-8 text-amber-500" />}
                          {currentTheme === 'inferno' && <Activity className="w-8 h-8 text-orange-500 animate-bounce" />}
                          {currentTheme === 'arctic' && <Layers className="w-8 h-8 text-sky-300" />}
                          {currentTheme === 'carbon' && <Laptop className="w-8 h-8 text-zinc-400" />}
                        </div>

                        {/* Text Label */}
                        <span className="text-2xl font-black uppercase tracking-tight text-white">
                          {activePunchSession ? t.punchOut : t.punchIn}
                        </span>

                        {/* Real-time Dynamic Timer */}
                        <span className="text-sm font-mono text-gray-300 mt-1 uppercase tracking-widest font-black">
                          {activePunchSession ? timerDisplay : "00:00:00"}
                        </span>

                        {/* Real-time earnings simulator underneath */}
                        {activePunchSession && (
                          <span className="text-xs uppercase font-black text-green-400 mt-1 px-2.5 py-1 rounded bg-green-950/40 border border-green-500/20">
                            + {earningsSimulation}$
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Mini Quick Stats Cards for Employee */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                      <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-3 text-center">
                        <p className="text-[9px] uppercase font-bold text-gray-500">{t.hoursWorkedToday}</p>
                        <p className="text-lg font-bold text-white mt-1">
                          {punchSessions
                            .filter(p => p.employeeId === activeEmployee.id && p.startTime.startsWith(new Date().toISOString().split('T')[0]))
                            .reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0).toFixed(2)}h
                        </p>
                      </div>
                      
                      <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-3 text-center">
                        <p className="text-[9px] uppercase font-bold text-gray-500">{t.earningsToday}</p>
                        <p className="text-lg font-bold text-green-400 mt-1">
                          {punchSessions
                            .filter(p => p.employeeId === activeEmployee.id && p.startTime.startsWith(new Date().toISOString().split('T')[0]))
                            .reduce((sum, p) => sum + p.revenue, 0).toFixed(2)}$
                        </p>
                      </div>

                      <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-3 text-center">
                        <p className="text-[9px] uppercase font-bold text-gray-500">{t.pauseStatus}</p>
                        {activePunchSession ? (
                          <button
                            onClick={() => {
                              playSoundCue('pause');
                              if (activePunchSession.pausedAt) {
                                resumePunchSession(activePunchSession.id);
                              } else {
                                pausePunchSession(activePunchSession.id);
                              }
                            }}
                            className={`w-full mt-1.5 py-1 text-[10px] font-bold rounded uppercase cursor-pointer ${
                              activePunchSession.pausedAt 
                                ? 'bg-orange-600 text-white animate-pulse' 
                                : 'bg-gray-750 text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {activePunchSession.pausedAt ? t.resumeBtn : t.takeBreakBtn}
                          </button>
                        ) : (
                          <p className="text-xs text-gray-500 mt-2 font-mono">{t.notLoggedIn}</p>
                        )}
                      </div>

                      <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-3 text-center flex flex-col justify-center">
                        <p className="text-[9px] uppercase font-bold text-gray-500">{t.gpsValidation}</p>
                        <span className="text-xs text-orange-400 font-mono font-bold mt-1.5">
                          {geofencingBypass ? t.distanceFromSiteDemo : t.gpsActive}
                        </span>
                      </div>
                    </div>

                    {/* Calendrier réel des journées travaillées — employés et secrétaire */}
                    <div className="w-full mt-6 border-t border-gray-800 pt-6">
                      <Suspense fallback={<LazySectionFallback />}>
                        <EmployeeWorkCalendar
                          employee={activeEmployee}
                          punchSessions={punchSessions}
                          projects={projects}
                          currentLanguage={currentLanguage}
                          embedded
                        />
                      </Suspense>
                    </div>

                  </div>
                ) : (
                  
                  /* ADMIN TEAM DASHBOARD INSIDE HOMETAB */
                  <div className="flex flex-col gap-6">
                    {/* Key numbers cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      
                      <div className="bg-[#16191F] border border-gray-800 rounded-2xl p-5 flex items-center gap-5 shadow-lg">
                        <div className="p-4 bg-orange-600/10 text-orange-500 rounded-xl">
                          <Activity className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-xs uppercase font-black text-gray-400 tracking-wider">{t.activePunches}</p>
                          <p className="text-3xl font-black text-white mt-1">
                            {getAdminStats().activeWorkersCount} / {employees.length - 1}
                          </p>
                          <span className="text-xs text-green-400 font-black uppercase mt-1 block">{t.onActiveSite}</span>
                        </div>
                      </div>

                      <div className="bg-[#16191F] border border-gray-800 rounded-2xl p-5 flex items-center gap-5 shadow-lg">
                        <div className="p-4 bg-blue-600/10 text-blue-500 rounded-xl">
                          <Clock className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-xs uppercase font-black text-gray-400 tracking-wider">{t.totalHours}</p>
                          <p className="text-3xl font-black text-white mt-1">
                            {getAdminStats().totalHrs.toFixed(1)}h
                          </p>
                          <span className="text-xs text-blue-400 font-bold uppercase mt-1 block">{t.sinceOpening}</span>
                        </div>
                      </div>

                      <div className="bg-[#16191F] border border-gray-800 rounded-2xl p-5 flex items-center gap-5 shadow-lg">
                        <div className="p-4 bg-green-600/10 text-green-500 rounded-xl">
                          <DollarSign className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-xs uppercase font-black text-gray-400 tracking-wider">{t.monthlyEarnings}</p>
                          <p className="text-3xl font-black text-[#22C55E] mt-1">
                            {getAdminStats().totalWages.toFixed(2)}$
                          </p>
                          <span className="text-xs text-emerald-400 font-black uppercase mt-1 block">{t.grossAccumulated}</span>
                        </div>
                      </div>

                    </div>

                    {/* Live Team Monitor Dashboard Section */}
                    {motivationTeams.length > 0 && (
                      <div className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 space-y-5">
                        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                          <h4 className="text-sm uppercase font-mono font-black tracking-wider text-orange-500">
                            {t.liveTeamsTitle} ({motivationTeams.length})
                          </h4>
                          <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 rounded-md font-mono text-[11px] uppercase font-bold animate-pulse">
                            {t.realtimeActivity}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 font-sans">
                          {motivationTeams.map(team => {
                            // Calculate dynamic properties
                            const activePunches = punchSessions.filter(p => p.endTime === null && team.memberIds.includes(p.employeeId));
                            const activeCount = activePunches.length;
                            
                            const todayStr = new Date().toISOString().split('T')[0];
                            const todaysSessions = punchSessions.filter(p => {
                              const sessionDate = p.startTime.split('T')[0];
                              return sessionDate === todayStr && team.memberIds.includes(p.employeeId);
                            });
                            
                            const totalHrs = todaysSessions.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
                            const totalRev = todaysSessions.reduce((sum, p) => sum + (p.revenue || 0), 0);
                            
                            const activeChantiers = Array.from(new Set(activePunches.map(p => p.projectName)));
                            const chantierName = activeChantiers.length > 0 ? activeChantiers.join(', ') : t.noneLabel;

                            return (
                              <div key={team.id} className="p-4 bg-gray-900 border border-gray-800 rounded-2xl relative overflow-hidden flex flex-col gap-3 shadow-lg">
                                <div className="absolute top-0 bottom-0 left-0 w-1.5" style={{ backgroundColor: team.color }} />
                                <div className="pl-2 flex justify-between items-center gap-2">
                                  <span className="font-black text-white text-sm tracking-wide">{team.name}</span>
                                  <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full font-black tracking-wider ${activeCount > 0 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400'}`}>
                                    {activeCount > 0 ? t.activeBadge : t.idleBadge}
                                  </span>
                                </div>

                                <div className="pl-2 grid grid-cols-3 gap-2 text-center font-mono text-[10px] text-gray-400">
                                  <div className="bg-gray-950 p-2 rounded-lg border border-gray-800/80">
                                    <span className="block text-[9px] text-gray-500 uppercase leading-none mb-1.5 font-bold tracking-wider">{t.membersLabel}</span>
                                    <span className="text-white text-sm font-black">{activeCount}/{team.memberIds.length}</span>
                                  </div>
                                  <div className="bg-gray-950 p-2 rounded-lg border border-gray-800/80">
                                    <span className="block text-[9px] text-gray-500 uppercase leading-none mb-1.5 font-bold tracking-wider">{t.hoursLabel}</span>
                                    <span className="text-white text-sm font-black">{totalHrs.toFixed(1)}h</span>
                                  </div>
                                  <div className="bg-gray-950 p-2 rounded-lg border border-gray-800/80">
                                    <span className="block text-[9px] text-gray-500 uppercase leading-none mb-1.5 font-bold tracking-wider">{t.revenueLabel}</span>
                                    <span className="text-emerald-400 text-sm font-black">{totalRev.toFixed(0)}$</span>
                                  </div>
                                </div>

                                <div className="pl-2 flex justify-between items-center text-xs text-gray-400 pt-1 border-t border-gray-850">
                                  <span className="font-bold flex items-center gap-1">{t.siteShortLabel}</span>
                                  <span className="text-white font-black truncate max-w-[150px]">{chantierName}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Active Workers & Historical Punches list */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Left: Active Punches on sites */}
                      <div className="bg-[#16191F] border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                          <h4 className="text-xs uppercase font-mono font-bold tracking-wider text-orange-500">
                            {t.liveTeamControl} ({getAdminStats().activeWorkersCount})
                          </h4>
                          <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded font-mono text-[9px] uppercase font-bold animate-pulse">
                            {t.realTimeBadge}
                          </span>
                        </div>

                        <div className="divide-y divide-gray-850 space-y-3">
                          {punchSessions.filter(p => p.endTime === null).length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6 font-semibold">{t.noActiveWorkers}</p>
                          ) : (
                            punchSessions.filter(p => p.endTime === null).map(p => (
                              <div key={p.id} className="flex items-center justify-between pt-3 first:pt-0">
                                <div className="flex items-center gap-2.5">
                                  <EmployeeAvatar
                                    src={employees.find(e => e.id === p.employeeId)?.avatar}
                                    name={p.employeeName}
                                    className="w-10 h-10 rounded-full object-cover border border-orange-500"
                                  />
                                  <div>
                                    <h5 className="text-sm font-extrabold text-white">{p.employeeName}</h5>
                                    <p className="text-xs text-gray-300 font-bold flex items-center gap-1.5 mt-0.5">
                                      <MapPin className="w-3.5 h-3.5 text-orange-500" />
                                      {p.projectName} ({p.payMode === 'horaire' ? t.hourlyLabel : p.payMode})
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm text-green-400 font-mono font-black">{p.pausedAt ? t.onBreakShort : t.activeShort}</span>
                                  <p className="text-xs text-gray-400 mt-0.5 font-mono font-bold">{t.startedAt} {new Date(p.startTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Right: Critical HR warnings or alarms */}
                      <div className="bg-[#16191F] border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                          <h4 className="text-xs uppercase font-mono font-bold tracking-wider text-orange-500">
                            {t.hrAlertsTitle} ({hrAlerts.filter(a => !a.resolved).length})
                          </h4>
                          <span className="px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded font-mono text-[9px] uppercase font-bold animate-bounce">
                            {t.hrAttention}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {hrAlerts.filter(a => !a.resolved).slice(0, 4).map(alert => (
                            <div 
                              key={alert.id} 
                              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                                alert.type === 'danger' 
                                  ? 'bg-red-950/20 border-red-500/40 text-red-200' 
                                  : alert.type === 'warning'
                                  ? 'bg-orange-950/20 border-orange-500/40 text-orange-200'
                                  : 'bg-blue-950/20 border-blue-500/40 text-blue-200'
                              }`}
                            >
                              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <h5 className="text-xs font-bold uppercase tracking-tight">{alert.title}</h5>
                                <p className="text-[11px] text-gray-300 mt-1 leading-normal">{alert.message}</p>
                                <span className="text-[9px] text-gray-400 mt-2 block font-mono">{new Date(alert.date).toLocaleDateString()}</span>
                              </div>
                              <button
                                onClick={() => resolveHRAlert(alert.id)}
                                className="p-1 bg-white/10 hover:bg-white/20 hover:text-white rounded text-[9px] font-bold uppercase transition"
                              >
                                {t.resolveBtn}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Historical Punches list */}
                    <div className="bg-[#16191F] border border-gray-800 rounded-xl p-5">
                      <h4 className="text-xs uppercase font-mono font-bold tracking-wider text-gray-400 mb-4">
                        {t.recentHistoryTitle}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-800 text-[10px] uppercase text-gray-500">
                              <th className="py-2.5">{t.thWorker}</th>
                              <th className="py-2.5">{t.thDate}</th>
                              <th className="py-2.5">{t.thProject}</th>
                              <th className="py-2.5">{t.thHours}</th>
                              <th className="py-2.5">{t.thMode}</th>
                              <th className="py-2.5 text-right">{t.thPay}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-850 text-xs">
                            {punchSessions.slice(0, 8).map(punch => (
                              <tr key={punch.id} className="hover:bg-gray-800/10">
                                <td className="py-3 font-semibold text-white flex items-center gap-2">
                                  <EmployeeAvatar
                                    src={employees.find(e => e.id === punch.employeeId)?.avatar}
                                    name={employees.find(e => e.id === punch.employeeId)?.name || ''}
                                    className="w-7 h-7 rounded-full object-cover"
                                  />
                                  {punch.employeeName}
                                </td>
                                <td className="py-3 text-gray-400">
                                  {new Date(punch.startTime).toLocaleDateString(dateLocale)}
                                </td>
                                <td className="py-3 font-medium text-gray-300">{punch.projectName}</td>
                                <td className="py-3 font-mono">{punch.totalWorkedHours ? `${punch.totalWorkedHours}h` : t.inProgressLabel}</td>
                                <td className="py-3 text-gray-400 uppercase font-mono text-[10px]">{punch.payMode}</td>
                                <td className="py-3 text-right font-bold text-green-400">{punch.revenue.toFixed(2)}$</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : FACTURES -------------------- */}
            {activeTab === 'invoice' && (
              <div id="view-invoice-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
                  <div>
                    <h3 className="text-xl font-black text-white">
                      {activeEmployee.role === 'admin' ? t.invAdminTitle : t.invMineTitle}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.invSubtitle}
                    </p>
                  </div>
                  
                  {activeEmployee.role === 'admin' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const nonAdmin = employees.filter(e => e.role !== 'admin');
                          nonAdmin.forEach(e => generateDraftInvoiceForEmployee(e.id));
                          alert(t.draftsGeneratedAlert);
                        }}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition cursor-pointer"
                      >
                        {t.autoGenDraftsBtn}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {invoices.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-10">{t.noInvoices}</p>
                  ) : (
                    invoices
                      .filter(inv => activeEmployee.role === 'admin' || inv.employeeId === activeEmployee.id)
                      .map(inv => (
                        <div key={inv.id} className="p-4 bg-gray-900 border border-gray-850 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                              {inv.status}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-1">
                              {inv.invoiceNumber} — {inv.employeeName}
                            </h4>
                            <p className="text-xs text-gray-400">
                              {t.issuedDateLabel} {inv.date} | {inv.totalHours} {t.hoursCumulated}
                            </p>
                            <p className="text-[11px] text-gray-400 font-mono italic">
                              "{inv.notes}"
                            </p>
                          </div>

                          <div className="text-right space-y-2">
                            <div>
                              <p className="text-[10px] text-gray-400">{t.grossShort} {inv.amount.toFixed(2)}$</p>
                              <p className="text-[10px] text-gray-500">{currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN} + {currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN} {t.estimatedShort}</p>
                              <p className="text-base font-black text-green-400 mt-1">
                                {inv.totalWithTaxes.toFixed(2)}$ <span className="text-[10px] text-gray-400">{t.ttcLabel}</span>
                              </p>
                            </div>

                            {/* Actions on Invoice for Admin */}
                            {activeEmployee.role === 'admin' && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => updateInvoice({ ...inv, status: 'pending' })}
                                  className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase rounded border border-amber-500/30 cursor-pointer"
                                >
                                  {t.suspendBtn}
                                </button>
                                <button
                                  onClick={() => updateInvoice({ ...inv, status: 'paid' })}
                                  className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[9px] font-bold uppercase rounded border border-green-500/30 cursor-pointer"
                                >
                                  {t.payInteracBtn}
                                </button>
                              </div>
                            )}

                            {/* Envoi de la facture à la compagnie par l'employé/sous-traitant lui-même (signature tactile requise) */}
                            {activeEmployee.role !== 'admin' && inv.employeeId === activeEmployee.id && inv.status === 'draft' && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setInvoiceToSign(inv);
                                    setInvoiceSignatureData(null);
                                  }}
                                  className="px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-[9px] font-bold uppercase rounded border border-orange-500/30 cursor-pointer"
                                >
                                  {t.sendToCompanyBtn}
                                </button>
                              </div>
                            )}

                            {/* Aperçu de la signature tactile une fois la facture envoyée */}
                            {inv.employeeSignature && (
                              <div className="flex flex-col items-end gap-0.5">
                                <img src={inv.employeeSignature} alt="Signature" className="h-8 bg-white rounded border border-gray-700 px-1" />
                                {inv.employeeSignedAt && (
                                  <span className="text-[8px] text-gray-500 font-mono">
                                    {t.signedOnLabel} {new Date(inv.employeeSignedAt).toLocaleDateString(dateLocale)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : PROJETS -------------------- */}
            {activeTab === 'projects' && (
              <div id="view-projects-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                  <div>
                    <h3 className="text-xl font-black text-white">
                      {t.projectsTitle}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.projectsSubtitle}
                    </p>
                  </div>
                </div>

                {/* Form to add project for Admin only */}
                {activeEmployee.role === 'admin' && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      addProject({
                        name: newProjectForm.name,
                        clientName: newProjectForm.clientName,
                        address: newProjectForm.address,
                        latitude: Number(newProjectForm.latitude),
                        longitude: Number(newProjectForm.longitude),
                        radius: Number(newProjectForm.radius),
                        assignedEmployees: [],
                        status: 'active'
                      });
                      alert(t.projectAddedAlert);
                      setNewProjectForm({ name: '', clientName: '', address: '', latitude: 45.5088, longitude: -73.5540, radius: 100, status: 'active' });
                    }}
                    className="p-4 bg-gray-950 border border-gray-850 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div>
                      <label className="text-[10px] font-mono uppercase text-gray-500">{t.projNameLabel}</label>
                      <input 
                        type="text" 
                        value={newProjectForm.name} 
                        onChange={e => setNewProjectForm({ ...newProjectForm, name: e.target.value })}
                        className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left"
                        required 
                        placeholder={t.exProjectNamePh} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-gray-500">{t.clientLabel}</label>
                      <input 
                        type="text" 
                        value={newProjectForm.clientName} 
                        onChange={e => setNewProjectForm({ ...newProjectForm, clientName: e.target.value })}
                        className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left"
                        required 
                        placeholder={t.exClientPh} 
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-mono uppercase text-gray-500">{t.addressLabel}</label>
                      <input 
                        type="text" 
                        value={newProjectForm.address} 
                        onChange={e => setNewProjectForm({ ...newProjectForm, address: e.target.value })}
                        className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left"
                        required 
                        placeholder={t.exAddressPh} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-gray-500">{t.latitudeLabel}</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        value={newProjectForm.latitude} 
                        onChange={e => setNewProjectForm({ ...newProjectForm, latitude: Number(e.target.value) })}
                        className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left"
                        required 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-gray-500">{t.longitudeLabel}</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        value={newProjectForm.longitude} 
                        onChange={e => setNewProjectForm({ ...newProjectForm, longitude: Number(e.target.value) })}
                        className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left"
                        required 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-gray-500">{t.radiusLabel}</label>
                      <input 
                        type="number" 
                        value={newProjectForm.radius} 
                        onChange={e => setNewProjectForm({ ...newProjectForm, radius: Number(e.target.value) })}
                        className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left"
                        required 
                      />
                    </div>
                    
                    {/* Position Fast-Filing Helpers */}
                    <div className="md:col-span-2 bg-gray-950 p-3 rounded-xl border border-gray-850 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs leading-none">
                      <div className="text-left">
                        <span className="font-bold text-white block">{t.gpsQuickFill}</span>
                        <span className="text-[10px] text-gray-500 font-mono mt-0.5 block">{t.gpsQuickFillHint}</span>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => {
                            if (!navigator.geolocation) {
                              alert(t.geoNotSupported);
                              return;
                            }
                            navigator.geolocation.getCurrentPosition((pos) => {
                              setNewProjectForm(prev => ({
                                ...prev,
                                latitude: Number(pos.coords.latitude.toFixed(6)),
                                longitude: Number(pos.coords.longitude.toFixed(6))
                              }));
                              alert(fmt(t.positionCaptured, { lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) }));
                            }, (err) => {
                              alert(fmt(t.gpsCaptureError, { msg: err.message }));
                            }, { enableHighAccuracy: true });
                          }}
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black rounded-lg transition"
                        >
                          <span>{t.imOnSiteBtn}</span>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            const addr = newProjectForm.address || "Montréal, QC";
                            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
                            window.open(url, '_blank');
                          }}
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-900 hover:bg-gray-850 text-gray-300 border border-gray-800 text-[10px] font-black rounded-lg transition"
                        >
                          <span>{t.openMapsBtn}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-end md:col-span-2">
                      <button 
                        type="submit"
                        className="w-full p-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded transition cursor-pointer"
                      >
                        {t.saveProjectBtn}
                      </button>
                    </div>
                  </form>
                )}

                {/* Display projects list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map(proj => (
                    <div key={proj.id} className="p-4 bg-gray-900 border border-gray-850 rounded-xl relative overflow-hidden">
                      <div className="absolute right-3 top-3">
                        <span className="text-[9px] font-mono uppercase font-black px-2 py-0.5 rounded bg-orange-600/10 text-orange-500 border border-orange-500/20">
                          {proj.status}
                        </span>
                      </div>

                      <h4 className="font-bold text-white text-sm mt-1">{proj.name}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">{proj.clientName}</p>
                      
                      <div className="mt-3 text-xs text-gray-400 flex flex-col gap-1">
                        <p className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-orange-500" />
                          {proj.address}
                        </p>
                        <p className="font-mono text-[10px]">
                          GPS: {proj.latitude.toFixed(4)}, {proj.longitude.toFixed(4)} | {t.radiusTolerance} {proj.radius}m
                        </p>
                        {proj.latitude === 0 && proj.longitude === 0 && (
                          <p className="text-[10px] text-amber-500 font-bold">{t.gpsNotSet}</p>
                        )}
                      </div>

                      {/* Éditeur GPS pour un chantier déjà créé (admin) : mêmes options
                          que le formulaire de création — capture de position, Google Maps,
                          ou saisie manuelle des coordonnées et du rayon. */}
                      {activeEmployee.role === 'admin' && (
                        gpsEditProjectId === proj.id ? (
                          <div className="mt-3 p-3 bg-gray-950 border border-gray-850 rounded-xl space-y-2">
                            <div>
                              <label className="text-[9px] font-mono uppercase text-gray-500">{t.addressLabel}</label>
                              <input
                                type="text"
                                value={gpsEditForm.address}
                                onChange={e => setGpsEditForm({ ...gpsEditForm, address: e.target.value })}
                                className="w-full mt-0.5 p-1.5 bg-gray-900 rounded border border-gray-850 text-white text-[10px] text-left"
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[9px] font-mono uppercase text-gray-500">{t.latitudeLabel}</label>
                                <input
                                  type="number"
                                  step="0.000001"
                                  value={gpsEditForm.latitude}
                                  onChange={e => setGpsEditForm({ ...gpsEditForm, latitude: Number(e.target.value) })}
                                  className="w-full mt-0.5 p-1.5 bg-gray-900 rounded border border-gray-850 text-white text-[10px] text-left"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-mono uppercase text-gray-500">{t.longitudeLabel}</label>
                                <input
                                  type="number"
                                  step="0.000001"
                                  value={gpsEditForm.longitude}
                                  onChange={e => setGpsEditForm({ ...gpsEditForm, longitude: Number(e.target.value) })}
                                  className="w-full mt-0.5 p-1.5 bg-gray-900 rounded border border-gray-850 text-white text-[10px] text-left"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-mono uppercase text-gray-500">{t.radiusLabel}</label>
                                <input
                                  type="number"
                                  value={gpsEditForm.radius}
                                  onChange={e => setGpsEditForm({ ...gpsEditForm, radius: Number(e.target.value) })}
                                  className="w-full mt-0.5 p-1.5 bg-gray-900 rounded border border-gray-850 text-white text-[10px] text-left"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!navigator.geolocation) {
                                    alert(t.geoNotSupported);
                                    return;
                                  }
                                  navigator.geolocation.getCurrentPosition((pos) => {
                                    setGpsEditForm(prev => ({
                                      ...prev,
                                      latitude: Number(pos.coords.latitude.toFixed(6)),
                                      longitude: Number(pos.coords.longitude.toFixed(6))
                                    }));
                                    alert(fmt(t.positionCaptured, { lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) }));
                                  }, (err) => {
                                    alert(fmt(t.gpsCaptureError, { msg: err.message }));
                                  }, { enableHighAccuracy: true });
                                }}
                                className="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black rounded-lg transition"
                              >
                                {t.imOnSiteBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const addr = gpsEditForm.address || proj.address || 'Montréal, QC';
                                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank');
                                }}
                                className="flex-1 px-2 py-1.5 bg-gray-900 hover:bg-gray-850 text-gray-300 border border-gray-800 text-[9px] font-black rounded-lg transition"
                              >
                                {t.openMapsBtn}
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  updateProject({
                                    ...proj,
                                    address: gpsEditForm.address,
                                    latitude: Number(gpsEditForm.latitude),
                                    longitude: Number(gpsEditForm.longitude),
                                    radius: Math.max(10, Number(gpsEditForm.radius) || 100)
                                  });
                                  setGpsEditProjectId(null);
                                  alert(t.gpsUpdated);
                                }}
                                className="flex-1 px-2 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[9px] font-black rounded-lg transition"
                              >
                                {t.saveBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => setGpsEditProjectId(null)}
                                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-850 text-gray-400 border border-gray-800 text-[9px] font-black rounded-lg transition"
                              >
                                {t.modalCancelBtn}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setGpsEditForm({ address: proj.address, latitude: proj.latitude, longitude: proj.longitude, radius: proj.radius });
                              setGpsEditProjectId(proj.id);
                            }}
                            className="mt-2 px-2.5 py-1.5 bg-gray-950 hover:bg-gray-900 text-cyan-400 border border-gray-850 text-[9px] font-black rounded-lg transition"
                          >
                            {t.editGpsBtn}
                          </button>
                        )
                      )}

                      {/* Workers count assigned */}
                      <div className="mt-4 pt-3 border-t border-gray-850 flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 uppercase font-mono">
                          {t.assignmentsLabel} ({proj.assignedEmployees?.length || 0}) :
                        </span>
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {employees.filter(e => proj.assignedEmployees?.includes(e.id)).map((emp) => (
                            <EmployeeAvatar
                              key={emp.id}
                              src={emp.avatar}
                              title={emp.name}
                              name={emp.name}
                              className="w-8 h-8 rounded-full object-cover border border-gray-900"
                            />
                          ))}
                          {(!proj.assignedEmployees || proj.assignedEmployees.length === 0) && (
                            <span className="text-[9px] text-gray-500 italic">{t.noneLabel}</span>
                          )}
                        </div>
                      </div>

                      {/* Admin assignments adjustment console */}
                      {activeEmployee.role === 'admin' && (
                        <div className="mt-3 pt-3 border-t border-gray-850 space-y-2 text-[10px] leading-tight">
                          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                            <span className="text-[9px] text-gray-400 font-mono uppercase">{t.teamsColon}</span>
                            <select
                              className="bg-gray-950 text-white text-[9px] p-1 rounded-md border border-gray-800 cursor-pointer text-left w-full sm:w-auto"
                              value=""
                              onChange={(e) => {
                                const teamId = e.target.value;
                                if (!teamId) return;
                                const targetTeam = motivationTeams.find(t => t.id === teamId);
                                if (targetTeam) {
                                  const currentAssigns = proj.assignedEmployees || [];
                                  const nextAssigns = Array.from(new Set([...currentAssigns, ...targetTeam.memberIds]));
                                  updateProject({
                                    ...proj,
                                    assignedEmployees: nextAssigns
                                  });
                                }
                              }}
                            >
                              <option value="">{t.assignWholeTeam}</option>
                              {motivationTeams.map(team => (
                                <option key={team.id} value={team.id}>{team.name} ({team.memberIds.length} {t.peopleShort})</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] text-gray-500 font-mono uppercase">{t.membersColon}</span>
                            {employees.filter(e => e.role !== 'admin').map(emp => {
                              const isAssigned = proj.assignedEmployees?.includes(emp.id);
                              return (
                                <button
                                  key={emp.id}
                                  type="button"
                                  onClick={() => {
                                    const currentAssigns = proj.assignedEmployees || [];
                                    const nextAssigns = isAssigned 
                                      ? currentAssigns.filter(id => id !== emp.id)
                                      : [...currentAssigns, emp.id];
                                    updateProject({
                                      ...proj,
                                      assignedEmployees: nextAssigns
                                    });
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition ${
                                    isAssigned 
                                      ? 'bg-orange-600/10 border-orange-500 text-orange-400' 
                                      : 'bg-gray-950 border-gray-850 text-gray-400 hover:text-white'
                                  }`}
                                >
                                  {isAssigned ? '✓ ' : '+ '} {emp.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <Suspense fallback={<LazySectionFallback />}>
                        <ProjectTasksAndTools project={proj} />
                      </Suspense>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : DOCUMENTS -------------------- */}
            {activeTab === 'documents' && (
              <div id="view-documents-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                <div>
                  <h3 className="text-xl font-black text-white">
                    {t.docsTitle}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {t.docsSubtitle}
                  </p>
                </div>

                <Suspense fallback={<LazySectionFallback />}>
                  <ClientDocumentsManager />
                </Suspense>
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : INVENTAIRE -------------------- */}
            {activeTab === 'inventory' && (
              <div id="view-inventory-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                
                {/* Segmented Sub-Tabs */}
                <div className="flex border-b border-gray-800 p-1 bg-gray-950 rounded-xl max-w-md">
                  <button
                    onClick={() => setInventorySubTab('stock')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all duration-200 uppercase tracking-wider cursor-pointer ${
                      inventorySubTab === 'stock'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-900'
                    }`}
                  >
                    {t.stockTab} ({inventory.length})
                  </button>
                  <button
                    onClick={() => setInventorySubTab('catalogue')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all duration-200 uppercase tracking-wider cursor-pointer ${
                      inventorySubTab === 'catalogue'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-900'
                    }`}
                  >
                    {t.catalogTab} ({catalogue.length})
                  </button>
                </div>

                {inventorySubTab === 'stock' ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
                      <div>
                        <h3 className="text-xl font-black text-white">
                          {t.invTitle}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">
                          {t.invPageSubtitle}
                        </p>
                      </div>

                      {(activeEmployee.role === 'admin' || activeEmployee.role === 'secretary') && (
                        <button 
                          onClick={() => {
                            setShowAddInventoryForm(!showAddInventoryForm);
                            setNewInventoryForm({ name: '', quantity: 15, unit: 'paquets', emoji: '🧱', minThreshold: 5 });
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-black rounded-xl transition shadow-lg cursor-pointer flex items-center gap-1.5"
                        >
                          <span>{showAddInventoryForm ? t.closeFormBtn : t.newMaterialBtn}</span>
                        </button>
                      )}
                    </div>

                    {/* Inline Beautiful Add Physical Stock Form */}
                    {showAddInventoryForm && (
                      <div className="p-5 bg-gray-900 border border-gray-800 rounded-2xl text-left space-y-4 max-w-2xl animate-fade-in">
                        <h4 className="text-sm font-extrabold text-white uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                          <span>🧱</span> {t.addPhysicalMaterial}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.materialNameLabel}</label>
                            <input 
                              type="text"
                              placeholder={t.exMaterialPh}
                              className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 text-left"
                              value={newInventoryForm.name}
                              onChange={(e) => setNewInventoryForm({ ...newInventoryForm, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.initialQtyLabel}</label>
                            <input 
                              type="number"
                              className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 font-mono text-left"
                              value={newInventoryForm.quantity}
                              onChange={(e) => setNewInventoryForm({ ...newInventoryForm, quantity: Number(e.target.value) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.unitOfMeasure}</label>
                            <select 
                              className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 cursor-pointer text-left"
                              value={newInventoryForm.unit}
                              onChange={(e) => setNewInventoryForm({ ...newInventoryForm, unit: e.target.value })}
                            >
                              <option value="paquets">{t.unitPackets}</option>
                              <option value="sections">{t.unitSections}</option>
                              <option value="rouleaux">{t.unitRolls}</option>
                              <option value="boîtes">{t.unitBoxes}</option>
                              <option value="tubes">{t.unitTubes}</option>
                              <option value="pi²">{t.unitSqft}</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.minAlertThreshold}</label>
                            <input 
                              type="number"
                              className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 font-mono text-left"
                              value={newInventoryForm.minThreshold}
                              onChange={(e) => setNewInventoryForm({ ...newInventoryForm, minThreshold: Number(e.target.value) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.representativeEmoji}</label>
                            <input 
                              type="text"
                              maxLength={2}
                              className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 text-center"
                              value={newInventoryForm.emoji}
                              onChange={(e) => setNewInventoryForm({ ...newInventoryForm, emoji: e.target.value })}
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              disabled={!newInventoryForm.name}
                              onClick={() => {
                                addInventoryItem({
                                  name: newInventoryForm.name,
                                  quantity: newInventoryForm.quantity,
                                  unit: newInventoryForm.unit,
                                  emoji: newInventoryForm.emoji || '🧱',
                                  minThreshold: newInventoryForm.minThreshold
                                });
                                setShowAddInventoryForm(false);
                                alert(t.materialSavedAlert);
                              }}
                              className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs rounded-lg transition disabled:opacity-45 cursor-pointer"
                            >
                              {t.confirmAddBtn}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Liste linéaire : un matériau par ligne, pleine largeur */}
                    <div className="flex flex-col gap-3">
                      {inventory.map(item => (
                        <div key={item.id} className="p-4 bg-gray-900 border border-gray-850 hover:border-gray-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition duration-200">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl filter drop-shadow">{item.emoji}</span>
                            <div>
                              <h4 className="font-extrabold text-white text-sm">{item.name}</h4>
                              <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded ${
                                item.quantity < item.minThreshold 
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                  : 'bg-gray-800 text-gray-400'
                              }`}>
                                {t.minThresholdLabel} {item.minThreshold} {item.unit}
                              </span>
                            </div>
                          </div>

                          <div className="text-right flex items-center gap-3">
                            <div>
                              <p className={`text-lg font-black ${
                                item.quantity < item.minThreshold ? 'text-red-400 animate-pulse' : 'text-white'
                              }`}>{item.quantity} {item.unit}</p>
                              <p className="text-[10px] text-gray-500 font-mono">{t.availableStock}</p>
                            </div>

                            {/* Adjust quantities & Remove */}
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col gap-1">
                                <button 
                                  onClick={() => updateInventoryItem({ ...item, quantity: item.quantity + 5 })}
                                  className="p-1 px-1.5 bg-gray-850 hover:bg-gray-750 text-white text-[10px] font-mono font-bold rounded cursor-pointer"
                                  title="+5"
                                >
                                  +5
                                </button>
                                <button 
                                  onClick={() => updateInventoryItem({ ...item, quantity: Math.max(0, item.quantity - 5) })}
                                  className="p-1 px-1.5 bg-gray-850 hover:bg-gray-750 text-white text-[10px] font-mono font-bold rounded cursor-pointer"
                                  title="-5"
                                >
                                  -5
                                </button>
                              </div>

                              {/* Remove Item completely */}
                              {(activeEmployee.role === 'admin' || activeEmployee.role === 'secretary') && (
                                <button
                                  onClick={() => {
                                    if (confirm(fmt(t.removeItemConfirm, { name: item.name }))) {
                                      deleteInventoryItem(item.id);
                                    }
                                  }}
                                  className="p-2 bg-red-950/40 hover:bg-red-900 text-red-400 rounded-lg border border-red-500/20 cursor-pointer hover:border-red-500 transition"
                                  title={t.deletePermanently}
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Suspense fallback={<LazySectionFallback />}>
                    <CatalogueManager />
                  </Suspense>
                )}
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : COMMANDES OB -------------------- */}
            {activeTab === 'commandes' && (
              <div id="view-orders-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
                  <div>
                    <h3 className="text-xl font-black text-white">
                      {t.ordersTitle}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.ordersSubtitle}
                    </p>
                  </div>

                  {(activeEmployee.role === 'admin' || activeEmployee.role === 'secretary') && (
                    <button 
                      onClick={() => {
                        setShowAddOrderForm(!showAddOrderForm);
                        setOrderSupplier('');
                        setOrderItems([{ name: '', quantity: 20, price: 5.5 }]);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-black rounded-xl transition shadow-lg cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{showAddOrderForm ? t.modalCancelBtn : t.newOrderBtn}</span>
                    </button>
                  )}
                </div>

                {/* Inline Expanded Dynamic Order Form */}
                {showAddOrderForm && (
                  <div className="p-5 bg-gray-900 border border-gray-800 rounded-2xl text-left space-y-4 max-w-2xl animate-fade-in">
                    <h4 className="text-sm font-extrabold text-white uppercase tracking-wider text-orange-400">
                      {t.issueOrderTitle}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.supplierLabel}</label>
                        <select
                          className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 cursor-pointer text-left"
                          value={orderSupplier}
                          onChange={(e) => setOrderSupplier(e.target.value)}
                        >
                          <option value="">{t.chooseSupplier}</option>
                          <option value="Distribution Pro-Toit Ltée">Distribution Pro-Toit Ltée</option>
                          <option value="Aciers Québec Inc">Aciers Québec Inc</option>
                          <option value="Vis & Clous Toiture">Vis & Clous Toiture</option>
                          <option value="Soprema Québec">Soprema Québec</option>
                          <option value="Quincaillerie Générale">{t.otherHardware}</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.manualSupplierEntry}</label>
                        <input
                          type="text"
                          placeholder={t.typeAnotherNamePh}
                          className="w-full p-2 bg-gray-950 text-white text-xs rounded-lg border border-gray-850 text-left"
                          value={orderSupplier}
                          onChange={(e) => setOrderSupplier(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.itemsToOrder}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setOrderItems([...orderItems, { name: '', quantity: 10, price: 12.5 }]);
                          }}
                          className="p-1 px-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-[10px] rounded font-bold cursor-pointer transition flex items-center gap-1"
                        >
                          <span>{t.addItemBtn}</span>
                        </button>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {orderItems.map((field, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-950 p-2.5 rounded-lg border border-gray-850">
                            <div className="col-span-6 space-y-1">
                              <input 
                                type="text"
                                placeholder={t.itemNamePh}
                                className="w-full p-1.5 bg-gray-900 border border-gray-800 text-white text-xs rounded text-left"
                                value={field.name}
                                onChange={(e) => {
                                  const updated = [...orderItems];
                                  updated[idx].name = e.target.value;
                                  setOrderItems(updated);
                                }}
                              />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <input 
                                type="number"
                                placeholder={t.qtyShort}
                                className="w-full p-1.5 bg-gray-900 border border-gray-800 text-white font-mono text-xs rounded text-left"
                                value={field.quantity}
                                onChange={(e) => {
                                  const updated = [...orderItems];
                                  updated[idx].quantity = Number(e.target.value);
                                  setOrderItems(updated);
                                }}
                              />
                            </div>
                            <div className="col-span-3 space-y-1 relative">
                              <input 
                                type="number"
                                step="0.01"
                                placeholder={t.pricePh}
                                className="w-full p-1.5 bg-gray-900 border border-gray-800 text-white font-mono text-xs rounded text-right pr-6"
                                value={field.price}
                                onChange={(e) => {
                                  const updated = [...orderItems];
                                  updated[idx].price = Number(e.target.value);
                                  setOrderItems(updated);
                                }}
                              />
                              <span className="absolute right-1.5 top-2.5 text-[9px] text-gray-500 font-bold">$</span>
                            </div>
                            <div className="col-span-1 text-center">
                              {orderItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOrderItems(orderItems.filter((_, i) => i !== idx));
                                  }}
                                  className="text-red-400 hover:text-red-300 font-bold text-xs p-1"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Realtime sum */}
                    <div className="flex items-center justify-between p-3 bg-gray-950 rounded-xl border border-gray-850 text-xs">
                      <span className="font-mono text-gray-400 uppercase">{t.realtimeTotal}</span>
                      <span className="text-orange-400 font-extrabold font-mono text-sm">
                        {orderItems.reduce((acc, current) => acc + (current.quantity * current.price), 0).toFixed(2)}$
                      </span>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setShowAddOrderForm(false)}
                        className="px-4 py-1.5 bg-gray-800 hover:bg-gray-750 text-gray-300 rounded-lg text-xs"
                      >
                        {t.modalCancelBtn}
                      </button>
                      <button
                        disabled={!orderSupplier || orderItems.some(it => !it.name.trim())}
                        onClick={() => {
                          const validItems = orderItems.filter(it => it.name.trim() !== '');
                          const estTotal = validItems.reduce((acc, current) => acc + (current.quantity * current.price), 0);
                          addSupplierOrder({
                            supplierName: orderSupplier,
                            date: new Date().toISOString().split('T')[0],
                            items: validItems,
                            status: 'ordered',
                            totalAmount: estTotal
                          });
                          setShowAddOrderForm(false);
                          setOrderSupplier('');
                          setOrderItems([{ name: '', quantity: 20, price: 5.5 }]);
                          alert(t.orderIssuedAlert);
                        }}
                        className="px-5 py-1.5 bg-green-600 hover:bg-green-500 text-white font-black text-xs rounded-lg transition disabled:opacity-45"
                      >
                        {t.issueOrderBtn}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {orders.map(ord => (
                    <div key={ord.id} className="p-4 bg-gray-900 border border-gray-850 rounded-xl flex flex-col md:flex-row justify-between gap-4 md:items-center">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded ${
                            ord.status === 'received' 
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {ord.status}
                          </span>
                          <span className="text-xs text-gray-450 font-mono">{t.issuedOnLabel} {ord.date}</span>
                        </div>
                        <h4 className="font-bold text-white text-sm mt-1">{ord.supplierName}</h4>
                        
                        {/* Summary items */}
                        <div className="mt-2 text-xs text-gray-400 space-y-1">
                          {ord.items.map((item, idx) => (
                            <p key={idx}>• {item.name} ({item.quantity} × {item.price}$/u)</p>
                          ))}
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-black text-orange-500">{ord.totalAmount.toFixed(2)}$</p>
                        <p className="text-[10px] text-gray-500 font-mono">{t.orderTotalLabel}</p>

                        {/* Complete action if ordered */}
                        {ord.status === 'ordered' && (
                          <button
                            onClick={() => {
                              updateSupplierOrder({ ...ord, status: 'received' });
                              alert(t.orderReceivedAlert);
                            }}
                            className="mt-2.5 px-3 py-1 bg-[#121620] hover:bg-green-600/20 text-green-400 font-bold border border-green-500/30 text-xs rounded transition flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t.confirmReceptionBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------- VIEW CONTAINER : STATS -------------------- */}
            {activeTab === 'stats' && (() => {
              // --- HELPERS & LOGIC WITHIN MOUNTED SCOPE OF STATS ---
              const getOffsetMonth = (ym: string, offset: number): string => {
                const [y, m] = ym.split('-').map(Number);
                const date = new Date(y, m - 1 + offset, 1);
                const ny = date.getFullYear();
                const nm = date.getMonth() + 1;
                return `${ny}-${String(nm).padStart(2, '0')}`;
              };

              const getMetricsForPeriod = (ym: string) => {
                const ymSessions = punchSessions.filter(p => p.endTime !== null && p.startTime.startsWith(ym));
                const revenue = ymSessions.reduce((sum, p) => sum + p.revenue, 0);
                const hours = ymSessions.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
                const sessionsCount = ymSessions.length;
                const uniqueDays = new Set(ymSessions.map(p => p.startTime.slice(0, 10))).size;
                return { revenue, hours, sessionsCount, uniqueDays, sessions: ymSessions };
              };

              const pctChange = (now: number, before: number) => {
                if (before <= 0) return null;
                return ((now - before) / before) * 100;
              };

              const currentMetrics = getMetricsForPeriod(statsMonth);
              const lastMonthMetrics = getMetricsForPeriod(getOffsetMonth(statsMonth, -1));
              const lastYearMetrics = getMetricsForPeriod(getOffsetMonth(statsMonth, -12));

              // Sparklines calculations
              const sparkMonths = Array.from({ length: 6 }).map((_, i) => getOffsetMonth(statsMonth, -5 + i));
              const revSpark = sparkMonths.map(ym => getMetricsForPeriod(ym).revenue);
              const hrsSpark = sparkMonths.map(ym => getMetricsForPeriod(ym).hours);
              const sesSpark = sparkMonths.map(ym => getMetricsForPeriod(ym).sessionsCount);
              const daySpark = sparkMonths.map(ym => getMetricsForPeriod(ym).uniqueDays);

              const renderTrend = (change: number | null, label: string) => {
                if (change === null) return <span className="text-[10px] text-gray-500 font-mono">→ 0% ({t.naShort} {label})</span>;
                const isUp = change >= 0;
                return (
                  <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${isUp ? 'text-green-500' : 'text-red-400'}`}>
                    {isUp ? '↗' : '↘'} {isUp ? '+' : ''}{change.toFixed(1)}% <span className="text-gray-500 font-normal">vs {label}</span>
                  </span>
                );
              };

              function Sparkline({ values, strokeColor }: { values: number[], strokeColor: string }) {
                if (values.length === 0) return null;
                const w = 100;
                const h = 30;
                const max = Math.max(...values, 10);
                const min = 0;
                const points = values.map((val, idx) => {
                  const x = (idx / (values.length - 1)) * w;
                  const y = h - ((val - min) / (max - min)) * (h - 6) - 3;
                  return `${x},${y}`;
                }).join(' ');

                return (
                  <svg className="w-24 h-8 overflow-visible" viewBox={`0 0 ${w} ${h}`}>
                    <polyline
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />
                  </svg>
                );
              }

              return (
                <div id="view-stats-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                  {/* Header Title */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-white">
                        {t.statsTitle}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {t.statsSubtitle}
                      </p>
                    </div>
                    
                    {/* Subtab Navigation */}
                    <div className="flex gap-1 p-1 bg-gray-950 rounded-xl border border-gray-850 self-start md:self-center">
                      <button
                        onClick={() => setStatsSubTab('analytics')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${
                          statsSubTab === 'analytics'
                            ? 'bg-orange-600/15 border border-orange-500/50 text-orange-500'
                            : 'text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        {t.perfXpTab}
                      </button>
                      <button
                        onClick={() => setStatsSubTab('payroll')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${
                          statsSubTab === 'payroll'
                            ? 'bg-orange-600/15 border border-orange-500/50 text-orange-500'
                            : 'text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        {t.payrollTabLabel} {regionName}
                      </button>
                    </div>
                  </div>

                  {statsSubTab === 'analytics' && (
                    <>

                  {/* -------------------- SECTION: PERSONAL EMPLOYEE STATS -------------------- */}
                  {activeEmployee && activeEmployee.role !== 'admin' && (() => {
                    const currentLvl = activeEmployee.level || 1;
                    const currentXP = activeEmployee.xp || 0;
                    const xpPrev = (currentLvl - 1) * 1000;
                    const xpNext = currentLvl * 1000;
                    const xpPct = Math.min(100, Math.max(0, ((currentXP - xpPrev) / (xpNext - xpPrev)) * 100));

                    const userGoal = weeklyGoals.find(wg => wg.employeeId === activeEmployee.id);
                    const streak = userGoal?.streak || 0;
                    const targetVal = userGoal?.targetAmount || 1000;
                    const currentVal = userGoal?.currentAmount || 0;
                    const goalPct = Math.min(100, Math.max(0, (currentVal / targetVal) * 100));

                    let streakBadge = t.streakNone;
                    let streakColor = 'text-gray-400 bg-gray-500/10 border-gray-500/20';
                    if (streak > 0 && streak < 3) {
                      streakBadge = t.streakWarmup;
                      streakColor = 'text-green-400 bg-green-500/10 border-green-500/20';
                    } else if (streak >= 3 && streak < 5) {
                      streakBadge = t.streakOnFire;
                      streakColor = 'text-orange-500 bg-orange-500/10 border-orange-500/20';
                    } else if (streak >= 5) {
                      streakBadge = t.streakLegendary;
                      streakColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30 animate-pulse';
                    }

                    return (
                      <div className="p-5 bg-gradient-to-r from-orange-600/10 to-indigo-600/10 border border-gray-800 rounded-2xl space-y-4">
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar src={activeEmployee.avatar} name={activeEmployee.name} className="w-14 h-14 rounded-full object-cover border-2 border-orange-500" />
                          <div>
                            <h4 className="text-sm font-black text-white">{t.perfSpace} {activeEmployee.name}</h4>
                            <p className="text-[11px] text-gray-400">{t.roleColon} <span className="font-mono text-orange-400 uppercase font-bold">{activeEmployee.workerType}</span></p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                          {/* Col 1: Level and XP */}
                          <div className="p-4 bg-gray-950 rounded-xl border border-gray-850 space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-gray-300">{t.xpProgression}</span>
                              <span className="text-orange-400 font-black font-mono">{t.levelWord} {currentLvl}</span>
                            </div>
                            <div className="w-full bg-gray-900 h-2.5 rounded-full overflow-hidden font-sans">
                              <div className="bg-gradient-to-r from-orange-500 to-amber-400 h-full transition-all duration-500" style={{ width: `${xpPct}%` }}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                              <span>{currentXP} / {xpNext} XP</span>
                              <span>{xpNext - currentXP} {t.xpBeforeNext}</span>
                            </div>
                          </div>

                          {/* Col 2: Streaks */}
                          <div className={`p-4 bg-gray-950 rounded-xl border border-gray-850 flex flex-col justify-between ${streakColor}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold uppercase tracking-tight">{t.punchStreakLabel}</span>
                              <span className="text-xs font-mono font-black">{streak} {t.daysWord}</span>
                            </div>
                            <div className="mt-2 text-xs font-semibold">
                              {t.statusColon} <span className="font-bold underline">{streakBadge}</span>
                            </div>
                            <p className="text-[9px] text-gray-400 mt-1 leading-tight">
                              {t.consistencyHint}
                            </p>
                          </div>

                          {/* Col 3: Weekly Goal */}
                          <div className="p-4 bg-gray-950 rounded-xl border border-gray-850 space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-gray-300">{t.weeklyGoalDollar}</span>
                              <span className="text-green-400 font-black font-mono">{currentVal.toFixed(0)} $ / {targetVal} $</span>
                            </div>
                            <div className="w-full bg-gray-900 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${goalPct}%` }}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                              <span>{t.accomplishmentRate} {goalPct.toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* -------------------- PERIOD SELECTOR PANEL -------------------- */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-gray-900 border border-gray-850 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-orange-650/10 text-orange-500 rounded-lg">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase">{t.periodSelector}</h4>
                        <p className="text-[10px] text-gray-400">{t.statsFiltering}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => setStatsMonth(getOffsetMonth(statsMonth, -1))}
                        className="p-2 bg-gray-950 text-gray-400 hover:text-white rounded-lg border border-gray-800 hover:bg-gray-850 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <select
                        value={statsMonth}
                        onChange={(e) => setStatsMonth(e.target.value)}
                        className="bg-gray-950 text-white font-mono text-xs p-2 rounded-lg border border-gray-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        {["2026-12", "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10", "2025-09"].map(m => {
                          const [year, col] = m.split('-');
                          return <option key={m} value={m}>{`${t.monthNames[Number(col) - 1]} ${year}`}</option>;
                        })}
                      </select>
                      <button
                        onClick={() => setStatsMonth(getOffsetMonth(statsMonth, 1))}
                        className="p-2 bg-gray-950 text-gray-400 hover:text-white rounded-lg border border-gray-800 hover:bg-gray-850 cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* -------------------- FOUR MAIN METRICS WITH TRENDS & SPARKLINES -------------------- */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
                    
                    {/* METRIC: REVENUE */}
                    <div className="p-4 bg-gray-900 border border-gray-850 rounded-xl space-y-3 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold font-mono tracking-widest text-gray-400 uppercase">{t.teamEarnings}</span>
                        <Coins className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-black text-white font-mono">{currentMetrics.revenue.toFixed(2)} $</span>
                        <Sparkline values={revSpark} strokeColor="#F97316" />
                      </div>
                      <div className="space-y-1 pt-1 border-t border-gray-850">
                        {renderTrend(pctChange(currentMetrics.revenue, lastMonthMetrics.revenue), t.vsPrevMonth)}
                        {renderTrend(pctChange(currentMetrics.revenue, lastYearMetrics.revenue), t.vsLastYear)}
                      </div>
                    </div>

                    {/* METRIC: HOURS WORKED */}
                    <div className="p-4 bg-gray-900 border border-gray-850 rounded-xl space-y-3 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold font-mono tracking-widest text-gray-400 uppercase">{t.fieldHoursCard}</span>
                        <Clock className="w-4 h-4 text-cyan-500" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-black text-white font-mono">{currentMetrics.hours.toFixed(1)} h</span>
                        <Sparkline values={hrsSpark} strokeColor="#06B6D4" />
                      </div>
                      <div className="space-y-1 pt-1 border-t border-gray-850">
                        {renderTrend(pctChange(currentMetrics.hours, lastMonthMetrics.hours), t.vsPrevMonth)}
                        {renderTrend(pctChange(currentMetrics.hours, lastYearMetrics.hours), t.vsLastYear)}
                      </div>
                    </div>

                    {/* METRIC: SESSIONS COUNT */}
                    <div className="p-4 bg-gray-900 border border-gray-850 rounded-xl space-y-3 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold font-mono tracking-widest text-gray-400 uppercase">{t.punchVolume}</span>
                        <Activity className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-black text-white font-mono">{currentMetrics.sessionsCount} {t.sessionsWord}</span>
                        <Sparkline values={sesSpark} strokeColor="#10B981" />
                      </div>
                      <div className="space-y-1 pt-1 border-t border-gray-850">
                        {renderTrend(pctChange(currentMetrics.sessionsCount, lastMonthMetrics.sessionsCount), t.vsPrevMonth)}
                        {renderTrend(pctChange(currentMetrics.sessionsCount, lastYearMetrics.sessionsCount), t.vsLastYear)}
                      </div>
                    </div>

                    {/* METRIC: DAYS WORKED */}
                    <div className="p-4 bg-gray-900 border border-gray-850 rounded-xl space-y-3 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold font-mono tracking-widest text-gray-400 uppercase">{t.siteDaysCard}</span>
                        <Building2 className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-black text-white font-mono">{currentMetrics.uniqueDays} {t.daysWord}</span>
                        <Sparkline values={daySpark} strokeColor="#F59E0B" />
                      </div>
                      <div className="space-y-1 pt-1 border-t border-gray-850">
                        {renderTrend(pctChange(currentMetrics.uniqueDays, lastMonthMetrics.uniqueDays), t.vsPrevMonth)}
                        {renderTrend(pctChange(currentMetrics.uniqueDays, lastYearMetrics.uniqueDays), t.vsLastYear)}
                      </div>
                    </div>

                  </div>

                  {/* Calendriers détaillés de l'équipe — accessibles au bureau sans exposer les NIP */}
                  {activeEmployee && (activeEmployee.role === 'admin' || activeEmployee.role === 'secretary') && (() => {
                    const calendarEmployees = employees.filter(employee => employee.role !== 'admin');
                    const selectedCalendarEmployee = calendarEmployees.find(employee => employee.id === teamCalendarEmployeeId) || calendarEmployees[0];
                    if (!selectedCalendarEmployee) return null;
                    return (
                      <section id="team-work-calendars" className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="inline-flex px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 font-mono text-[9px] uppercase font-black">TEAM CALENDAR</div>
                            <h4 className="text-sm font-black text-white mt-2">📅 {currentLanguage === 'FR' ? "Calendriers des employés" : 'Employee calendars'}</h4>
                            <p className="text-xs text-gray-500 mt-1">{currentLanguage === 'FR' ? 'Choisissez un employé, puis touchez une journée pour ouvrir sa fiche complète.' : 'Choose an employee, then tap a day to open the complete daily record.'}</p>
                          </div>
                          <select
                            value={selectedCalendarEmployee.id}
                            onChange={event => setTeamCalendarEmployeeId(event.target.value)}
                            className="w-full sm:w-64 p-3 bg-gray-900 border border-gray-800 rounded-xl text-white font-bold"
                            aria-label={currentLanguage === 'FR' ? 'Choisir un employé' : 'Choose an employee'}
                          >
                            {calendarEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} — {employee.workerType}</option>)}
                          </select>
                        </div>
                        <Suspense fallback={<LazySectionFallback />}>
                          <EmployeeWorkCalendar
                            employee={selectedCalendarEmployee}
                            punchSessions={punchSessions}
                            projects={projects}
                            currentLanguage={currentLanguage}
                            embedded
                          />
                        </Suspense>
                      </section>
                    );
                  })()}

                  {/* -------------------- DETAILED EMPLOYEE STATISTICS (ADMIN ONLY) -------------------- */}
                  {activeEmployee && activeEmployee.role === 'admin' && (
                    <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1 px-1.5 rounded bg-orange-650/10 text-orange-500 font-mono text-[9px] uppercase font-bold text-center">ADMIN PANEL</div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">{t.teamIndividualStats} ({employees.length})</h4>
                      </div>

                      <div className="space-y-2">
                        {employees.map(emp => {
                          const empSess = currentMetrics.sessions.filter(p => p.employeeId === emp.id);
                          const empHours = empSess.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
                          const empRevenue = empSess.reduce((sum, p) => sum + p.revenue, 0);
                          const empDays = new Set(empSess.map(p => p.startTime.slice(0, 10))).size;
                          const avgRate = empHours > 0 ? empRevenue / empHours : 0;
                          const projectCount = new Set(empSess.map(p => p.projectId)).size;

                          // previous month comparison
                          const prevSess = lastMonthMetrics.sessions.filter(p => p.employeeId === emp.id);
                          const prevHours = prevSess.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
                          const hrChange = pctChange(empHours, prevHours);

                          // find top project
                          const projectRevenueMap: Record<string, number> = {};
                          empSess.forEach(s => {
                            projectRevenueMap[s.projectName] = (projectRevenueMap[s.projectName] || 0) + s.revenue;
                          });
                          let topProjectName = t.naShort;
                          let topProjectVal = 0;
                          Object.entries(projectRevenueMap).forEach(([name, rev]) => {
                            if (rev > topProjectVal) {
                              topProjectName = name;
                              topProjectVal = rev;
                            }
                          });

                          const isExpanded = expandedEmployeeId === emp.id;

                          return (
                            <div key={emp.id} className="bg-gray-900 border border-gray-850 rounded-xl overflow-hidden shadow-sm">
                              {/* Toggle Accordion Header */}
                              <button
                                onClick={() => setExpandedEmployeeId(isExpanded ? null : emp.id)}
                                className="w-full text-left p-3.5 flex items-center justify-between hover:bg-gray-850 transition cursor-pointer font-sans"
                              >
                                <div className="flex items-center gap-3">
                                  <EmployeeAvatar src={emp.avatar} name={emp.name} className="w-10 h-10 rounded-full border border-gray-800 object-cover" />
                                  <div>
                                    <h5 className="text-xs font-bold text-white">{emp.name}</h5>
                                    <p className="text-[10px] text-gray-500">{emp.workerType} — {t.nipColon} <span className="font-mono text-white select-all font-bold">{emp.nip}</span></p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-mono">
                                  <div className="text-right hidden sm:block">
                                    <span className="block font-bold text-white font-mono">{empHours.toFixed(1)} h</span>
                                    <span className="block text-[10px] text-gray-500 font-mono">{empRevenue.toFixed(2)} $</span>
                                  </div>
                                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`} />
                                </div>
                              </button>

                              {/* Accordion Expandable Content */}
                              {isExpanded && (
                                <div className="p-4 border-t border-gray-850 bg-gray-950/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-sans">
                                  <div className="space-y-1 text-gray-300">
                                    <span className="text-[10px] text-gray-500 uppercase font-mono block">{t.payAndRate}</span>
                                    <p className="font-bold">{t.gainsColon} <span className="text-white font-mono">{empRevenue.toFixed(2)} $</span></p>
                                    <p className="font-bold">{t.avgRateColon} <span className="text-orange-400 font-mono">{avgRate.toFixed(2)} $/h</span></p>
                                  </div>
                                  <div className="space-y-1 text-gray-300">
                                    <span className="text-[10px] text-gray-500 uppercase font-mono block">{t.volumeAttendance}</span>
                                    <p className="font-bold">{t.fieldHoursColon} <span className="text-white font-mono">{empHours.toFixed(1)} h</span></p>
                                    <div className="flex items-center gap-1">
                                      <span className="font-bold text-[11px]">{t.hoursTrendColon}</span>
                                      {renderTrend(hrChange, t.vsPrevMonth)}
                                    </div>
                                  </div>
                                  <div className="space-y-1 text-gray-300">
                                    <span className="text-[10px] text-gray-500 uppercase font-mono block">{t.sitesAndDays}</span>
                                    <p className="font-bold">{t.daysWorkedColon} <span className="text-white font-mono">{empDays} {t.daysWord}</span></p>
                                    <p className="font-bold">{t.projectsVisitedColon} <span className="text-cyan-400 font-mono">{projectCount} {t.distinctWord}</span></p>
                                  </div>
                                  <div className="space-y-1 text-gray-300">
                                    <span className="text-[10px] text-gray-500 uppercase font-mono block">{t.projectPerf}</span>
                                    <p className="font-bold truncate text-[11px]">{t.topProjectColon} <span className="text-white font-mono block truncate">{topProjectName}</span></p>
                                    <p className="text-[10px] text-gray-500 font-mono">{t.generatedColon} {topProjectVal.toFixed(2)} $</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* -------------------- DETAILED PROJECT STATISTICS SECTION -------------------- */}
                  <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1 px-1.5 rounded bg-cyan-650/10 text-cyan-500 font-mono text-[9px] uppercase font-bold text-center">FIELD STATISTICS</div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">{t.globalProjectStats}</h4>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-400 font-sans border-collapse">
                        <thead>
                          <tr className="border-b border-gray-850 text-gray-450 font-mono text-[10px] uppercase">
                            <th className="p-3">{t.thSiteProject}</th>
                            <th className="p-3">{t.thCumLabor}</th>
                            <th className="p-3">{t.thTeamPunches}</th>
                            <th className="p-3">{t.thAttendance}</th>
                            <th className="p-3">{t.thBudgetTrend}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-850">
                          {projects.map(proj => {
                            const pSess = currentMetrics.sessions.filter(p => p.projectId === proj.id);
                            const pHours = pSess.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
                            const pRev = pSess.reduce((sum, p) => sum + p.revenue, 0);
                            const pWorkers = new Set(pSess.map(p => p.employeeId)).size;
                            const pDays = new Set(pSess.map(p => p.startTime.slice(0, 10))).size;

                            // compare
                            const pPrevSess = lastMonthMetrics.sessions.filter(p => p.projectId === proj.id);
                            const pPrevHours = pPrevSess.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
                            const hChangeP = pctChange(pHours, pPrevHours);

                            return (
                              <tr key={proj.id} className="hover:bg-gray-900/40 text-xs text-gray-300">
                                <td className="p-3 text-white font-bold font-sans">
                                  {proj.name}
                                  <span className="block text-[10px] text-gray-500 font-normal">{proj.clientName}</span>
                                </td>
                                <td className="p-3 font-mono">
                                  <span className="block text-white font-bold">{pHours.toFixed(1)} h</span>
                                  <span className="block text-[10px] text-gray-500 font-medium">{pRev.toFixed(0)} $</span>
                                </td>
                                <td className="p-3">
                                  <span className="block font-semibold">{pWorkers} {t.personsWord}</span>
                                  <span className="text-[10px] text-gray-500 font-mono">{pSess.length} {t.punchSessionsWord}</span>
                                </td>
                                <td className="p-3 font-semibold font-mono">
                                  {pDays} {t.activeDaysWord}
                                </td>
                                <td className="p-3">
                                  {renderTrend(hChangeP, t.vsPrevMonth)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* -------------------- ACCOUNTING PROFITABILITY TABLE (PROFIT MARGIN - ADMIN ONLY) -------------------- */}
                  {activeEmployee && activeEmployee.role === 'admin' && (
                    <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1 px-1.5 rounded bg-emerald-650/10 text-emerald-500 font-mono text-[9px] uppercase font-bold text-center">MARGIN ANALYTICS</div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">{t.profitabilityTitle}</h4>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-sans text-gray-400 border-collapse">
                          <thead>
                            <tr className="border-b border-gray-850 text-gray-400 font-mono text-[10px] uppercase">
                              <th className="p-3">{t.thProjectOnly}</th>
                              <th className="p-3 text-right">{t.thClientBilling}</th>
                              <th className="p-3 text-right">{t.thSupplierExpenses}</th>
                              <th className="p-3 text-right">{t.thLaborCost}</th>
                              <th className="p-3 text-right text-white">{t.thGrossMargin}</th>
                              <th className="p-3 text-center">{t.thPerfIndicator}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-850 font-mono">
                            {projects.map(proj => {
                              // Labor Costs
                              const projSessions = punchSessions.filter(p => p.projectId === proj.id);
                              const laborCost = projSessions.reduce((sum, p) => sum + p.revenue, 0);

                              // Billed Client from documents
                              const billedDocMatches = documents.filter(d => 
                                d.type === 'invoice' && 
                                (d.status === 'paid' || d.status === 'sent' || d.status === 'accepted') &&
                                (d.clientName === proj.clientName || d.clientId === proj.id || d.siteAddress?.includes(proj.name.slice(0, 10)))
                              );
                              const clientBilled = billedDocMatches.reduce((sum, d) => sum + d.total, 0);

                              // Expenses
                              const projectExpenses = expenses.filter(e => e.projectId === proj.id);
                              const expensesTotal = projectExpenses.reduce((sum, e) => sum + e.amount, 0);

                              // Profit
                              const profit = clientBilled - expensesTotal - laborCost;
                              const marginPct = clientBilled > 0 ? (profit / clientBilled) * 100 : 0;

                              let bgBadge = "bg-red-500/10 text-red-400 border-red-500/20";
                              let labelBadge = t.badgeDeficit;
                              if (marginPct >= 30) {
                                bgBadge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                                labelBadge = t.badgeHighPerf;
                              } else if (marginPct >= 10) {
                                bgBadge = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                                labelBadge = t.badgeMid;
                              }

                              return (
                                <tr key={proj.id} className="hover:bg-gray-900/40">
                                  <td className="p-3 text-white font-sans font-bold text-left">
                                    {proj.name}
                                  </td>
                                  <td className="p-3 text-right font-bold text-white">
                                    {clientBilled.toLocaleString(dateLocale, { minimumFractionDigits: 2 })} $
                                  </td>
                                  <td className="p-3 text-right text-gray-300 font-mono">
                                    {expensesTotal.toLocaleString(dateLocale, { minimumFractionDigits: 2 })} $
                                  </td>
                                  <td className="p-3 text-right text-red-400 font-mono">
                                    -{laborCost.toLocaleString(dateLocale, { minimumFractionDigits: 2 })} $
                                  </td>
                                  <td className={`p-3 text-right font-black font-mono ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {profit.toLocaleString(dateLocale, { minimumFractionDigits: 2 })} $
                                    <span className="block text-[10px] text-gray-500 font-medium font-sans">({marginPct.toFixed(1)}%)</span>
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className={`px-2.5 py-1 text-[10px] font-sans font-bold border rounded-full ${bgBadge}`}>
                                      {labelBadge}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* -------------------- SIMPLIFIED ACCOUNTING SUMMARY PANEL (ADMIN ONLY) -------------------- */}
                  {activeEmployee && activeEmployee.role === 'admin' && (() => {
                    const filteredInvoices = documents.filter(d => d.type === 'invoice' && d.date.startsWith(statsMonth));
                    const totalInvoiceBilled = filteredInvoices.reduce((sum, i) => sum + i.total, 0);
                    const totalInvoiceSubtotal = filteredInvoices.reduce((sum, i) => sum + i.subtotal, 0);
                    const totalInvoicePaid = filteredInvoices.reduce((sum, i) => {
                      const sumPaid = i.paymentsHistory?.reduce((s, p) => s + p.amount, 0) || 0;
                      return sum + sumPaid;
                    }, 0);

                    const filteredExpenses = expenses.filter(e => e.date.startsWith(statsMonth));
                    const totalExpenseAmt = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

                    const filteredPayroll = payrollPayments.filter(p => p.date.startsWith(statsMonth));
                    const totalPayrollPaid = filteredPayroll.reduce((sum, p) => sum + p.amount, 0);
                    const cnesstProvision = totalPayrollPaid * 0.055;

                    const netIncome = totalInvoiceSubtotal - totalExpenseAmt - totalPayrollPaid;

                    return (
                      <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1 px-1.5 rounded bg-indigo-650/10 text-indigo-400 font-mono text-[9px] uppercase font-bold text-center">{t.accountingBadge}</div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">{t.simplifiedBalance} ({statsMonth})</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 font-mono text-xs">
                          {/* Card A: Invoices */}
                          <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-1">
                            <span className="text-[10px] text-gray-500 uppercase block font-sans">{t.clientInvoicesCard}</span>
                            <p className="text-base text-white font-black">{totalInvoiceBilled.toFixed(2)} $ <span className="text-[10px] text-gray-500 font-normal">{t.ttcLabel}</span></p>
                            <p className="text-[11px] text-green-400">{t.recoveredColon} {totalInvoicePaid.toFixed(2)} $</p>
                            <p className="text-[11px] text-gray-500">{t.dueColon} {(totalInvoiceBilled - totalInvoicePaid).toFixed(2)} $</p>
                          </div>

                          {/* Card B: Expenses */}
                          <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-1">
                            <span className="text-[10px] text-gray-500 uppercase block font-sans">{t.supplierExpensesCard}</span>
                            <p className="text-base text-white font-black">{totalExpenseAmt.toFixed(2)} $</p>
                            <p className="text-[11px] text-amber-500">{t.materialsFuelColon} {filteredExpenses.length} {t.piecesWord}</p>
                            <p className="text-[10px] text-gray-500 font-sans">{t.recordedCAD}</p>
                          </div>

                          {/* Card C: Payroll Payments */}
                          <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-1">
                            <span className="text-[10px] text-gray-500 uppercase block font-sans">{t.payrollMass}</span>
                            <p className="text-base text-white font-black">{totalPayrollPaid.toFixed(2)} $</p>
                            <p className="text-[11px] text-cyan-400">Prov. {workersCompName} (5.5%) : {cnesstProvision.toFixed(2)} $</p>
                            <p className="text-[10px] text-gray-500 font-sans">{t.tradesPeople}</p>
                          </div>

                          {/* Card D: Prov Net Results */}
                          <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-1 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] text-gray-500 uppercase block font-sans">{t.provisionalNet}</span>
                              <p className={`text-base font-black ${netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {netIncome.toFixed(2)} $
                              </p>
                            </div>
                            <span className="text-[9px] text-gray-500 font-sans block leading-none">{t.quarterlyIndex}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* EXCLUSVIE: QUEBEC DEDUCTIONS PAYROLL SIMULATOR */}
                  <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-orange-600/10 text-orange-500 rounded-lg font-sans">
                        <Percent className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">
                          {currentLanguage === 'FR' ? `Simulateur de Fiche de Paie (${regionName} - Déductions)` : `Pay Slip Simulator (${regionName} - Deductions)`}
                        </h4>
                        <p className="text-xs text-gray-400">
                          {currentLanguage === 'FR'
                          ? `Visualisez les déductions ${regionWithPreposition(companyRegion, companyCountry)} (${payrollMeta.pensionNameFR.split(' ')[0]}) et de ${payrollMeta.secondaryDeductionNameFR.toLowerCase()}.`
                          : `View the ${regionName} deductions (${payrollMeta.pensionNameEN.split(' ')[0]}) and ${payrollMeta.secondaryDeductionNameEN.toLowerCase()}.`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-mono text-gray-400 uppercase">{t.grossToTest}</label>
                          <input 
                            type="number" 
                            defaultValue="1000"
                            id="gross_simulator_input"
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              const decs = calculateSimulatedDeductions(val);
                              
                              // Dynamically update calculations text elements
                              const elNet = document.getElementById("net_sim_output");
                              const elFed = document.getElementById("fed_sim_output");
                              const elProv = document.getElementById("prov_sim_output");
                              const elRrq = document.getElementById("rrq_sim_output");
                              const elAe = document.getElementById("ae_sim_output");
                              
                              if (elNet) elNet.innerText = decs.net.toFixed(2) + "$";
                              if (elFed) elFed.innerText = decs.fedTax.toFixed(2) + "$";
                              if (elProv) elProv.innerText = decs.provTax.toFixed(2) + "$";
                              if (elRrq) elRrq.innerText = decs.rrq.toFixed(2) + "$";
                              if (elAe) elAe.innerText = decs.ae.toFixed(2) + "$";
                            }}
                            className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs text-left text-semibold font-mono"
                          />
                        </div>
                        <p className="text-[11px] text-gray-400 leading-normal font-sans">
                          {fmt(t.simulatorHint, { region: regionName })}
                        </p>
                      </div>

                      <div className="p-4 bg-gray-900 rounded-xl space-y-2 border border-gray-800">
                        <div className="flex justify-between items-center text-xs text-gray-400">
                          <span>{t.grossEarnings}</span>
                          <span className="font-bold text-white">1000.00$</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-red-400">
                          <span>{t.federalTax}</span>
                          <span className="font-mono animate-none" id="fed_sim_output">150.00$</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-red-400">
                          <span>{currentLanguage === 'FR' ? `Impôt Provincial (${regionName}) estimé` : `Estimated Provincial Tax (${regionName})`}</span>
                          <span className="font-mono animate-none" id="prov_sim_output">150.00$</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-amber-400">
                          <span>{pensionName} {t.estimatedWord} ({(payrollMeta.pensionRate * 100).toFixed(2)}%)</span>
                          <span className="font-mono animate-none" id="rrq_sim_output">64.00$</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-amber-400">
                          <span>{secondaryDeductionName} ({(payrollMeta.secondaryDeductionRate * 100).toFixed(2)}%)</span>
                          <span className="font-mono animate-none" id="ae_sim_output">12.70$</span>
                        </div>
                        
                        <div className="pt-2 border-t border-gray-800 flex justify-between items-center">
                          <span className="text-xs font-bold text-white uppercase">{t.netEarnings}</span>
                          <span className="text-base font-black text-green-400 font-mono animate-none" id="net_sim_output font-mono">623.30$</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  </>
                  )}

                  {/* -------------------- PAYROLL WORKSPACE -------------------- */}
                  {statsSubTab === 'payroll' && (() => {
                    const activePayrollUser = activeEmployee;
                    const isAdmin = activePayrollUser?.role === 'admin';

                    // If not admin, the worker views their own pay stub (Ma Paye)
                    if (!isAdmin) {
                      const emp = activePayrollUser;
                      if (!emp) {
                        return (
                          <div className="p-8 text-center bg-gray-950 border border-gray-850 rounded-2xl font-mono text-xs text-gray-500">
                            {t.authRequired}
                          </div>
                        );
                      }

                      const empHours = punchSessions
                        .filter(p => p.employeeId === emp.id && p.endTime !== null && p.startTime.startsWith(statsMonth))
                        .reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);

                      const pay = calculateDetailedPayroll(emp, companyInfo, empHours);
                      const isContractor = emp.workerType === 'contractor';
                      const personalPayments = payrollPayments.filter(p => p.employeeId === emp.id && (p.period === 'Mois ' + statsMonth || p.date.startsWith(statsMonth)));

                      return (
                        <div className="space-y-6 text-left">
                          <div className="p-5 bg-gradient-to-r from-orange-600/10 to-indigo-600/10 border border-gray-800 rounded-2xl">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                              <div className="flex items-center gap-3">
                                <EmployeeAvatar src={emp.avatar} name={emp.name} className="w-16 h-16 rounded-full object-cover border-2 border-orange-500 shadow-md" />
                                <div>
                                  <h4 className="text-base font-black text-white">{t.myPayPortal} {emp.name}</h4>
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {isContractor ? (
                                      <span className="p-0.5 px-2 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-black uppercase rounded">{t.contractorBadge}</span>
                                    ) : (
                                      <span className="p-0.5 px-2 text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 font-black uppercase rounded">{t.salariedBadge}</span>
                                    )}
                                    <span className="p-0.5 px-2 text-[9px] bg-gray-500/10 text-gray-400 border border-gray-500/15 font-mono uppercase rounded font-mono">{isQuebec ? 'AS/CCQ' : t.certificationWord}: {emp.asNumber || t.naShort}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right font-mono text-left sm:text-right">
                                <span className="text-[10px] text-gray-450 uppercase block">{t.referencedPeriod}</span>
                                <span className="text-sm font-black text-white font-mono">{statsMonth}</span>
                              </div>
                            </div>
                          </div>

                          {/* Live worksheet / pay stub breakdown */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Left Col: Hours & Rate Summary */}
                            <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                              <span className="text-xs font-black uppercase text-gray-400 block tracking-wider font-sans">{t.activityTimeEntry}</span>
                              
                              <div className="p-4 bg-gray-900 border border-gray-850 rounded-xl space-y-1 text-center">
                                <span className="text-[10px] text-gray-500 uppercase block font-mono">{t.compiledFieldHours}</span>
                                <p className="text-2xl font-black text-orange-500 font-mono">{empHours.toFixed(1)} h</p>
                                <span className="text-[9px] text-gray-400 block mt-0.5 font-sans">{fmt(t.basedOnPunches, { n: punchSessions.filter(p => p.employeeId === emp.id && p.endTime !== null && p.startTime.startsWith(statsMonth)).length })}</span>
                              </div>

                              <div className="space-y-2.5 pt-2 font-mono text-xs text-left">
                                <div className="flex justify-between">
                                  <span className="text-gray-400">{t.hourlyRateColon}</span>
                                  <span className="text-white font-bold">{emp.hourlyRate} $/h</span>
                                </div>
                                {!isContractor && emp.annualSalary && emp.annualSalary > 0 ? (
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">{t.annualSalaryPrecision}</span>
                                    <span className="text-white font-bold">{emp.annualSalary.toLocaleString()} $</span>
                                  </div>
                                ) : null}
                                <div className="flex justify-between border-t border-gray-900 pt-2.5">
                                  <span className="text-gray-400">{t.taxProvinceColon}</span>
                                  <span className="font-bold text-white uppercase">{emp.employeeProvince || 'QC'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Detailed Slip */}
                            <div className="lg:col-span-2 p-5 bg-gray-900 border border-gray-850 rounded-2xl space-y-4">
                              <span className="text-xs font-black uppercase text-gray-400 block tracking-wider font-sans">{t.payStubDetail}</span>

                              {isContractor ? (
                                // Contractor Invoice Simulation
                                <div className="space-y-4 font-mono text-xs">
                                  <div className="p-4 bg-emerald-950/10 border border-emerald-900/20 text-emerald-300 rounded-xl space-y-1.5 leading-relaxed">
                                    <p className="font-black text-[10px] text-emerald-400 uppercase tracking-wider">{t.contractorStatusTitle}</p>
                                    <p className="text-[10px] text-gray-400 font-sans leading-relaxed">{fmt(t.contractorStatusDesc, { region: regionName })}</p>
                                    {emp.businessName && <p className="text-[11px] text-white pt-1">🏢 <strong>{t.companyColon}</strong> {emp.businessName}</p>}
                                    {emp.gstNumber ? (
                                      <p className="text-[11px] text-white">⚙️ <strong>{currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN}/{currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN} :</strong> {emp.gstNumber}</p>
                                    ) : (
                                      <p className="text-[11px] text-yellow-500 font-bold font-sans">{t.noTaxNumbersWarning}</p>
                                    )}
                                  </div>

                                  <div className="space-y-2 border-t border-gray-800 pt-3 text-left">
                                    <div className="flex justify-between text-gray-300">
                                      <span>{t.fieldFeesColon}</span>
                                      <span className="text-white font-bold">{pay.gross.toFixed(2)} $</span>
                                    </div>
                                    {emp.gstNumber && (
                                      <>
                                        <div className="flex justify-between text-emerald-500">
                                          <span>{currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN} {t.billedColon}</span>
                                          <span>+{pay.gst.toFixed(2)} $</span>
                                        </div>
                                        <div className="flex justify-between text-emerald-500">
                                          <span>{currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN} {t.billedColon}</span>
                                          <span>+{pay.qst.toFixed(2)} $</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="flex justify-between text-gray-500">
                                      <span>{t.employerWithholdings}</span>
                                      <span>0.00 $</span>
                                    </div>
                                    <div className="pt-2 border-t border-gray-800 flex justify-between text-base font-black text-white">
                                      <span>{t.totalToOrder}</span>
                                      <span className="text-emerald-400">{pay.net.toFixed(2)} $</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                // Salaried Pay stub details
                                <div className="space-y-3 font-mono text-xs">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left font-sans">
                                    <div className="space-y-2 p-3 bg-gray-950 rounded-xl border border-gray-850">
                                      <span className="text-[9px] text-gray-500 block uppercase font-sans font-bold">{t.gainsSection}</span>
                                      <div className="flex justify-between text-xs font-mono">
                                        <span className="text-gray-400 font-sans">{t.baseSalaryColon}</span>
                                        <span className="text-white font-bold">{pay.gross.toFixed(2)} $</span>
                                      </div>
                                      <div className="flex justify-between text-green-400 font-sans text-xs">
                                        <span>{fmt(t.vacationIndemnity, { pct: companyInfo.payrollVacationRate || 6 })}</span>
                                        <span className="font-mono">+{pay.vacationAmount.toFixed(2)} $</span>
                                      </div>
                                    </div>

                                    <div className="space-y-2 p-3 bg-gray-950 rounded-xl border border-gray-850">
                                      <span className="text-[9px] text-gray-500 block uppercase font-sans font-bold">{t.socialSecurity}</span>
                                      <div className="flex justify-between text-red-500 text-xs font-mono">
                                        <span className="font-sans">{pensionName} / {t.pensionContribution}</span>
                                        <span>-{pay.cpp.toFixed(2)} $</span>
                                      </div>
                                      <div className="flex justify-between text-red-500 text-xs font-mono">
                                        <span className="font-sans">{secondaryDeductionName}:</span>
                                        <span>-{pay.ei.toFixed(2)} $</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="p-3 bg-gray-950 rounded-xl border border-gray-850 space-y-1.5 text-left">
                                    <span className="text-[9px] text-gray-500 block uppercase font-sans font-bold">{t.taxWithholdingsTitle}</span>
                                    <div className="flex justify-between text-red-500 font-mono">
                                      <span className="font-sans">{fmt(t.provTaxColon, { region: regionName })}</span>
                                      <span>-{pay.provTax.toFixed(2)} $</span>
                                    </div>
                                    <div className="flex justify-between text-red-500 font-mono">
                                      <span className="font-sans">{t.fedTaxColon}</span>
                                      <span>-{pay.fedTax.toFixed(2)} $</span>
                                    </div>
                                  </div>

                                  {/* Benefits & Perks Match */}
                                  <div className="p-3 bg-[#1D1530]/50 border border-purple-950/20 text-purple-300 rounded-xl space-y-1.5 text-left">
                                    <span className="text-[9px] text-purple-400 block uppercase font-sans font-bold">{t.firmBenefits}</span>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono">
                                      <div className="flex justify-between font-sans text-gray-400"><span>{t.healthInsuranceColon}</span> <span className="text-white font-mono">-{pay.health.toFixed(2)} $</span></div>
                                      <div className="flex justify-between font-sans text-gray-400"><span>{t.dentalInsuranceColon}</span> <span className="text-white font-mono">-{pay.dental.toFixed(2)} $</span></div>
                                      <div className="flex justify-between font-sans text-gray-400"><span>{t.lifeLtdColon}</span> <span className="text-white font-mono">-{(pay.life + pay.ltd).toFixed(2)} $</span></div>
                                      <div className="flex justify-between font-sans text-gray-400"><span>{t.rrspMatchingColon}</span> <span className="text-white font-mono">-{pay.rrsp.toFixed(2)} $</span></div>
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-gray-850 flex justify-between text-sm sm:text-base font-black text-white text-left">
                                    <span>{t.netComposedPay}</span>
                                    <span className="text-orange-500">{pay.net.toFixed(2)} $</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Past Payments List */}
                          <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-3">
                            <span className="text-xs font-black uppercase text-gray-400 block tracking-wider font-sans">{t.paymentsHistoryTitle}</span>
                            {personalPayments.length === 0 ? (
                              <div className="p-4 text-center rounded bg-gray-900 font-mono text-[11px] text-gray-500 italic">{t.noPaymentsYet}</div>
                            ) : (
                              <div className="space-y-2">
                                {personalPayments.map(p => (
                                  <div key={p.id} className="p-3 bg-gray-900 border border-gray-850 rounded-xl flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="p-1 px-1.5 bg-green-500/10 text-green-400 font-mono text-[9px] rounded font-bold uppercase font-sans">{t.receivedInterac}</span>
                                      <p className="text-white font-bold">{p.date}</p>
                                    </div>
                                    <p className="text-white font-mono font-black">{p.amount.toFixed(2)} $</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Administrator View
                    return (
                      <div className="space-y-6 text-left">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="p-4 bg-gray-950 border border-gray-850 rounded-xl text-left space-y-1">
                            <span className="text-[9.5px] text-gray-400 uppercase font-mono block">{t.estPayrollMass} ({statsMonth})</span>
                            <p className="text-lg font-mono text-white font-black">
                              {employees.reduce((sum, e) => {
                                const hrs = punchSessions
                                  .filter(p => p.employeeId === e.id && p.endTime !== null && p.startTime.startsWith(statsMonth))
                                  .reduce((s, p) => s + (p.totalWorkedHours || 0), 0);
                                return sum + calculateDetailedPayroll(e, companyInfo, hrs).net;
                              }, 0).toFixed(2)} $
                            </p>
                            <span className="text-[9px] text-gray-500 block font-sans">{t.netOwedCompanions}</span>
                          </div>

                          <div className="p-4 bg-gray-950 border border-gray-850 rounded-xl text-left space-y-1">
                            <span className="text-[9.5px] text-gray-400 uppercase font-mono block">{workersCompName} — {t.chargesProvisions}</span>
                            <p className="text-lg font-mono text-white font-black">
                              {(employees.reduce((sum, e) => {
                                if (e.workerType === 'contractor') return sum;
                                const hrs = punchSessions
                                  .filter(p => p.employeeId === e.id && p.endTime !== null && p.startTime.startsWith(statsMonth))
                                  .reduce((s, p) => s + (p.totalWorkedHours || 0), 0);
                                return sum + calculateDetailedPayroll(e, companyInfo, hrs).gross;
                              }, 0) * 0.055).toFixed(2)} $
                            </p>
                            <span className="text-[9px] text-gray-500 block font-sans">{fmt(t.insurancePctGross, { wc: workersCompName })}</span>
                          </div>

                          <div className="p-4 bg-gray-950 border border-gray-850 rounded-xl text-left space-y-1">
                            <span className="text-[9.5px] text-gray-400 uppercase font-mono block">{t.recordedPayments}</span>
                            <p className="text-lg font-mono text-emerald-400 font-black">
                              {payrollPayments.filter(p => p.period === 'Mois ' + statsMonth || p.date.startsWith(statsMonth)).reduce((sum, p) => sum + p.amount, 0).toFixed(2)} $
                            </p>
                            <span className="text-[9px] text-gray-500 block font-sans">{payrollPayments.filter(p => p.period === 'Mois ' + statsMonth || p.date.startsWith(statsMonth)).length} {t.checksIssued}</span>
                          </div>
                        </div>

                        {/* Grand Ledger Table */}
                        <div className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                          <h4 className="text-xs font-black uppercase text-gray-300 block tracking-wider font-sans">{t.payLedgerTitle}{isQuebec ? ' (CCQ)' : ''} ({statsMonth})</h4>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-gray-800 text-gray-400 font-mono text-[9px] uppercase">
                                  <th className="py-2.5 text-left font-sans">{t.thWorker2}</th>
                                  <th className="py-2.5 text-left font-sans">{t.thCategory}</th>
                                  <th className="py-2.5 text-right font-mono">{t.thHours}</th>
                                  <th className="py-2.5 text-right font-mono">{t.thHourlyRate}</th>
                                  <th className="py-2.5 text-right font-mono">{t.thGross}</th>
                                  <th className="py-2.5 text-right font-mono">{t.thTaxes}</th>
                                  <th className="py-2.5 text-right font-black text-white font-mono">{t.thNetEst}</th>
                                  <th className="py-2.5 text-center font-sans">{t.actions}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-850">
                                {employees.map(emp => {
                                  const empHours = punchSessions
                                    .filter(p => p.employeeId === emp.id && p.endTime !== null && p.startTime.startsWith(statsMonth))
                                    .reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);

                                  const pay = calculateDetailedPayroll(emp, companyInfo, empHours);
                                  const isContractor = emp.workerType === 'contractor';
                                  const alreadyPaid = payrollPayments.some(p => p.employeeId === emp.id && (p.period === 'Mois ' + statsMonth || p.date.startsWith(statsMonth)));

                                  return (
                                    <tr key={emp.id} className="hover:bg-gray-900 border-b border-gray-900 transition-all font-mono">
                                      <td className="py-3 flex items-center gap-2 font-sans text-left">
                                        <EmployeeAvatar src={emp.avatar} name={emp.name} className="w-9 h-9 rounded-full object-cover" />
                                        <div>
                                          <p className="font-bold text-white leading-none text-left">{emp.name}</p>
                                          <p className="text-[9.5px] text-gray-500 mt-0.5 text-left">{t.sinShort} {emp.sin || t.notRegistered} | {isQuebec ? 'CCQ' : 'Cert.'}: {emp.asNumber || t.naShort}</p>
                                        </div>
                                      </td>
                                      <td className="py-3 font-sans text-left">
                                        <div>
                                          {isContractor ? (
                                            <span className="p-0.5 px-1.5 text-[8.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-bold uppercase rounded">{t.contractorShort}</span>
                                          ) : (
                                            <span className="p-0.5 px-1.5 text-[8.5px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 font-bold uppercase rounded">{t.salariedShort}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3 text-right text-orange-400 font-bold">{empHours.toFixed(1)} h</td>
                                      <td className="py-3 text-right text-gray-300">{emp.hourlyRate} $/h</td>
                                      <td className="py-3 text-right text-gray-300">{pay.gross.toFixed(2)} $</td>
                                      <td className="py-3 text-right">
                                        {isContractor ? (
                                          <span className="text-emerald-400">+{pay.totalTaxes.toFixed(2)} $ {currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN}/{currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN}</span>
                                        ) : (
                                          <span className="text-red-400">-{pay.totalDeductions.toFixed(2)} $ {t.withholdingsWord}</span>
                                        )}
                                      </td>
                                      <td className="py-3 text-right font-black text-white">{pay.net.toFixed(2)} $</td>
                                      <td className="py-3 text-center font-sans">
                                        {alreadyPaid ? (
                                          <div className="inline-flex items-center gap-1 p-0.5 px-2 bg-green-500/10 text-green-400 border border-green-500/15 font-bold uppercase rounded text-[9px]">
                                            {t.paidInterac}
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setPayrollFocusEmployeeId(emp.id);
                                            }}
                                            className="p-1 px-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-[9.5px] rounded transition cursor-pointer"
                                          >
                                            {t.calcAndPay}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Interactive Slidown Talon */}
                        {payrollFocusEmployeeId && (() => {
                          const emp = employees.find(e => e.id === payrollFocusEmployeeId);
                          if (!emp) return null;

                          const empHours = punchSessions
                            .filter(p => p.employeeId === emp.id && p.endTime !== null && p.startTime.startsWith(statsMonth))
                            .reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);

                          const pay = calculateDetailedPayroll(emp, companyInfo, empHours);
                          const isContractor = emp.workerType === 'contractor';
                          const alreadyPaid = payrollPayments.some(p => p.employeeId === emp.id && (p.period === 'Mois ' + statsMonth || p.date.startsWith(statsMonth)));

                          return (
                            <div className="p-5 bg-gray-900 border border-gray-850 rounded-2xl space-y-4 font-mono text-xs">
                              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                                <h5 className="font-black text-white text-xs uppercase tracking-wider font-sans text-left">{t.directPayStub} {emp.name}</h5>
                                <button
                                  onClick={() => setPayrollFocusEmployeeId('')}
                                  className="text-gray-400 hover:text-white font-black font-mono text-xs cursor-pointer"
                                >
                                  {t.closeUpperBtn}
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed">
                                <div className="space-y-2.5 p-4 bg-gray-950 rounded-xl border border-gray-850 text-left">
                                  <span className="text-[10px] text-gray-500 font-bold block uppercase font-sans">{t.workerFile}</span>
                                  <p className="text-gray-400 font-sans">{t.taxProfileColon} <span className="text-white font-black">{isContractor ? t.contractorProfile : fmt(t.salariedProfileT4, { ccq: isQuebec ? ' CCQ' : '' })}</span></p>
                                  {isContractor ? (
                                    <>
                                      <p className="text-gray-400 font-sans">{t.businessNameColon} <span className="text-white font-bold">{emp.businessName || t.naShort}</span></p>
                                      <p className="text-gray-400 font-sans">{currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN}/{currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN} {t.registeredColon} <span className="text-white font-bold">{emp.gstNumber || t.noTaxNumber}</span></p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-gray-400 font-sans">{t.payFrequencyColon} <span className="text-white font-bold">{emp.payFrequency || t.weeklyWord}</span></p>
                                      <p className="text-gray-400 font-sans">{t.taxProvinceColon2} <span className="text-white font-bold">{emp.employeeProvince || companyRegion.code}</span></p>
                                      {emp.annualSalary ? <p className="text-gray-400 font-sans">{t.annualSalaryBaseColon} <span className="text-white font-bold">{emp.annualSalary.toLocaleString()} $</span></p> : null}
                                    </>
                                  )}
                                  <p className="text-gray-450 font-sans">{t.sinFullColon} <span className="text-white font-bold">{emp.sin || t.notProvided}</span></p>
                                </div>

                                <div className="p-4 bg-gray-950 rounded-xl border border-gray-850 space-y-2.5 font-mono text-left">
                                  <span className="text-[10px] text-gray-400 font-bold block uppercase font-sans">{t.provincialCalcGrid}</span>
                                  <div className="flex justify-between">
                                    <span className="text-gray-400 font-sans">{t.fieldHoursColon2}</span>
                                    <span>{empHours.toFixed(1)} h</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-405 font-sans">{t.baseGrossEarnings}</span>
                                    <span className="text-white font-bold">{pay.gross.toFixed(2)} $</span>
                                  </div>
                                  {isContractor ? (
                                    <>
                                      <div className="flex justify-between text-emerald-400">
                                        <span>{currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN} {t.billedColon}</span>
                                        <span>+{pay.gst.toFixed(2)} $</span>
                                      </div>
                                      <div className="flex justify-between text-emerald-400">
                                        <span>{currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN} {t.billedColon}</span>
                                        <span>+{pay.qst.toFixed(2)} $</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex justify-between text-green-400 font-sans">
                                        <span>{fmt(t.vacationSecurity, { pct: companyInfo.payrollVacationRate || 6 })}</span>
                                        <span>+{pay.vacationAmount.toFixed(2)} $</span>
                                      </div>
                                      <div className="flex justify-between text-red-500">
                                        <span>{t.fedTaxColon2}</span>
                                        <span>-{pay.fedTax.toFixed(2)} $</span>
                                      </div>
                                      <div className="flex justify-between text-red-500">
                                        <span>{fmt(t.provTaxColon2, { region: regionName })}</span>
                                        <span>-{pay.provTax.toFixed(2)} $</span>
                                      </div>
                                      <div className="flex justify-between text-red-500">
                                        <span>{fmt(t.pensionColon, { pension: pensionName })}</span>
                                        <span>-{pay.cpp.toFixed(2)} $</span>
                                      </div>
                                    </>
                                  )}
                                  <div className="pt-2 border-t border-gray-950 flex justify-between font-black text-white text-sm">
                                    <span>{t.netExecPay}</span>
                                    <span className="text-orange-500">{pay.net.toFixed(2)} $</span>
                                  </div>
                                </div>
                              </div>

                              {!alreadyPaid && (
                                <div className="flex justify-end pt-2">
                                  <button
                                    onClick={() => {
                                      addPayrollPayment({
                                        date: new Date().toISOString().slice(0, 10),
                                        employeeId: emp.id,
                                        employeeName: emp.name,
                                        amount: pay.net,
                                        hours: empHours,
                                        period: 'Mois ' + statsMonth,
                                        status: 'paid'
                                      });
                                      setPayrollFocusEmployeeId('');
                                      alert(fmt(t.transferIssuedAlert, { amt: pay.net.toFixed(2), name: emp.name }));
                                    }}
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs rounded transition flex items-center gap-1.5 cursor-pointer font-sans"
                                  >
                                    {fmt(t.confirmTransferBtn, { amt: pay.net.toFixed(2) })}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                </div>
              );
            })()}

            {/* -------------------- VIEW CONTAINER : MOTIVATION -------------------- */}
            {activeTab === 'motivation' && (
              <Suspense fallback={<LazySectionFallback />}>
                <MotivationTab />
              </Suspense>
            )}

            {/* -------------------- VIEW CONTAINER : REGLAGES (12 ONGLETS) -------------------- */}
            {activeTab === 'settings' && (
              <div id="view-settings-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                <div>
                  <h3 className="text-xl font-black text-white">
                    {t.navAdminSettings} — Gestion Chantier Pro
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {t.settingsSubtitle}
                  </p>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                  {/* Left: list of settings tabs (réglages de compagnie/équipe réservés à l'admin) */}
                  <div className="w-full md:w-56 flex flex-col gap-1 flex-shrink-0 border-r border-gray-800 pr-2">
                    {[
                      { name: t.setTabCompagnie, idx: 0, adminOnly: true },
                      { name: t.setTabEmployes, idx: 1, adminOnly: true },
                      { name: t.setTabTheme, idx: 2, adminOnly: false },
                      { name: t.setTabLangue, idx: 3, adminOnly: false },
                      { name: t.setTabPaiement, idx: 4, adminOnly: true },
                      { name: t.setTabRappels, idx: 5, adminOnly: true },
                      { name: t.setTabConditions, idx: 6, adminOnly: true },
                      { name: t.setTabClients, idx: 7, adminOnly: true },
                      { name: t.setTabCatalogue, idx: 8, adminOnly: true },
                      { name: t.setTabComptabilite, idx: 9, adminOnly: true },
                      { name: t.setTabGeofencing, idx: 10, adminOnly: true },
                      { name: t.setTabRH, idx: 11, badge: hrAlerts.filter(a => !a.resolved).length, adminOnly: true },
                      { name: t.setTabAI, idx: 12, adminOnly: true }
                    ].filter(tab => activeEmployee.role === 'admin' || !tab.adminOnly).map(tab => (
                      <button
                        key={tab.idx}
                        onClick={() => setActiveSettingsTab(tab.idx)}
                        className={`text-left text-xs font-semibold px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          visibleSettingsTab === tab.idx
                            ? 'bg-orange-600 text-white font-bold'
                            : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <span>{tab.name}</span>
                        {tab.badge && tab.badge > 0 && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-red-500 rounded-full font-black text-white">
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Right options display */}
                  <div className="flex-1 min-w-0">
                    
                    {/* ONGLET 0: COMPAGNIE */}
                    {visibleSettingsTab === 0 && (
                      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                        <div>
                          <h4 className="text-xs font-black uppercase text-orange-500">{t.companyTitle}</h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">{fmt(t.companySubtitle, { region: regionName })}</p>
                        </div>

                        {/* Pays / Province ou État — pilote tous les libellés et calculs de paie de l'application */}
                        <div className="p-3 bg-gray-950 border border-orange-500/20 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.countryLabel}</label>
                            <select
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs cursor-pointer"
                              value={companyCountry}
                              onChange={(e) => {
                                const nextCountry = e.target.value as 'CA' | 'US';
                                const nextRegion = (nextCountry === 'US' ? US_REGIONS : CANADIAN_REGIONS)[0];
                                updateCompanyInfo({
                                  country: nextCountry,
                                  region: nextRegion.code,
                                  taxRate1: nextRegion.taxRate1,
                                  taxRate2: nextRegion.taxRate2,
                                  taxRate1Name: currentLanguage === 'FR' ? nextRegion.taxRate1NameFR : nextRegion.taxRate1NameEN,
                                  taxRate2Name: currentLanguage === 'FR' ? nextRegion.taxRate2NameFR : nextRegion.taxRate2NameEN,
                                });
                              }}
                            >
                              <option value="CA">Canada</option>
                              <option value="US">{t.usOption}</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.provinceStateLabel}</label>
                            <select
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs cursor-pointer"
                              value={companyRegion.code}
                              onChange={(e) => {
                                const nextRegion = (companyCountry === 'US' ? US_REGIONS : CANADIAN_REGIONS).find(r => r.code === e.target.value);
                                if (!nextRegion) return;
                                updateCompanyInfo({
                                  region: nextRegion.code,
                                  taxRate1: nextRegion.taxRate1,
                                  taxRate2: nextRegion.taxRate2,
                                  taxRate1Name: currentLanguage === 'FR' ? nextRegion.taxRate1NameFR : nextRegion.taxRate1NameEN,
                                  taxRate2Name: currentLanguage === 'FR' ? nextRegion.taxRate2NameFR : nextRegion.taxRate2NameEN,
                                });
                              }}
                            >
                              {(companyCountry === 'US' ? US_REGIONS : CANADIAN_REGIONS).map(r => (
                                <option key={r.code} value={r.code}>{currentLanguage === 'FR' ? r.nameFR : r.nameEN}</option>
                              ))}
                            </select>
                          </div>
                          <p className="sm:col-span-2 text-[9px] text-gray-500">
                            {fmt(t.regionDetermines, { wc: workersCompName })}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.legalNameLabel}</label>
                            <input
                              type="text"
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-sans text-left"
                              defaultValue={companyInfo.name}
                              onChange={(e) => updateCompanyInfo({ name: e.target.value })}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.logoLabel}</label>
                            <input
                              type="text"
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-sans text-left"
                              defaultValue={companyInfo.logo || "📐 Hailite Xteriors Pro"}
                              onChange={(e) => updateCompanyInfo({ logo: e.target.value })}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{businessNumberLabel}</label>
                            <input
                              type="text"
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                              defaultValue={companyInfo.bnNumber || ''}
                              onChange={(e) => updateCompanyInfo({ bnNumber: e.target.value })}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{fmt(t.taxNumberOf, { tax: currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN })}</label>
                            <input
                              type="text"
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                              defaultValue={companyInfo.gstNumber}
                              onChange={(e) => updateCompanyInfo({ gstNumber: e.target.value })}
                            />
                          </div>

                          {companyRegion.taxRate2 > 0 && (
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase font-mono">{fmt(t.taxNumberOf, { tax: currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN })}</label>
                              <input
                                type="text"
                                className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                                defaultValue={companyInfo.qstNumber}
                                onChange={(e) => updateCompanyInfo({ qstNumber: e.target.value })}
                              />
                            </div>
                          )}

                          {isQuebec && (
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase font-mono">{t.rbqPermit}</label>
                              <input
                                type="text"
                                className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                                defaultValue={companyInfo.constructionLicenseNumber || ''}
                                placeholder="RBQ 5683-1044-02"
                                onChange={(e) => updateCompanyInfo({ constructionLicenseNumber: e.target.value })}
                              />
                            </div>
                          )}

                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{fmt(t.membershipNo, { wc: workersCompName })}</label>
                            <input
                              type="text"
                              className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                              defaultValue={companyInfo.wcbNumber || ''}
                              placeholder={`${workersCompName}-000000`}
                              onChange={(e) => updateCompanyInfo({ wcbNumber: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Coordonnées de dépôt de paies par l'institution */}
                        <div className="pt-4 border-t border-gray-800 space-y-3">
                          <h5 className="text-[11px] font-black uppercase text-gray-300">{t.bankTitle}</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.institutionNo}</label>
                              <input
                                type="text"
                                className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                                value={companyInfo.bankDetails?.institution || ''}
                                placeholder="Ex: 006 (Desjardins)"
                                onChange={(e) => updateCompanyInfo({ bankDetails: { ...companyInfo.bankDetails, institution: e.target.value } })}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.transitNo}</label>
                              <input
                                type="text"
                                className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                                value={companyInfo.bankDetails?.transit || ''}
                                placeholder="Ex: 92204"
                                onChange={(e) => updateCompanyInfo({ bankDetails: { ...companyInfo.bankDetails, transit: e.target.value } })}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.accountNo}</label>
                              <input
                                type="text"
                                className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                                value={companyInfo.bankDetails?.account || ''}
                                placeholder="Ex: 4122589"
                                onChange={(e) => updateCompanyInfo({ bankDetails: { ...companyInfo.bankDetails, account: e.target.value } })}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Global Payroll Benefits Settings */}
                        <div className="pt-6 border-t border-gray-800 space-y-4">
                          <div>
                            <span className="p-1 px-2.5 bg-orange-600/15 border border-orange-500/20 text-orange-400 font-bold uppercase font-mono text-[9px] rounded-lg tracking-wider block w-fit mb-2">
                              {t.payrollLegalBadge}
                            </span>
                            <h4 className="text-sm font-black uppercase text-white flex items-center gap-1.5">
                              {t.deductionsConfigTitle}
                            </h4>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {t.deductionsConfigDesc}
                            </p>
                          </div>

                          {/* Mini Sub-tabs inside activeSettingsTab 0 */}
                          <div className="flex flex-wrap gap-1.5 border-b border-gray-800 pb-3">
                            <button
                              type="button"
                              onClick={() => setCotisationsSectionTab('optional')}
                              className={`px-3 py-1.5 text-[10.5px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                cotisationsSectionTab === 'optional'
                                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/10'
                                  : 'bg-gray-900 border border-gray-850 text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>{t.tabBenefits}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCotisationsSectionTab('custom')}
                              className={`px-3 py-1.5 text-[10.5px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                cotisationsSectionTab === 'custom'
                                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/10'
                                  : 'bg-gray-900 border border-gray-850 text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>{t.tabCustomBenefits}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCotisationsSectionTab('mandatory')}
                              className={`px-3 py-1.5 text-[10.5px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                cotisationsSectionTab === 'mandatory'
                                  ? 'bg-gray-950/80 text-orange-400 border border-orange-500/25 font-bold'
                                  : 'bg-gray-900 border border-gray-850 text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>{t.tabMandatory}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCotisationsSectionTab('simulator')}
                              className={`px-3 py-1.5 text-[10.5px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                cotisationsSectionTab === 'simulator'
                                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/15'
                                  : 'bg-gray-900 border border-gray-850 text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>{t.tabSimulator}</span>
                              <span className="p-0.5 px-1 bg-teal-500/25 text-teal-300 rounded font-mono text-[8px] uppercase">Live</span>
                            </button>
                          </div>

                          {/* VIEW TAB 1: MANDATORY DEDUCTIONS (READ ONLY / LOCKED) */}
                          {cotisationsSectionTab === 'mandatory' && (
                            <div className="p-4 bg-gray-950/60 border border-red-500/15 rounded-2xl space-y-4 animate-fade-in text-left">
                              <div className="flex items-center gap-2.5">
                                <span className="text-xl">🔒</span>
                                <div>
                                  <h5 className="text-xs font-black text-red-400 uppercase tracking-wider">{t.mandatoryTitle}</h5>
                                  <p className="text-[9.5px] text-gray-400">{fmt(t.mandatoryDesc, { wc: workersCompName, region: regionName })}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                                <div className="p-3 bg-gray-900/50 border border-gray-850 rounded-xl flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.fedIncomeTax}</span>
                                    <span className="text-[9px] text-gray-500 italic block">{t.fedTaxDesc}</span>
                                  </div>
                                  <span className="p-1 px-2.5 bg-red-950 text-red-400 font-mono text-[9px] border border-red-900/35 rounded-lg uppercase font-bold tracking-wider flex items-center gap-1">
                                    <span>{t.lockedWord}</span> 🔒
                                  </span>
                                </div>

                                <div className="p-3 bg-gray-900/50 border border-gray-850 rounded-xl flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{fmt(t.provIncomeTax, { region: regionName })}</span>
                                    <span className="text-[9px] text-gray-500 italic block">
                                      {companyCountry === 'US'
                                        ? t.usValidate
                                        : (CA_PROVINCIAL_BRACKETS[companyRegion.code]
                                          ? fmt(t.provBrackets, { prep: currentLanguage === 'FR' ? regionWithPreposition(companyRegion, companyCountry) : `(${regionName})` })
                                          : fmt(t.flatEstimate, { pct: (CA_PROVINCIAL_FALLBACK_RATE * 100).toFixed(0) }))}
                                    </span>
                                  </div>
                                  <span className="p-1 px-2.5 bg-red-950 text-red-400 font-mono text-[9px] border border-red-900/35 rounded-lg uppercase font-bold tracking-wider flex items-center gap-1">
                                    <span>{t.lockedWord}</span> 🔒
                                  </span>
                                </div>

                                <div className="p-3 bg-gray-900/50 border border-gray-850 rounded-xl flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{pensionName}</span>
                                    <span className="text-[9px] text-gray-500 italic block">{fmt(t.pensionBaseRate, { pct: (payrollMeta.pensionRate * 100).toFixed(2) })}</span>
                                  </div>
                                  <span className="p-1 px-2.5 bg-red-950 text-red-400 font-mono text-[9px] border border-red-900/35 rounded-lg uppercase font-bold tracking-wider flex items-center gap-1">
                                    <span>{(payrollMeta.pensionRate * 100).toFixed(2)} %</span> 🔒
                                  </span>
                                </div>

                                <div className="p-3 bg-gray-900/50 border border-gray-850 rounded-xl flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{secondaryDeductionName}</span>
                                    <span className="text-[9px] text-gray-500 italic block">
                                      {isQuebec ? t.secondaryRateQc : t.secondaryRateStd} ({(payrollMeta.secondaryDeductionRate * 100).toFixed(2)}%)
                                    </span>
                                  </div>
                                  <span className="p-1 px-2.5 bg-red-950 text-red-400 font-mono text-[9px] border border-red-900/35 rounded-lg uppercase font-bold tracking-wider flex items-center gap-1">
                                    <span>{(payrollMeta.secondaryDeductionRate * 100).toFixed(2)} %</span> 🔒
                                  </span>
                                </div>

                                {isQuebec && (
                                  <div className="p-3 bg-gray-900/50 border border-gray-850 rounded-xl flex items-center justify-between">
                                    <div className="space-y-0.5">
                                      <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.rqapTitle}</span>
                                      <span className="text-[9px] text-gray-500 italic block">{t.rqapDesc}</span>
                                    </div>
                                    <span className="p-1 px-2.5 bg-red-950 text-red-400 font-mono text-[9px] border border-red-900/35 rounded-lg uppercase font-bold tracking-wider flex items-center gap-1">
                                      <span>0.49 %</span> 🔒
                                    </span>
                                  </div>
                                )}

                                {isQuebec && (
                                  <div className="p-3 bg-gray-900/50 border border-gray-850 rounded-xl flex items-center justify-between font-mono">
                                    <div className="space-y-0.5 font-sans">
                                      <span className="text-[10px] text-gray-400 font-bold uppercase block font-mono">{t.ccqUnionTitle}</span>
                                      <span className="text-[9px] text-gray-500 italic block">{t.ccqUnionDesc}</span>
                                    </div>
                                    <span className="p-1 px-2.5 bg-red-950 text-red-400 font-mono text-[9px] border border-red-900/35 rounded-lg uppercase font-bold tracking-wider flex items-center gap-1">
                                      <span>{t.fixedDeduction}</span> 🔒
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="p-3 bg-blue-950/40 border border-blue-900/20 text-[9.5px] text-blue-300 rounded-lg">
                                💡 <strong>{t.auditNoteTitle}</strong> {t.auditNoteBody}
                              </div>
                            </div>
                          )}

                          {/* VIEW TAB 2: EDITABLE BENEFITS (NON MANDATORY / ADJUSTABLE) */}
                          {cotisationsSectionTab === 'optional' && (
                            <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-2xl space-y-4 animate-fade-in text-left">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h5 className="text-xs font-black text-orange-400 uppercase tracking-wider">{t.benefitsTitle}</h5>
                                  <p className="text-[9.5px] text-gray-450">{t.benefitsDesc}</p>
                                </div>
                                <span className="p-1 px-2 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono uppercase font-black">{t.modifiableBadge}</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.vacationPctLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="1"
                                      className="w-full p-2 pr-7 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollVacationRate !== undefined ? companyInfo.payrollVacationRate : 6} 
                                      onChange={(e) => updateCompanyInfo({ payrollVacationRate: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">%</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.vacationHint}</span>
                                </div>

                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.healthLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      className="w-full p-2 pr-6 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollHealthInsurance || 0} 
                                      onChange={(e) => updateCompanyInfo({ payrollHealthInsurance: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">$</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.healthHint}</span>
                                </div>

                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.dentalLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      className="w-full p-2 pr-6 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollDentalInsurance || 0} 
                                      onChange={(e) => updateCompanyInfo({ payrollDentalInsurance: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">$</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.dentalHint}</span>
                                </div>

                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.lifeLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      className="w-full p-2 pr-6 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollLifeInsurance || 0} 
                                      onChange={(e) => updateCompanyInfo({ payrollLifeInsurance: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">$</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.lifeHint}</span>
                                </div>

                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.ltdLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      className="w-full p-2 pr-6 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollLTD || 0} 
                                      onChange={(e) => updateCompanyInfo({ payrollLTD: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">$</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.ltdHint}</span>
                                </div>

                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.rrspLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="0.1" 
                                      className="w-full p-2 pr-7 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollRRSP || 0} 
                                      onChange={(e) => updateCompanyInfo({ payrollRRSP: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">%</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.rrspHint}</span>
                                </div>

                                <div className="p-3 bg-[#12141C] border border-gray-850 rounded-xl space-y-1.5 focus-within:border-orange-500/40 transition sm:col-span-2 md:col-span-1">
                                  <label className="text-[9.5px] text-gray-400 font-bold block uppercase font-mono">{t.eapLabel}</label>
                                  <div className="relative">
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      className="w-full p-2 pr-6 bg-gray-950 border border-gray-800 rounded font-mono text-white text-xs text-right"
                                      value={companyInfo.payrollEAP || 0} 
                                      onChange={(e) => updateCompanyInfo({ payrollEAP: Number(e.target.value) })}
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold">$</span>
                                  </div>
                                  <span className="text-[8px] text-gray-500 block italic leading-tight">{t.eapHint}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* VIEW TAB 3: CUSTOM AVANTAGES */}
                          {cotisationsSectionTab === 'custom' && (
                            <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-2xl space-y-4 animate-fade-in text-left">
                              <div>
                                <h5 className="text-xs font-black text-orange-400 uppercase tracking-wider">{t.customTitle}</h5>
                                <p className="text-[9.5px] text-gray-400 mt-0.5">{t.customDesc}</p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-950/80 rounded-xl border border-gray-850 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase text-orange-400 block font-mono">{t.customLine1}</span>
                                    <span className="text-[8.5px] text-gray-550 font-bold uppercase font-mono">{t.assimBenefit}</span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[9px] text-gray-500 uppercase font-mono block mb-1">{t.designationLabel}</label>
                                      <input 
                                        type="text" 
                                        placeholder={t.exUniformsPh} 
                                        className="w-full p-2 bg-gray-900 text-white text-xs rounded border border-gray-800 text-left"
                                        value={companyInfo.payrollCustom1Name || ""} 
                                        onChange={(e) => updateCompanyInfo({ payrollCustom1Name: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-gray-500 uppercase font-mono block mb-1">{t.amountPerPay}</label>
                                      <div className="relative">
                                        <input 
                                          type="number" 
                                          step="0.01"
                                          placeholder="0.00" 
                                          className="w-full p-2 pr-6 bg-gray-900 text-white text-xs rounded border border-gray-800 font-mono text-right"
                                          value={companyInfo.payrollCustom1Amount || 0} 
                                          onChange={(e) => updateCompanyInfo({ payrollCustom1Amount: Number(e.target.value) })}
                                        />
                                        <span className="absolute right-2 top-2 text-[10px] text-gray-600 font-bold">$</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Presets Row */}
                                  <div className="space-y-1">
                                    <span className="text-[8.5px] text-gray-550 font-bold uppercase font-mono block">{t.presetsLabel}</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      <button 
                                        type="button" 
                                        onClick={() => updateCompanyInfo({ payrollCustom1Name: "Allocation Bottes Sec.", payrollCustom1Amount: 15.00 })}
                                        className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[8.5px] border border-gray-800 rounded font-bold cursor-pointer"
                                      >
                                        {t.presetBoots}
                                      </button>
                                      <button 
                                        type="button" 
                                        onClick={() => updateCompanyInfo({ payrollCustom1Name: "Remboursement Mobile", payrollCustom1Amount: 12.50 })}
                                        className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[8.5px] border border-gray-800 rounded font-bold cursor-pointer"
                                      >
                                        {t.presetMobile}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="p-4 bg-gray-950/80 rounded-xl border border-gray-850 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase text-orange-400 block font-mono">{t.customLine2}</span>
                                    <span className="text-[8.5px] text-gray-550 font-bold uppercase font-mono">{t.assimContribution}</span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[9px] text-gray-500 uppercase font-mono block mb-1">{t.designationLabel}</label>
                                      <input 
                                        type="text" 
                                        placeholder={t.exSocialClubPh} 
                                        className="w-full p-2 bg-gray-900 text-white text-xs rounded border border-gray-800 text-left"
                                        value={companyInfo.payrollCustom2Name || ""} 
                                        onChange={(e) => updateCompanyInfo({ payrollCustom2Name: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-gray-500 uppercase font-mono block mb-1">{t.amountPerPay}</label>
                                      <div className="relative">
                                        <input 
                                          type="number" 
                                          step="0.01"
                                          placeholder="0.00" 
                                          className="w-full p-2 pr-6 bg-gray-900 text-white text-xs rounded border border-gray-800 font-mono text-right"
                                          value={companyInfo.payrollCustom2Amount || 0} 
                                          onChange={(e) => updateCompanyInfo({ payrollCustom2Amount: Number(e.target.value) })}
                                        />
                                        <span className="absolute right-2 top-2 text-[10px] text-gray-600 font-bold">$</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Presets Row */}
                                  <div className="space-y-1">
                                    <span className="text-[8.5px] text-gray-550 font-bold uppercase font-mono block">{t.presetsLabel}</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      <button 
                                        type="button" 
                                        onClick={() => updateCompanyInfo({ payrollCustom2Name: "Cotisation Club Social", payrollCustom2Amount: 10.00 })}
                                        className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[8.5px] border border-gray-800 rounded font-bold cursor-pointer"
                                      >
                                        {t.presetSocialClub}
                                      </button>
                                      <button 
                                        type="button" 
                                        onClick={() => updateCompanyInfo({ payrollCustom2Name: "Abonnement Gym Pro", payrollCustom2Amount: 20.00 })}
                                        className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[8.5px] border border-gray-800 rounded font-bold cursor-pointer"
                                      >
                                        {t.presetGym}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* VIEW TAB 4: LIVE SIMULATOR WIDGET */}
                          {cotisationsSectionTab === 'simulator' && (() => {
                            // Instant Live Calculation values matching our React logic exactly
                            const gross = simHourlyRate * simHoursCount;
                            const vacRate = companyInfo.payrollVacationRate !== undefined ? companyInfo.payrollVacationRate : 6;
                            const vacationAmount = gross * (vacRate / 100);

                            const cpp = gross * 0.0595; // 5.95%
                            const ei = gross * 0.0166;  // 1.16%
                            
                            const annualGross = gross * 52;
                            const fedTaxAnn = calculateProgressiveTax(annualGross, true);
                            const provTaxAnn = calculateProgressiveTax(annualGross, false);
                            
                            const fedTax = fedTaxAnn / 52;
                            const provTax = provTaxAnn / 52;

                            // Company adjustable benefits
                            const health = companyInfo.payrollHealthInsurance || 0;
                            const dental = companyInfo.payrollDentalInsurance || 0;
                            const life = companyInfo.payrollLifeInsurance || 0;
                            const ltd = companyInfo.payrollLTD || 0;
                            const rrsp = gross * ((companyInfo.payrollRRSP || 0) / 100);
                            const eap = companyInfo.payrollEAP || 0;
                            const custom1 = companyInfo.payrollCustom1Amount || 0;
                            const custom2 = companyInfo.payrollCustom2Amount || 0;

                            const totalMandatory = cpp + ei + fedTax + provTax;
                            const totalOptional = health + dental + life + ltd + rrsp + eap + custom1 + custom2;
                            const totalDeductions = totalMandatory + totalOptional;
                            const net = (gross + vacationAmount) - totalDeductions;

                            return (
                              <div className="p-4 bg-gray-900/50 border border-teal-500/15 rounded-2xl space-y-4 animate-fade-in text-left">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                  <div>
                                    <h5 className="text-xs font-black text-teal-400 uppercase tracking-wider flex items-center gap-1">
                                      <span>🧮</span> {t.simTitle.replace('🧮 ', '')}
                                    </h5>
                                    <p className="text-[9.5px] text-gray-400">{t.simDesc}</p>
                                  </div>
                                  <span className="p-1 px-2.5 bg-teal-500/10 text-teal-300 border border-teal-500/20 rounded font-mono text-[9px] uppercase font-bold">
                                    {t.simActiveBadge}
                                  </span>
                                </div>

                                {/* Simulator Inputs Panel */}
                                <div className="p-3 bg-gray-950 rounded-xl border border-gray-850 space-y-3 text-xs">
                                  <span className="text-[10px] text-teal-400 font-extrabold uppercase font-mono block">{t.simInputsTitle}</span>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="text-[9px] text-gray-550 uppercase font-mono block mb-1">{t.fillFromEmployee}</label>
                                      <select
                                        className="w-full p-2 bg-gray-900 text-white rounded border border-gray-800 font-sans cursor-pointer text-left"
                                        value={selectedSimEmployeeStateId}
                                        onChange={(e) => {
                                          const empId = e.target.value;
                                          setSelectedSimEmployeeStateId(empId);
                                          const found = employees.find(x => x.id === empId);
                                          if (found) {
                                            setSimHourlyRate(found.hourlyRate);
                                          }
                                        }}
                                      >
                                        <option value="">{t.manualEntryMode}</option>
                                        {employees.map(x => (
                                          <option key={x.id} value={x.id}>{x.name} ({x.hourlyRate}$/h, {x.workerType === 'salaried' ? t.salariedWord : t.subcontractorWord})</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div>
                                      <label className="text-[9px] text-gray-550 uppercase font-mono block mb-1">{t.simHourlyRateLabel}</label>
                                      <div className="flex gap-1 items-center">
                                        <button 
                                          type="button" 
                                          onClick={() => setSimHourlyRate(Math.max(15.75, simHourlyRate - 1))}
                                          className="p-1.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded text-xs cursor-pointer px-2.5"
                                        >
                                          -
                                        </button>
                                        <input 
                                          type="number" 
                                          className="w-full p-1.5 bg-gray-900 text-white text-xs rounded border border-gray-800 text-center font-mono font-bold"
                                          value={simHourlyRate}
                                          onChange={(e) => setSimHourlyRate(Number(e.target.value))}
                                        />
                                        <button 
                                          type="button" 
                                          onClick={() => setSimHourlyRate(simHourlyRate + 1)}
                                          className="p-1.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded text-xs cursor-pointer px-2.5"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-[9px] text-gray-550 uppercase font-mono block mb-1">{t.simWeekHoursLabel}</label>
                                      <div className="flex gap-1 items-center">
                                        <button 
                                          type="button" 
                                          onClick={() => setSimHoursCount(Math.max(0, simHoursCount - 5))}
                                          className="p-1.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded text-xs cursor-pointer px-2.5"
                                        >
                                          -
                                        </button>
                                        <input 
                                          type="number" 
                                          className="w-full p-1.5 bg-gray-900 text-white text-xs rounded border border-gray-800 text-center font-mono"
                                          value={simHoursCount}
                                          onChange={(e) => setSimHoursCount(Number(e.target.value))}
                                        />
                                        <button 
                                          type="button" 
                                          onClick={() => setSimHoursCount(simHoursCount + 5)}
                                          className="p-1.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded text-xs cursor-pointer px-2.5"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Simulation Check Breakdown */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Left: Earnings and non-mandatory */}
                                  <div className="bg-gray-950/40 border border-gray-850 p-4 rounded-xl space-y-3">
                                    <h6 className="text-[10px] font-black uppercase tracking-wider text-gray-300 border-b border-gray-850 pb-1.5">{t.revenuesIndemnities}</h6>
                                    
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-gray-400">{fmt(t.baseSalaryCalc, { h: simHoursCount, rate: simHourlyRate.toFixed(2) })}</span>
                                        <span className="font-mono text-white text-[12px]">{gross.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-orange-400">{fmt(t.paidLeave, { pct: vacRate })}</span>
                                        <span className="font-mono text-orange-400 font-bold">+{vacationAmount.toFixed(2)}$</span>
                                      </div>
                                      <div className="pt-2 border-t border-gray-850 flex justify-between items-center text-xs font-black">
                                        <span className="text-white uppercase">{t.cumulatedGross}</span>
                                        <span className="font-mono text-white text-sm">{(gross + vacationAmount).toFixed(2)}$</span>
                                      </div>
                                    </div>

                                    <h6 className="text-[10px] font-black uppercase tracking-wider text-orange-400 border-b border-gray-850 pb-1.5 pt-2 flex items-center justify-between">
                                      <span>{t.benefitsWithholdings}</span>
                                      <span className="font-mono text-orange-400">-{totalOptional.toFixed(2)}$</span>
                                    </h6>
                                    
                                    <div className="space-y-1 text-[11px]">
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.healthShort}</span>
                                        <span className="font-mono text-gray-300">-{health.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.dentalShort}</span>
                                        <span className="font-mono text-gray-300">-{dental.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.lifeShort}</span>
                                        <span className="font-mono text-gray-300">-{life.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.ltdShort}</span>
                                        <span className="font-mono text-gray-300">-{ltd.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{fmt(t.rrspEmployee, { pct: companyInfo.payrollRRSP || 0 })}</span>
                                        <span className="font-mono text-gray-300">-{rrsp.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.eapShort}</span>
                                        <span className="font-mono text-gray-300">-{eap.toFixed(2)}$</span>
                                      </div>
                                      {custom1 > 0 && (
                                        <div className="flex justify-between items-center text-gray-400">
                                          <span>{companyInfo.payrollCustom1Name || t.custom1Fallback} :</span>
                                          <span className="font-mono text-gray-300">-{custom1.toFixed(2)}$</span>
                                        </div>
                                      )}
                                      {custom2 > 0 && (
                                        <div className="flex justify-between items-center text-gray-400">
                                          <span>{companyInfo.payrollCustom2Name || t.custom2Fallback} :</span>
                                          <span className="font-mono text-gray-300">-{custom2.toFixed(2)}$</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right: Mandatory source deductions and final Net */}
                                  <div className="bg-gray-950/40 border border-gray-850 p-4 rounded-xl space-y-3">
                                    <h6 className="text-[10px] font-black uppercase tracking-wider text-red-400 border-b border-gray-850 pb-1.5 flex items-center justify-between">
                                      <span>{t.mandatoryWithholdings}</span>
                                      <span className="font-mono">-{totalMandatory.toFixed(2)}$</span>
                                    </h6>
                                    
                                    <div className="space-y-2 text-[11px]">
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{pensionName} :</span>
                                        <span className="font-mono text-gray-300">-{cpp.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{secondaryDeductionName} :</span>
                                        <span className="font-mono text-gray-300">-{ei.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.fedWithheld}</span>
                                        <span className="font-mono text-gray-200 font-bold">-{fedTax.toFixed(2)}$</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>{t.provWithheld}</span>
                                        <span className="font-mono text-gray-200 font-bold">-{provTax.toFixed(2)}$</span>
                                      </div>
                                    </div>

                                    {/* Final Pay Reconciliation card */}
                                    <div className="bg-[#191D26] border border-orange-500/20 p-4 rounded-xl mt-3 space-y-2.5 antialiased">
                                      <span className="text-[10px] font-black uppercase tracking-wider block text-orange-400 font-mono text-center">{t.estPayStub}</span>
                                      
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-[11px] text-gray-400 font-mono">
                                          <span>{t.grossTotalLabel}</span>
                                          <span>{(gross + vacationAmount).toFixed(2)}$</span>
                                        </div>
                                        <div className="flex justify-between text-[11px] text-gray-400 font-mono border-b border-gray-800 pb-1">
                                          <span>{t.totalDeductionsLabel}</span>
                                          <span className="text-red-400">-{totalDeductions.toFixed(2)}$</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-black uppercase pt-1 text-emerald-400">
                                          <span>{t.estNetSalary}</span>
                                          <span className="font-mono text-base font-black text-emerald-400">
                                            {net.toFixed(2)}$
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* ONGLET 1: EMPLOYÉS */}
                    {visibleSettingsTab === 1 && (
                      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 font-sans">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="text-xs font-black uppercase text-orange-500">{t.teamMgmtTitle} ({employees.length})</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5">{t.teamMgmtDesc}</p>
                          </div>
                        </div>

                        {/* List employees */}
                        <div className="space-y-2.5">
                          {employees.map(emp => {
                            const empTeam = motivationTeams.find(t => t.memberIds.includes(emp.id));
                            const isContractor = emp.workerType === 'contractor';
                            
                            // Seniority calculation
                            const getSeniorityLabel = (dateStr: string) => {
                              if (!dateStr) return t.seniorityNew;
                              const start = new Date(dateStr);
                              const now = new Date();
                              let yrs = now.getFullYear() - start.getFullYear();
                              let mos = now.getMonth() - start.getMonth();
                              if (mos < 0) {
                                yrs--;
                                mos += 12;
                              }
                              const text = [];
                              if (yrs > 0) text.push(`${yrs} ${yrs > 1 ? t.yearsWord : t.yearWord}`);
                              if (mos > 0) text.push(`${mos} ${t.monthsWord}`);
                              return text.length > 0 ? text.join(" ") : t.lessThanMonth;
                            };

                            // CCQ vacation tier builder
                            const getVacationTierBadge = (dateStr: string) => {
                              if (!dateStr) return { label: t.tierBase, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
                              const start = new Date(dateStr);
                              const now = new Date();
                              const totalYears = (now.getTime() - start.getTime()) / (1000 * 3600 * 24 * 365.25);
                              if (totalYears < 3) {
                                return { label: t.tier1, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
                              } else if (totalYears < 8) {
                                return { label: t.tier2, color: "text-teal-400 bg-teal-500/10 border-teal-500/20" };
                              } else {
                                return { label: t.tier3, color: "text-amber-500 bg-amber-500/10 border-amber-500/30 font-bold" };
                              }
                            };

                            const seniority = getSeniorityLabel(emp.hireDate);
                            const tier = getVacationTierBadge(emp.hireDate);
                            const isEditing = editingEmployeeId === emp.id;

                            // Initialize edit form when expanded
                            if (isEditing && (!editEmployeeForm || editEmployeeForm.id !== emp.id)) {
                              setEditEmployeeForm({
                                id: emp.id,
                                name: emp.name,
                                nip: emp.nip,
                                role: emp.role,
                                hourlyRate: emp.hourlyRate,
                                workerType: emp.workerType || 'salaried',
                                asNumber: emp.asNumber || '',
                                phone: emp.phone || '',
                                address: emp.address || '',
                                businessName: emp.businessName || '',
                                gstNumber: emp.gstNumber || '',
                                sin: emp.sin || '',
                                employeeProvince: emp.employeeProvince || 'QC',
                                payFrequency: emp.payFrequency || 'weekly',
                                annualSalary: emp.annualSalary || 0,
                                hireDate: emp.hireDate || '2026-06-03',
                                avatar: emp.avatar || ''
                              });
                            }

                            return (
                              <div key={emp.id} className="p-3.5 bg-gray-900 rounded-xl flex flex-col gap-3 text-xs border border-gray-800 hover:border-gray-750 transition-all">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                  <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-3">
                                      <EmployeeAvatar src={emp.avatar} name={emp.name} className="w-12 h-12 rounded-full object-cover border border-gray-800" />
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap text-left">
                                          <h5 className="font-bold text-white text-sm">{emp.name}</h5>
                                          {/* Status badge */}
                                          {isContractor ? (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title={t.contractorTitle}>
                                              {t.contractorShort}
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" title={t.salariedTitle}>
                                              {t.salariedTag} {emp.annualSalary ? `(${emp.annualSalary.toLocaleString()} $)` : ''}
                                            </span>
                                          )}
                                          {empTeam && (
                                            <span 
                                              className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border" 
                                              style={{ 
                                                backgroundColor: `${empTeam.color}15`, 
                                                color: empTeam.color, 
                                                borderColor: `${empTeam.color}30` 
                                              }}
                                            >
                                              {empTeam.name}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-0.5 text-left">
                                          PIN: <span className="font-mono text-white font-bold bg-black px-1 rounded">{emp.nip}</span> — 
                                          {isContractor ? ` ${t.businessLabel} ${emp.businessName || t.naShort}` : ` ${t.provinceLabel} ${emp.employeeProvince || 'QC'} • ${t.frequencyLabel} ${emp.payFrequency || 'weekly'}`}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap pt-0.5 font-mono text-[10px]">
                                      <span className="text-gray-500 font-sans">{t.seniorityLabel}</span> 
                                      <span className="text-yellow-500 font-bold">{seniority}</span>
                                      {!isContractor && (
                                        <>
                                          <span className="text-gray-700">|</span>
                                          <span className={`px-2 py-0.5 rounded-full border text-[9px] uppercase font-bold ${tier.color}`}>
                                            {tier.label}
                                          </span>
                                        </>
                                      )}
                                      {isContractor && emp.gstNumber && (
                                        <>
                                          <span className="text-gray-750">|</span>
                                          <span className="text-emerald-500 font-sans">{fmt(t.tpsTvqActive, { n: emp.gstNumber })}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800/60 md:w-auto">
                                    <div className="text-right">
                                      <span className="text-[10px] text-gray-400 block uppercase font-mono">{t.setRateLabel}</span>
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <input 
                                          type="number"
                                          className="w-14 bg-gray-950 p-1 rounded border border-gray-850 font-mono text-white text-[11px] text-center"
                                          defaultValue={emp.hourlyRate}
                                          onChange={(e) => {
                                            const rate = Number(e.target.value);
                                            updateEmployee({ ...emp, hourlyRate: rate });
                                          }}
                                        />
                                        <span className="text-[10px] text-gray-500">$/h</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <select 
                                        className="bg-gray-950 text-white text-[10px] p-1.5 rounded-lg border border-gray-850 pointer cursor-pointer max-w-[85px]"
                                        value={empTeam?.id || ""}
                                        onChange={(e) => {
                                          const selectedTeamId = e.target.value;
                                          motivationTeams.forEach(t => {
                                            let nextMembers = [...t.memberIds];
                                            if (t.id === selectedTeamId) {
                                              if (!nextMembers.includes(emp.id)) nextMembers.push(emp.id);
                                            } else {
                                              nextMembers = nextMembers.filter(id => id !== emp.id);
                                            }
                                            updateMotivationTeam({ ...t, memberIds: nextMembers });
                                          });
                                        }}
                                      >
                                        <option value="">{t.noTeamOption}</option>
                                        {motivationTeams.map(t => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>

                                      <button
                                        onClick={() => setEditingEmployeeId(isEditing ? null : emp.id)}
                                        className={`p-1.5 rounded border transition text-[10px] uppercase font-bold cursor-pointer ${isEditing ? 'bg-orange-605 border-orange-500/40 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`}
                                      >
                                        {t.fiscalityBtn}
                                      </button>

                                      {employees.length > 1 && login && activeEmployee.id !== emp.id && (
                                        <button 
                                          onClick={() => {
                                            if (confirm(fmt(t.deleteEmployeeConfirm, { name: emp.name }))) {
                                              deleteEmployee(emp.id);
                                            }
                                          }}
                                          className="p-1.5 bg-red-950 hover:bg-red-900 border border-red-900/40 text-red-400 rounded transition cursor-pointer"
                                          title={t.dismissEmployeeTitle}
                                        >
                                          <Trash className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* EDIT DETAILED FORM */}
                                {isEditing && editEmployeeForm && (
                                  <div className="p-4 bg-gray-950 rounded-lg border border-orange-500/25 space-y-3 text-left">
                                    <h6 className="text-[10px] text-orange-400 font-bold uppercase tracking-wider block">{fmt(t.taxProfileTitle, { name: emp.name.toUpperCase() })}</h6>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                      <div>
                                        <label className="text-[9px] text-gray-500 uppercase font-mono">{t.fullNameLabel}</label>
                                        <input 
                                          type="text" 
                                          className="w-full mt-1 p-1.5 bg-[#12141C] text-white text-xs rounded border border-gray-800"
                                          value={editEmployeeForm.name}
                                          onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, name: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[9px] text-gray-500 uppercase font-mono">{t.nip4Label}</label>
                                        <input 
                                          type="text" 
                                          className="w-full mt-1 p-1.5 bg-[#12141C] text-white text-xs font-mono rounded border border-gray-800"
                                          maxLength={4}
                                          value={editEmployeeForm.nip}
                                          onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, nip: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[9px] text-gray-500 uppercase font-mono">{t.hourlyRateDollarLabel}</label>
                                        <input 
                                          type="number" 
                                          className="w-full mt-1 p-1.5 bg-[#12141C] text-white text-xs font-mono rounded border border-gray-800"
                                          value={editEmployeeForm.hourlyRate}
                                          onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, hourlyRate: Number(e.target.value) })}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[9px] text-emerald-500 uppercase font-mono">{t.employmentType}</label>
                                        <select 
                                          className="w-full mt-1 p-1.5 bg-[#12141C] text-white text-xs rounded border border-emerald-950/60 font-bold cursor-pointer text-left"
                                          value={editEmployeeForm.workerType}
                                          onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, workerType: e.target.value })}
                                        >
                                          <option value="salaried">{t.optSalaried}</option>
                                          <option value="contractor">{t.optContractor}</option>
                                        </select>
                                      </div>
                                    </div>

                                    {/* Conditional layouts depending on workerType select */}
                                    {editEmployeeForm.workerType === 'salaried' && (
                                      <div className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg space-y-3">
                                        <span className="text-[9.5px] text-indigo-400 font-bold uppercase block tracking-wider">{t.salariedParams}</span>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                          <div>
                                            <label className="text-[8px] text-gray-400 uppercase font-mono">{t.provinceIssueLabel}</label>
                                            <select 
                                              className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs rounded border border-gray-800 text-left cursor-pointer"
                                              value={editEmployeeForm.employeeProvince}
                                              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, employeeProvince: e.target.value })}
                                            >
                                              <option value="QC">{t.provQuebec}</option>
                                              <option value="AB">{t.provAlberta}</option>
                                              <option value="ON">{t.provOntario}</option>
                                              <option value="BC">{t.provBC}</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-[8px] text-gray-400 uppercase font-mono">{t.payFreqLabel}</label>
                                            <select 
                                              className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs rounded border border-gray-800 text-left cursor-pointer"
                                              value={editEmployeeForm.payFrequency}
                                              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, payFrequency: e.target.value })}
                                            >
                                              <option value="weekly">{t.freqWeekly}</option>
                                              <option value="biweekly">{t.freqBiweekly}</option>
                                              <option value="semi-monthly">{t.freqSemiMonthly}</option>
                                              <option value="monthly">{t.freqMonthly}</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-[8px] text-gray-400 uppercase font-mono">{t.fixedAnnualSalary}</label>
                                            <input 
                                              type="number" 
                                              placeholder={t.annualPlaceholder}
                                              className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800"
                                              value={editEmployeeForm.annualSalary || ''}
                                              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, annualSalary: Number(e.target.value) })}
                                            />
                                          </div>
                                        </div>

                                        {!editEmployeeForm.annualSalary && (
                                          <div className="p-1 px-2 text-[9px] bg-yellow-500/10 text-yellow-400 rounded">
                                            {t.noFixedSalaryWarn}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {editEmployeeForm.workerType === 'contractor' && (
                                      <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg space-y-3">
                                        <span className="text-[9.5px] text-emerald-400 font-bold uppercase block tracking-wider">{t.contractorParams}</span>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                          <div>
                                            <label className="text-[8px] text-gray-400 uppercase font-mono">{t.businessNameField}</label>
                                            <input 
                                              type="text" 
                                              placeholder={t.businessNamePh}
                                              className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs rounded border border-gray-800"
                                              value={editEmployeeForm.businessName}
                                              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, businessName: e.target.value })}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[8px] text-gray-400 uppercase font-mono">{t.gstNoField}</label>
                                            <input 
                                              type="text" 
                                              placeholder={t.gstNoPh}
                                              className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800"
                                              value={editEmployeeForm.gstNumber}
                                              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, gstNumber: e.target.value })}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[8px] text-gray-400 uppercase font-mono">{t.sinField}</label>
                                            <input 
                                              type="text" 
                                              placeholder={t.sinPh}
                                              className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800"
                                              value={editEmployeeForm.sin}
                                              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, sin: e.target.value })}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Avatar Custom Photo selection inside edit form */}
                                    <div className="p-3 bg-gray-950 border border-gray-850 rounded-xl space-y-2 text-left my-2">
                                      <span className="text-[10px] text-orange-400 font-extrabold uppercase font-mono block">{t.photoAvatarTitle}</span>
                                      <div className="flex flex-wrap gap-2 items-center">
                                        {EMPLOYEE_PRESET_AVATARS.map((pav, pidx) => (
                                          <button
                                            key={pidx}
                                            type="button"
                                            onClick={() => setEditEmployeeForm({ ...editEmployeeForm, avatar: pav.url })}
                                            className={`relative rounded-full overflow-hidden w-12 h-12 border-2 transition cursor-pointer ${
                                              editEmployeeForm.avatar === pav.url
                                                ? 'border-orange-500 scale-105 shadow-md shadow-orange-500/10'
                                                : 'border-transparent hover:border-gray-700'
                                            }`}
                                            title={currentLanguage === 'FR' ? pav.labelFR : pav.labelEN}
                                          >
                                            <EmployeeAvatar
                                              src={pav.url}
                                              name={currentLanguage === 'FR' ? pav.labelFR : pav.labelEN}
                                              className="w-full h-full object-cover"
                                            />
                                          </button>
                                        ))}
                                      </div>
                                      <input 
                                        type="text"
                                        placeholder={t.pasteCustomUrlPh}
                                        className="w-full p-1 bg-gray-900 font-mono text-[9.5px] text-white rounded border border-gray-800 text-left"
                                        value={editEmployeeForm.avatar || ''}
                                        onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, avatar: e.target.value })}
                                      />
                                    </div>

                                    <div className="flex justify-between items-center pt-2">
                                      <div className="text-[10px] text-gray-500 font-mono">
                                        {isQuebec ? 'AS/CCQ' : t.certificationWord} : <input
                                          type="text" 
                                          className="p-1 bg-gray-900 text-white border border-gray-800 rounded font-mono text-[10px] w-28"
                                          value={editEmployeeForm.asNumber}
                                          onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, asNumber: e.target.value })}
                                        />
                                      </div>
                                      <div className="flex justify-end gap-1.5">
                                        <button 
                                          onClick={() => {
                                            setEditingEmployeeId(null);
                                            setEditEmployeeForm(null);
                                          }}
                                          className="px-2.5 py-1 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs rounded transition"
                                        >
                                          {t.modalCancelBtn}
                                        </button>
                                        <button 
                                          onClick={() => {
                                            updateEmployee({
                                              ...emp,
                                              name: editEmployeeForm.name,
                                              nip: editEmployeeForm.nip,
                                              hourlyRate: editEmployeeForm.hourlyRate,
                                              workerType: editEmployeeForm.workerType,
                                              asNumber: editEmployeeForm.asNumber,
                                              phone: editEmployeeForm.phone,
                                              address: editEmployeeForm.address,
                                              avatar: editEmployeeForm.avatar || emp.avatar,
                                              businessName: editEmployeeForm.businessName,
                                              gstNumber: editEmployeeForm.gstNumber,
                                              sin: editEmployeeForm.sin,
                                              employeeProvince: editEmployeeForm.employeeProvince,
                                              payFrequency: editEmployeeForm.payFrequency,
                                              annualSalary: editEmployeeForm.annualSalary
                                            });
                                            setEditingEmployeeId(null);
                                            setEditEmployeeForm(null);
                                            alert(t.saveChangesAlert);
                                          }}
                                          className="px-3.5 py-1 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs rounded transition"
                                        >
                                          {t.saveBtn}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Add employee form card */}
                        <div className="p-4 bg-gray-950 rounded-xl border border-gray-850 space-y-4">
                          <span className="text-xs font-black uppercase text-gray-300 block text-left">{t.hireNewTitle}</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.fullNameLabel}</label>
                              <input 
                                type="text"
                                className="w-full mt-1 p-2 bg-gray-900 text-white text-xs rounded border border-gray-800 text-left"
                                placeholder={t.exFullNamePh}
                                value={newEmployeeForm.name}
                                onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, name: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.authPinLabel}</label>
                              <input 
                                type="text"
                                maxLength={4}
                                className="w-full mt-1 p-2 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                placeholder="1234"
                                value={newEmployeeForm.nip}
                                onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, nip: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.hireDateLabel}</label>
                              <input 
                                type="date"
                                className="w-full mt-1 p-1.5 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                value={newEmployeeForm.hireDate || "2026-06-03"}
                                onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, hireDate: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{t.hourlyRateDollarLabel}</label>
                              <input 
                                type="number"
                                className="w-full mt-1 p-2 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                value={newEmployeeForm.hourlyRate}
                                onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, hourlyRate: Number(e.target.value) })}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-emerald-500 uppercase font-mono">{t.taxProfileShort}</label>
                              <select 
                                className="w-full mt-1 p-2 bg-[#12141C] text-white text-xs rounded border border-emerald-950/60 font-bold cursor-pointer text-left"
                                value={newEmployeeForm.workerType}
                                onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, workerType: e.target.value })}
                              >
                                <option value="salaried">{t.optSalaried}</option>
                                <option value="contractor">{t.optContractorIndep}</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 uppercase font-mono">{isQuebec ? t.ccqCertNo : t.certNo}</label>
                              <input
                                type="text"
                                className="w-full mt-1 p-2 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                placeholder={isQuebec ? 'CCQ-14220-41' : ''}
                                value={newEmployeeForm.asNumber}
                                onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, asNumber: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Conditional layouts depending on workerType select */}
                          {newEmployeeForm.workerType === 'salaried' && (
                            <div className="p-3 bg-indigo-950/15 rounded-xl border border-indigo-900/25 space-y-3 text-left">
                              <h6 className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">{t.salariedOptions}</h6>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="text-[9px] text-gray-400 uppercase font-mono">{t.payProvinceLabel}</label>
                                  <select 
                                    className="w-full mt-1 p-2 bg-gray-900 text-white text-xs rounded border border-gray-800 cursor-pointer text-left"
                                    value={newEmployeeForm.employeeProvince}
                                    onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, employeeProvince: e.target.value })}
                                  >
                                    <option value="QC">{t.provQuebec}</option>
                                    <option value="AB">{t.provAlberta}</option>
                                    <option value="ON">{t.provOntario}</option>
                                    <option value="BC">{t.provBC}</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] text-gray-400 uppercase font-mono">{t.paysFrequencyLabel}</label>
                                  <select 
                                    className="w-full mt-1 p-2 bg-gray-900 text-white text-xs rounded border border-gray-800 cursor-pointer text-left"
                                    value={newEmployeeForm.payFrequency}
                                    onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, payFrequency: e.target.value as any })}
                                  >
                                    <option value="weekly">{t.freqWeekly}</option>
                                    <option value="biweekly">{t.freqBiweekly2}</option>
                                    <option value="semi-monthly">{t.freqSemiMonthly}</option>
                                    <option value="monthly">{t.freqMonthly}</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] text-gray-400 uppercase font-mono">{t.fixedAnnualSalary}</label>
                                  <input 
                                    type="number"
                                    placeholder={t.annualPlaceholder2}
                                    className="w-full mt-1 p-2 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                    value={newEmployeeForm.annualSalary || ''}
                                    onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, annualSalary: Number(e.target.value) })}
                                  />
                                </div>
                              </div>

                              {!newEmployeeForm.annualSalary && (
                                <div className="p-2 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded text-[10px] leading-relaxed">
                                  {fmt(t.salariedNoFixedWarn, { rate: newEmployeeForm.hourlyRate })}
                                </div>
                              )}
                            </div>
                          )}

                          {newEmployeeForm.workerType === 'contractor' && (
                            <div className="p-3 bg-emerald-950/15 rounded-xl border border-emerald-900/25 space-y-3 text-left">
                              <h6 className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">{t.contractorOptions}</h6>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="text-[9px] text-gray-400 uppercase font-mono">{t.businessAffiliation}</label>
                                  <input 
                                    type="text"
                                    placeholder={t.businessAffiliationPh}
                                    className="w-full mt-1 p-2 bg-gray-900 text-white text-xs rounded border border-gray-800 text-left"
                                    value={newEmployeeForm.businessName}
                                    onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, businessName: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] text-gray-400 uppercase font-mono">{t.gstNumberField}</label>
                                  <input 
                                    type="text"
                                    placeholder={t.gstNumberPh}
                                    className="w-full mt-1 p-2 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                    value={newEmployeeForm.gstNumber}
                                    onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, gstNumber: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] text-gray-400 uppercase font-mono">{t.sinIfNoGst}</label>
                                  <input 
                                    type="text"
                                    placeholder={t.sinPh}
                                    className="w-full mt-1 p-2 bg-gray-900 text-white text-xs font-mono rounded border border-gray-800 text-left"
                                    value={newEmployeeForm.sin}
                                    onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, sin: e.target.value })}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Avatar Selection Row */}
                          <div className="p-3.5 bg-gray-900/40 border border-gray-850 rounded-xl space-y-3 text-left">
                            <span className="text-[10px] text-orange-400 font-extrabold uppercase font-mono block">{t.choosePhotoTitle}</span>
                            
                            <div className="flex flex-wrap gap-3 items-center">
                              {EMPLOYEE_PRESET_AVATARS.map((pav, pidx) => (
                                <button
                                  key={pidx}
                                  type="button"
                                  onClick={() => {
                                    setNewEmployeeForm({ ...newEmployeeForm, avatar: pav.url });
                                    setPendingEmployeeAvatar('');
                                  }}
                                  className={`relative rounded-full overflow-hidden w-20 h-20 border-2 transition ${
                                    newEmployeeForm.avatar === pav.url
                                      ? 'border-orange-500 scale-105 shadow-md shadow-orange-500/10'
                                      : 'border-transparent hover:border-gray-700'
                                  }`}
                                  title={currentLanguage === 'FR' ? pav.labelFR : pav.labelEN}
                                >
                                  <EmployeeAvatar
                                    src={pav.url}
                                    name={currentLanguage === 'FR' ? pav.labelFR : pav.labelEN}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <input
                                id="new-employee-avatar-camera"
                                type="file"
                                accept="image/*"
                                capture="user"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;

                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') {
                                      setNewEmployeeForm({ ...newEmployeeForm, avatar: reader.result });
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                              <label
                                htmlFor="new-employee-avatar-camera"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/20"
                              >
                                {t.takePhotoBtn}
                              </label>
                              {newEmployeeForm.avatar.startsWith('data:image/') && (
                                <div className="flex items-center gap-2 rounded-full border border-orange-500/25 bg-gray-950/70 py-1 pl-1 pr-3">
                                  <img
                                    src={newEmployeeForm.avatar}
                                    alt={t.selectedPhotoAlt}
                                    className="h-14 w-14 rounded-full border border-orange-500/50 object-cover"
                                  />
                                  <span className="text-[9px] font-bold uppercase text-gray-400">{t.selectedPreview}</span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="text-[8.5px] text-gray-500 font-bold uppercase block font-mono">{t.advancedUrlOption}</label>
                              <input 
                                type="text"
                                placeholder={t.customUrlPh}
                                className="w-full p-1.5 bg-gray-950 font-mono text-white text-xs rounded border border-gray-850 text-left"
                                value={newEmployeeForm.avatar}
                                onChange={(e) => {
                                  setNewEmployeeForm({ ...newEmployeeForm, avatar: e.target.value });
                                  setPendingEmployeeAvatar('');
                                }}
                              />
                            </div>
                          </div>
                          
                          <button 
                            disabled={!newEmployeeForm.name || !newEmployeeForm.nip}
                            onClick={() => {
                              addEmployee({
                                name: newEmployeeForm.name,
                                nip: newEmployeeForm.nip,
                                role: 'employee',
                                hourlyRate: newEmployeeForm.hourlyRate || 35,
                                workerType: newEmployeeForm.workerType || 'salaried',
                                avatar: newEmployeeForm.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&q=80',
                                hireDate: newEmployeeForm.hireDate || '2026-06-03',
                                asNumber: newEmployeeForm.asNumber || '',
                                phone: newEmployeeForm.phone || '(418) 555-0199',
                                address: newEmployeeForm.address || `${companyRegion.nameFR}, ${companyRegion.code}`,
                                businessName: newEmployeeForm.businessName,
                                gstNumber: newEmployeeForm.gstNumber,
                                sin: newEmployeeForm.sin,
                                employeeProvince: newEmployeeForm.employeeProvince,
                                payFrequency: newEmployeeForm.payFrequency,
                                annualSalary: newEmployeeForm.annualSalary
                              });
                              setNewEmployeeForm({ 
                                name: '', 
                                nip: '', 
                                role: 'employee', 
                                hourlyRate: 35, 
                                workerType: 'salaried', 
                                asNumber: '', 
                                phone: '', 
                                address: '', 
                                hireDate: '2026-06-03',
                                avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&q=80',
                                businessName: '',
                                gstNumber: '',
                                sin: '',
                                employeeProvince: 'QC',
                                payFrequency: 'weekly',
                                annualSalary: 0
                              });
                              alert(t.employeeAddedAlert);
                            }}
                            className="w-full py-2.5 bg-orange-600 hover:bg-[#EA580C] text-white text-xs font-black rounded-lg transition disabled:opacity-50 cursor-pointer"
                          >
                            {t.hireActivateBtn}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ONGLET 2: THÈMES */}
                    {visibleSettingsTab === 2 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase text-orange-500">{t.themeTitle} ({currentTheme})</h4>
                        
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: 'quantum', nameFR: 'Quantum (Bleu d\'un diamant)', nameEN: 'Quantum (Diamond Blue)', descFR: 'Bleu/Cyan radial', descEN: 'Radial Blue/Cyan' },
                            { id: 'xp', nameFR: 'Grand XP', nameEN: 'Grand XP', descFR: 'Violet/Orange radiant', descEN: 'Radiant Purple/Orange' },
                            { id: 'deco', nameFR: 'Art Deco Vintage', nameEN: 'Vintage Art Deco', descFR: 'Ornements Art déco dorés', descEN: 'Golden Art Deco ornaments' },
                            { id: 'inferno', nameFR: 'Inferno de Braise', nameEN: 'Ember Inferno', descFR: 'Effets braise rouge vif', descEN: 'Bright red ember effects' },
                            { id: 'arctic', nameFR: 'Arctic Boréal', nameEN: 'Boreal Arctic', descFR: 'Effet de givre et flocons', descEN: 'Frost and snowflake effect' },
                            { id: 'carbon', nameFR: 'Carbon Métal', nameEN: 'Carbon Metal', descFR: 'Fini plaque métallique et vis', descEN: 'Metal plate and rivets finish' }
                          ].map(tPreset => (
                            <button
                              key={tPreset.id}
                              onClick={() => setTheme(tPreset.id as any)}
                              className={`p-3 rounded-xl text-left border cursor-pointer transition ${
                                currentTheme === tPreset.id 
                                  ? 'bg-orange-600/10 border-orange-500 text-white' 
                                  : 'bg-gray-900 border-gray-805 hover:bg-gray-850 text-gray-300'
                              }`}
                            >
                              <p className="text-xs font-bold">{currentLanguage === 'FR' ? tPreset.nameFR : tPreset.nameEN}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{currentLanguage === 'FR' ? tPreset.descFR : tPreset.descEN}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ONGLET 3: LANGUE */}
                    {visibleSettingsTab === 3 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase text-orange-500">{t.changeLanguage}</h4>
                        <div className="flex gap-4">
                          <button
                            onClick={() => setLanguage('FR')}
                            className={`flex-1 py-3 text-center rounded-xl border font-bold cursor-pointer transition ${
                              currentLanguage === 'FR' ? 'bg-orange-600 border-orange-500 text-white font-black' : 'bg-gray-900 border-gray-850 text-gray-400'
                            }`}
                          >
                            Français canadien (FR)
                          </button>
                          <button
                            onClick={() => setLanguage('EN')}
                            className={`flex-1 py-3 text-center rounded-xl border font-bold cursor-pointer transition ${
                              currentLanguage === 'EN' ? 'bg-orange-600 border-orange-500 text-white font-black' : 'bg-gray-900 border-gray-850 text-gray-400'
                            }`}
                          >
                            English UK/CA (EN)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ONGLET 4: PAIEMENTS */}
                    {visibleSettingsTab === 4 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase text-orange-500">{t.paymentsTitle}</h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.initialDeposit}</label>
                            <input 
                              type="number" 
                              className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono font-bold text-center" 
                              defaultValue={companyInfo.paymentDepositPct || 30}
                              onChange={(e) => updateCompanyInfo({ paymentDepositPct: Number(e.target.value) })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.midProject}</label>
                            <input 
                              type="number" 
                              className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono font-bold text-center" 
                              defaultValue={companyInfo.paymentMidPct || 40}
                              onChange={(e) => updateCompanyInfo({ paymentMidPct: Number(e.target.value) })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase font-mono">{t.finalDelivery}</label>
                            <input 
                              type="number" 
                              className="w-full mt-1 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono font-bold text-center" 
                              defaultValue={companyInfo.paymentFinalPct || 30}
                              onChange={(e) => updateCompanyInfo({ paymentFinalPct: Number(e.target.value) })}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-gray-400 uppercase">{t.lateInterestLabel}</label>
                          <input
                            type="number"
                            className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                            value={companyInfo.defaultLateInterestPct ?? 18}
                            onChange={(e) => updateCompanyInfo({ defaultLateInterestPct: Number(e.target.value) })}
                          />
                        </div>

                        <div className="pt-2">
                          <label className="text-[10px] text-gray-500 uppercase font-mono">{t.interacEmailLabel}</label>
                          <input 
                            type="text" 
                            className="w-full p-2 mt-1 bg-gray-900 rounded border border-gray-850 text-xs text-left font-mono" 
                            defaultValue={companyInfo.interacEmail}
                            onChange={(e) => updateCompanyInfo({ interacEmail: e.target.value })}
                            placeholder={t.interacEmailPh}
                          />
                        </div>
                      </div>
                    )}

                    {/* ONGLET 5: RAPPELS VOCAUX */}
                    {visibleSettingsTab === 5 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase text-orange-500">{t.remindersTitle}</h4>
                        <div>
                          <label className="text-[10px] text-gray-400 uppercase">{fmt(t.chimeVolume, { pct: companyInfo.voiceReminderVolume || 0 })}</label>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            className="w-full mt-2 cursor-pointer accent-orange-600" 
                            defaultValue={companyInfo.voiceReminderVolume}
                            onChange={(e) => updateCompanyInfo({ voiceReminderVolume: Number(e.target.value) })}
                          />
                        </div>

                        <div className="p-3 bg-gray-950 rounded border border-gray-850 text-gray-400 leading-normal text-[11px] space-y-1">
                          <p className="font-bold text-white text-xs">{t.autoAlertsTitle}</p>
                          <p>{t.morningBreak}</p>
                          <p>{t.lunchBreak}</p>
                          <p>{t.afternoonBreak}</p>
                          <p className="text-orange-500 text-[10px] mt-1">{t.audioNote}</p>
                        </div>
                      </div>
                    )}

                    {/* ONGLET 6 à 12: CONTENU PARAMETRES RAPIDE */}
                    {visibleSettingsTab === 6 && (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        <h4 className="text-xs font-black uppercase text-orange-500">{t.conditionsTitle}</h4>
                        <div>
                          <label className="text-[10px] text-gray-400 uppercase">{t.warrantyYearsLabel}</label>
                          <input
                            type="number"
                            className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-white text-xs font-mono text-left"
                            value={companyInfo.defaultWarrantyYears ?? 10}
                            onChange={(e) => updateCompanyInfo({ defaultWarrantyYears: Number(e.target.value) })}
                          />
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] text-gray-400 uppercase block mb-1">{t.changeOrderClauseLabel}</label>
                            <textarea
                              className="w-full p-2 h-20 bg-gray-900 border border-gray-850 rounded text-left text-xs font-sans text-gray-300"
                              value={companyInfo.defaultClauseChangeOrder ?? `Toute modification apportée aux plans d’origine ou extra de quincaillerie fera l'objet d'un avenant écrit signé et sera facturée au taux horaire applicable${isQuebec ? ' CCQ' : ''} de 120$/h.`}
                              onChange={(e) => updateCompanyInfo({ defaultClauseChangeOrder: e.target.value })}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-400 uppercase block mb-1">{t.resiliationClauseLabel}</label>
                            <textarea
                              className="w-full p-2 h-20 bg-gray-900 border border-gray-850 rounded text-left text-xs font-sans text-gray-300"
                              value={companyInfo.defaultClauseResiliation ?? "Le client peut résilier unilatéralement le contrat avant le début des travaux moyennant des frais administratifs fixes de 10% correspondant aux réservations logistiques."}
                              onChange={(e) => updateCompanyInfo({ defaultClauseResiliation: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {visibleSettingsTab === 7 && (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        <h4 className="text-xs font-black uppercase text-orange-500">{t.clientsFileTitle} ({clients.length})</h4>
                        
                        {/* Add client */}
                        <div className="p-3 bg-gray-950 rounded-xl border border-gray-850 space-y-3">
                          <span className="text-[10px] font-bold text-white uppercase block">{t.addClientTitle}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="text" 
                              placeholder={t.contactNamePh}
                              className="p-1.5 bg-gray-900 text-xs text-white rounded border border-gray-800 text-left" 
                              value={newClientForm.name}
                              onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                            />
                            <input 
                              type="text" 
                              placeholder={t.companyNamePh}
                              className="p-1.5 bg-gray-900 text-xs text-white rounded border border-gray-800 text-left" 
                              value={newClientForm.company}
                              onChange={(e) => setNewClientForm({ ...newClientForm, company: e.target.value })}
                            />
                            <input 
                              type="email" 
                              placeholder={t.emailPh}
                              className="p-1.5 bg-gray-900 text-xs text-white rounded border border-gray-800 text-left" 
                              value={newClientForm.email}
                              onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                            />
                            <input 
                              type="text" 
                              placeholder={t.phonePh}
                              className="p-1.5 bg-gray-900 text-xs text-white rounded border border-gray-800 text-left" 
                              value={newClientForm.phone}
                              onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                            />
                          </div>
                          <button 
                            disabled={!newClientForm.name}
                            onClick={() => {
                              addClient({
                                name: newClientForm.name,
                                company: newClientForm.company || 'Particulier',
                                email: newClientForm.email || 'contact@client.com',
                                phone: newClientForm.phone || '(514) 555-0122',
                                address: newClientForm.address || 'Montréal, QC'
                              });
                              setNewClientForm({ name: '', company: '', email: '', phone: '', address: '' });
                              alert(t.clientInsertedAlert);
                            }}
                            className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-black text-[11px] rounded transition disabled:opacity-40 cursor-pointer"
                          >
                            {t.saveClientBtn}
                          </button>
                        </div>

                        {/* List clients */}
                        <div className="space-y-1.5">
                          {clients.map(cli => (
                            <div key={cli.id} className="p-2.5 bg-gray-900 rounded-lg flex items-center justify-between border border-gray-850 text-xs">
                              <div>
                                <h5 className="font-bold text-white">{cli.name} <span className="text-gray-500 font-normal">({cli.company})</span></h5>
                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">{cli.email} — {cli.phone}</p>
                              </div>
                              <button 
                                onClick={() => {
                                  if (confirm(t.deleteClientConfirm)) deleteClient(cli.id);
                                }}
                                className="p-1 text-red-400 hover:bg-red-950 rounded cursor-pointer"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {visibleSettingsTab === 8 && (
                      <div className="max-h-[600px] overflow-y-auto pr-2">
                        <Suspense fallback={<LazySectionFallback />}>
                          <CatalogueManager />
                        </Suspense>
                      </div>
                    )}

                    {visibleSettingsTab === 9 && (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 font-sans text-xs">
                        <div className="flex justify-between items-center bg-gray-950 p-1.5 rounded-lg border border-gray-800">
                          <button 
                            onClick={() => setAccountingViewMode('expenses')}
                            className={`flex-1 py-1 text-center font-bold text-[11px] rounded transition cursor-pointer ${accountingViewMode === 'expenses' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
                          >
                            {t.materialExpenses} ({expenses?.length || 0})
                          </button>
                          <button 
                            onClick={() => setAccountingViewMode('payroll')}
                            className={`flex-1 py-1 text-center font-bold text-[11px] rounded transition cursor-pointer ${accountingViewMode === 'payroll' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
                          >
                            {t.salaryPayments} ({payrollPayments?.length || 0})
                          </button>
                        </div>

                        {/* EXPENSES SUB-TAB */}
                        {accountingViewMode === 'expenses' && (
                          <div className="space-y-4">
                            {/* Insert Expense */}
                            <div className="p-3 bg-gray-950 rounded-xl border border-gray-850 space-y-2.5">
                              <span className="text-[10px] font-black text-white uppercase block">{t.enterExpenseTitle}</span>
                              <div className="grid grid-cols-2 gap-2 text-left">
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.descriptionLabel}</label>
                                  <input 
                                    type="text" 
                                    placeholder={t.exExpensePh}
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs text-white text-left" 
                                    value={newExpenseFormSetting.description}
                                    onChange={(e) => setNewExpenseFormSetting({ ...newExpenseFormSetting, description: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.expenseDateLabel}</label>
                                  <input 
                                    type="date" 
                                    className="w-full p-1.5 bg-gray-900 rounded border border-gray-800 text-xs text-mono font-bold text-white text-left" 
                                    value={newExpenseFormSetting.date}
                                    onChange={(e) => setNewExpenseFormSetting({ ...newExpenseFormSetting, date: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.categoryLabel}</label>
                                  <select 
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs text-white cursor-pointer text-left"
                                    value={newExpenseFormSetting.category}
                                    onChange={(e) => setNewExpenseFormSetting({ ...newExpenseFormSetting, category: e.target.value })}
                                  >
                                    <option value="materials">{t.catMaterials}</option>
                                    <option value="tools">{t.catTools}</option>
                                    <option value="fuel">{t.catFuel}</option>
                                    <option value="subcontractor">{t.catSubcontractor}</option>
                                    <option value="other">{t.catOther}</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.grossAmountLabel}</label>
                                  <input 
                                    type="number" 
                                    placeholder="0"
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs font-mono font-bold text-white text-right" 
                                    value={newExpenseFormSetting.amount || ''}
                                    onChange={(e) => setNewExpenseFormSetting({ ...newExpenseFormSetting, amount: Number(e.target.value) })}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.associatedProject}</label>
                                  <select 
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs text-white cursor-pointer text-left"
                                    value={newExpenseFormSetting.projectId}
                                    onChange={(e) => setNewExpenseFormSetting({ ...newExpenseFormSetting, projectId: e.target.value })}
                                  >
                                    <option value="">{t.generalNoProject}</option>
                                    {projects.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <button 
                                disabled={!newExpenseFormSetting.description || !newExpenseFormSetting.amount}
                                onClick={() => {
                                  addExpense({
                                    date: newExpenseFormSetting.date,
                                    provider: newExpenseFormSetting.description,
                                    category: (newExpenseFormSetting.category.toLowerCase() as any) || 'materials',
                                    amount: Number(newExpenseFormSetting.amount),
                                    projectId: newExpenseFormSetting.projectId || '',
                                    tax: Number((newExpenseFormSetting.amount * 0.14975).toFixed(2)),
                                    notes: currentLanguage === 'FR' ? 'Enregistré depuis le panneau de configuration' : 'Recorded from the settings panel'
                                  });
                                  setNewExpenseFormSetting({ date: '2026-06-03', description: '', category: 'materials', amount: 0, projectId: '' });
                                  alert(t.expenseAddedAlert);
                                }}
                                className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs rounded transition disabled:opacity-40 cursor-pointer"
                              >
                                {t.saveExpenseBtn}
                              </button>
                            </div>

                            {/* Scrollable list */}
                            <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                              {expenses?.map(exp => {
                                const matchedProj = projects.find(p => p.id === exp.projectId);
                                return (
                                  <div key={exp.id} className="p-2.5 bg-gray-900 rounded-lg border border-gray-850 flex items-center justify-between text-[11px]">
                                    <div className="text-left">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-white">{exp.provider}</span>
                                        <span className="px-1 text-[8px] bg-gray-800 text-gray-400 rounded uppercase font-mono">
                                          {exp.category}
                                        </span>
                                      </div>
                                      <p className="text-[9px] text-gray-500 mt-0.5">
                                        {exp.date} — {matchedProj ? `${t.projectPrefix} ${matchedProj.name}` : t.adminFees}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-red-400 font-bold">-{exp.amount.toFixed(2)}$</span>
                                      <button 
                                        onClick={() => {
                                          if (confirm(t.deleteExpenseConfirm)) deleteExpense(exp.id);
                                        }}
                                        className="text-gray-500 hover:text-red-400 cursor-pointer p-0.5 hover:bg-red-950 rounded"
                                      >
                                        <Trash className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* PAYROLLS SUB-TAB */}
                        {accountingViewMode === 'payroll' && (
                          <div className="space-y-4">
                            {/* Insert Payroll */}
                            <div className="p-3 bg-gray-950 rounded-xl border border-gray-850 space-y-2.5">
                              <span className="text-[10px] font-black text-white uppercase block">{t.enterPayrollTitle}</span>
                              <div className="grid grid-cols-2 gap-2 text-left">
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.beneficiaryLabel}</label>
                                  <select 
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs text-white cursor-pointer text-left"
                                    value={newPayrollFormSetting.employeeId}
                                    onChange={(e) => setNewPayrollFormSetting({ ...newPayrollFormSetting, employeeId: e.target.value })}
                                  >
                                    <option value="">{t.selectEmployeeOption}</option>
                                    {employees.map(emp => (
                                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.paymentDateLabel}</label>
                                  <input 
                                    type="date" 
                                    className="w-full p-1.5 bg-gray-900 rounded border border-gray-800 text-xs text-mono font-bold text-white text-left" 
                                    value={newPayrollFormSetting.date}
                                    onChange={(e) => setNewPayrollFormSetting({ ...newPayrollFormSetting, date: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.hoursPaidLabel}</label>
                                  <input 
                                    type="number" 
                                    placeholder="0"
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs font-mono text-white text-right font-bold" 
                                    value={newPayrollFormSetting.hours || ''}
                                    onChange={(e) => setNewPayrollFormSetting({ ...newPayrollFormSetting, hours: Number(e.target.value) })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-mono text-gray-500 mb-1 block">{t.netAmountPaidLabel}</label>
                                  <input 
                                    type="number" 
                                    placeholder="0"
                                    className="w-full p-2 bg-gray-900 rounded border border-gray-800 text-xs font-mono font-bold text-white text-right" 
                                    value={newPayrollFormSetting.amount || ''}
                                    onChange={(e) => setNewPayrollFormSetting({ ...newPayrollFormSetting, amount: Number(e.target.value) })}
                                  />
                                </div>
                              </div>
                              <button 
                                disabled={!newPayrollFormSetting.employeeId || !newPayrollFormSetting.amount}
                                onClick={() => {
                                  const targetEmployee = employees.find(e => e.id === newPayrollFormSetting.employeeId);
                                  addPayrollPayment({
                                    date: newPayrollFormSetting.date,
                                    employeeId: newPayrollFormSetting.employeeId,
                                    employeeName: targetEmployee ? targetEmployee.name : t.externalEmployee,
                                    amount: Number(newPayrollFormSetting.amount),
                                    hours: Number(newPayrollFormSetting.hours || 0),
                                    projectId: newPayrollFormSetting.projectId || undefined,
                                    period: 'Mois ' + newPayrollFormSetting.date.substring(0, 7),
                                    status: 'paid'
                                  });
                                  setNewPayrollFormSetting({ date: '2026-06-03', employeeId: '', amount: 0, hours: 0, projectId: '', status: 'paid' });
                                  alert(t.payrollSavedAlert);
                                }}
                                className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs rounded transition disabled:opacity-40 cursor-pointer"
                              >
                                {t.issueInteracBtn}
                              </button>
                            </div>

                            {/* Scrollable list */}
                            <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                              {payrollPayments?.map(p => {
                                const matchedEmployee = employees.find(e => e.id === p.employeeId);
                                return (
                                  <div key={p.id} className="p-2.5 bg-gray-900 rounded-lg border border-gray-850 flex items-center justify-between text-[11px]">
                                    <div className="text-left">
                                      <p className="font-bold text-white">{matchedEmployee?.name || t.externalEmployee}</p>
                                      <p className="text-[9px] text-gray-500 mt-0.5">
                                        {p.date} — {p.hours} {t.hoursInvested}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-purple-400 font-bold">-{p.amount.toFixed(2)}$</span>
                                      <button 
                                        onClick={() => {
                                          if (confirm(t.deletePayrollConfirm)) deletePayrollPayment(p.id);
                                        }}
                                        className="text-gray-500 hover:text-red-400 cursor-pointer p-0.5 hover:bg-red-950 rounded"
                                      >
                                        <Trash className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {visibleSettingsTab === 10 && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-left">
                          <h4 className="text-xs font-black uppercase text-orange-500">{t.geoTitle}</h4>
                          <input 
                            type="checkbox"
                            checked={companyInfo.geofencingEnabled}
                            onChange={(e) => updateCompanyInfo({ geofencingEnabled: e.target.checked })}
                            className="w-4 h-4 rounded cursor-pointer accent-orange-600"
                          />
                        </div>

                        <div className="p-3 bg-gray-900 rounded border border-gray-850 space-y-2 text-xs text-left">
                          <p className="font-bold text-white uppercase">{t.hqCoords}</p>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-gray-500 block font-mono">{t.latWord}</span>
                              <span className="font-bold text-white font-mono">45.50884</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block font-mono">{t.lonWord}</span>
                              <span className="font-bold text-white font-mono">-73.55400</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-normal pt-1.5">
                            {t.geoRadiusNote1} <span className="text-orange-500 font-extrabold font-mono">100m</span>{t.geoRadiusNote2}
                          </p>
                        </div>
                      </div>
                    )}

                    {visibleSettingsTab === 11 && (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 text-xs font-sans">
                        <div className="text-left">
                          <h4 className="text-xs font-black uppercase text-orange-500">{t.hrTitle}</h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">{isQuebec ? t.hrSubtitleQc : t.hrSubtitleStd}</p>
                        </div>

                        {/* Active alert boxes */}
                        <div className="space-y-2 text-left">
                          <span className="text-[9px] uppercase font-mono text-gray-500 block">{t.complianceAlerts} ({hrAlerts.filter(a => !a.resolved).length})</span>
                          {hrAlerts.filter(a => !a.resolved).map(alertItem => (
                            <div key={alertItem.id} className="p-3 bg-red-950/40 border border-red-900/30 rounded-xl flex items-center justify-between text-xs gap-3">
                              <div className="flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 animate-pulse" />
                                <div>
                                  <h5 className="font-bold text-red-300">{alertItem.title || t.hrAlertFallback}</h5>
                                  <p className="text-[10px] text-red-400 mt-0.5 leading-snug">{alertItem.message}</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => {
                                  resolveHRAlert(alertItem.id);
                                  window.alert(t.alertResolvedAlert);
                                }}
                                className="px-2.5 py-1 bg-red-900/40 hover:bg-red-800 text-red-200 font-bold text-[10px] border border-red-500/30 rounded cursor-pointer transition"
                              >
                                {t.resolveBtn}
                              </button>
                            </div>
                          ))}

                          {hrAlerts.filter(a => !a.resolved).length === 0 && (
                            <div className="p-4 text-center text-gray-500 bg-gray-950 rounded-xl border border-gray-850">
                              {t.allCompliant}
                            </div>
                          )}
                        </div>

                        {/* Calendar View representation */}
                        <div className="pt-3 border-t border-gray-850 space-y-2 text-left">
                          <span className="text-[9px] uppercase font-mono text-gray-500 block">{isQuebec ? t.calendarLabelQc : fmt(t.calendarLabelStd, { wc: workersCompName })}</span>
                          <div className="space-y-1.5">
                            {[
                              { date: t.hrDate1, label: isQuebec ? t.hrEvent1Qc : t.hrEvent1, type: "administrative" },
                              { date: t.hrDate2, label: t.hrEvent2, type: "safeguard" },
                              { date: t.hrDate3, label: t.hrEvent3, type: "anniversary" },
                              { date: t.hrDate4, label: t.hrEvent4, type: "safeguard" }
                            ].map((event, idx) => (
                              <div key={idx} className="p-2 bg-gray-900 border border-gray-850 rounded-lg flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-gray-300">{event.label}</span>
                                <span className="font-mono text-orange-500 font-bold text-[10px]">{event.date}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {visibleSettingsTab === 12 && (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 text-xs font-sans text-left">
                        <div>
                          <h4 className="text-xs font-black uppercase text-orange-500">{t.aiSettingsTitle}</h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {t.aiSettingsDesc}
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[9px] text-gray-500 font-bold uppercase block font-mono">{t.aiProviderLabel}</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {([
                              { id: 'anthropic', label: 'Anthropic Claude' },
                              { id: 'gemini', label: 'Google Gemini' },
                              { id: 'openai', label: 'OpenAI ChatGPT' }
                            ] as const).map(p => (
                              <button
                                key={p.id}
                                onClick={() => updateCompanyInfo({ aiProvider: p.id })}
                                className={`p-3 rounded-xl border text-xs font-black transition cursor-pointer ${
                                  (companyInfo.aiProvider || 'gemini') === p.id
                                    ? 'bg-orange-600 border-orange-500 text-white'
                                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* La clé API ne transite plus JAMAIS par le navigateur :
                            elle vit exclusivement dans les variables d'environnement
                            du serveur (Vercel) et le navigateur n'appelle que
                            l'API protégée /api/chat. */}
                        <div className="p-3 bg-gray-950 border border-emerald-500/20 rounded-xl space-y-1.5">
                          <span className="text-[10px] text-emerald-400 font-black uppercase block font-mono">{t.aiKeyServerTitle}</span>
                          <p className="text-[10px] text-gray-400 leading-relaxed">
                            {t.aiKeyServerBody}
                          </p>
                          <p className="text-[10px] text-gray-600">
                            {t.keyBadgeHint}
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Rail Panel : active workers count list + inventory alarm widgets */}
          <div id="right-rail-scaffold" className="w-full lg:w-80 flex flex-col gap-6 flex-shrink-0">
            
            {/* Proximity geofence card */}
            <div className="p-4 bg-[#16191F] border border-gray-800 rounded-2xl flex flex-col gap-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {t.geofencingStatus}
              </h4>
              <div className="flex items-center gap-2">
                <span className="p-1 px-1.5 rounded bg-orange-600/10 text-orange-500 font-mono text-[10px] uppercase font-bold text-center">
                  {t.gpsActive}
                </span>
                <span className="text-xs text-gray-300">
                  {companyInfo.geofencingEnabled ? t.restrictedBySite : t.noGlobalRestriction}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-normal">
                {t.railGpsNote}
              </p>
            </div>

            {/* Quick materials list warning */}
            <div className="p-4 bg-[#16191F] border border-gray-800 rounded-2xl flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {t.criticalMaterials}
                </h4>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              </div>
              
              <div className="space-y-2">
                {inventory.filter(i => i.quantity < i.minThreshold).map(i => (
                  <div key={i.id} className="text-xs flex items-center justify-between text-red-400">
                    <span>{i.emoji} {i.name}</span>
                    <span className="font-bold">{i.quantity} / {i.minThreshold}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rappel des normes du travail — s'adapte à la province/état de la compagnie */}
            <div className="p-4 bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">
                {isQuebec ? t.ccqReminder : (currentLanguage === 'FR' ? `Rappel Normes du Travail (${regionName})` : `Labor Standards Reminder (${regionName})`)}
              </span>
              <p className="text-xs text-gray-300 mt-1.5 leading-normal">
                {breakRuleText}
              </p>
            </div>

          </div>

        </div>
      )}

      {/* -------------------- FLOATING ASSISTANT IA BUTTON & PANEL -------------------- */}
      <motion.div
        id="ai-chat-scaffold-wrap"
        drag
        dragMomentum={false}
        dragControls={dragControls}
        dragListener={!aiChatOpen}
        className="fixed bottom-6 right-6 z-50 select-none"
      >
        {!aiChatOpen ? (
          <button
            onClick={() => setAiChatOpen(true)}
            id="floating-ai-agent-btn"
            className="w-14 h-14 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full shadow-2xl flex items-center justify-center text-2xl border-2 border-white/20 hover:scale-110 active:scale-95 transition-transform duration-300 cursor-grab active:cursor-grabbing text-white animate-bounce"
          >
            ✨
          </button>
        ) : (
          <div className="w-80 sm:w-96 h-[500px] bg-[#16191F] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="p-4 bg-gradient-to-r from-cyan-950 to-blue-950 text-white flex items-center justify-between border-b border-gray-800 cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div className="text-left">
                  <h4 className="text-xs font-black text-white leading-none uppercase tracking-wide">
                    {t.aiAgentTitle}
                  </h4>
                  <span className="text-[9px] text-green-400 font-mono font-bold uppercase">Hailite Assistant</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const next = !voiceEnabled;
                    setVoiceEnabled(next);
                    if (!next && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
                  }}
                  title={voiceEnabled ? t.voiceOffTitle : t.voiceOnTitle}
                  className={`transition p-1 rounded-full hover:bg-white/10 cursor-pointer ${voiceEnabled ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
                >
                  {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => setAiChatOpen(false)}
                  className="text-gray-400 hover:text-white transition p-1 rounded-full hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat message logs */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {aiHistory.map((chat, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`p-3 rounded-xl text-xs max-w-[85%] leading-relaxed ${
                    chat.role === 'user'
                      ? 'bg-orange-600 text-white rounded-br-none'
                      : 'bg-gray-850 text-gray-200 rounded-bl-none'
                  }`}>
                    {chat.imagePreviewUrl && (
                      <img
                        src={chat.imagePreviewUrl}
                        alt={t.attachedPhotoAlt}
                        className="rounded-lg mb-2 max-h-40 w-auto max-w-full object-contain"
                      />
                    )}
                    {chat.pdfName && (
                      <span className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-black/25 text-[10px] font-bold">
                        <FileText className="w-3.5 h-3.5 text-red-300 shrink-0" />
                        <span className="truncate">{chat.pdfName}</span>
                      </span>
                    )}
                    {chat.text}
                    {chat.simulated && (
                      <span className="block mt-2 text-[9px] text-orange-400 font-mono tracking-widest uppercase">
                        {t.demoModeBadge}
                      </span>
                    )}
                    {chat.sourceLabel && (
                      <span className="block mt-2 text-[9px] text-cyan-500/80 font-mono tracking-wide">
                        ⚡ {chat.sourceLabel}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="p-3 bg-gray-850 rounded-xl rounded-bl-none text-xs text-gray-400 italic">
                    {t.aiThinking}
                  </div>
                </div>
              )}
            </div>

            {/* Aperçu de la pièce jointe (photo ou PDF) au prochain message */}
            {aiImageAttachment && (
              <div className="px-3 pt-2 bg-gray-900 flex items-center gap-2">
                {aiImageAttachment.mimeType === 'application/pdf' ? (
                  <div className="h-14 w-14 flex items-center justify-center rounded-lg border border-gray-700 bg-gray-950">
                    <FileText className="w-6 h-6 text-red-400" />
                  </div>
                ) : (
                  <img
                    src={aiImageAttachment.dataUrl}
                    alt={t.photoToSendAlt}
                    className="h-14 w-14 object-cover rounded-lg border border-gray-700"
                  />
                )}
                <span className="text-[10px] text-gray-400 flex-1 truncate">
                  {aiImageAttachment.mimeType === 'application/pdf'
                    ? fmt(t.pdfReady, { name: aiImageAttachment.name || 'document.pdf' })
                    : t.photoReadyToSend}
                </span>
                <button
                  onClick={() => setAiImageAttachment(null)}
                  className="p-1 text-gray-400 hover:text-red-400 transition cursor-pointer"
                  title={t.removeAttachment}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input message form */}
            <div className="p-3 border-t border-gray-800 bg-gray-900 flex items-center gap-2">
              <input
                ref={aiPhotoInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleAiPhotoSelected}
                className="hidden"
              />
              <button
                onClick={() => aiPhotoInputRef.current?.click()}
                disabled={isAiLoading}
                title={t.attachTitle}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 cursor-pointer transition disabled:opacity-40"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={handleToggleVoiceInput}
                disabled={isAiLoading}
                title={isListening ? t.stopDictation : t.dictateMessage}
                className={`p-2 rounded-lg cursor-pointer transition disabled:opacity-40 ${
                  isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
              <input
                type="text"
                placeholder={isListening ? t.speakNow : t.aiPlaceholder}
                value={aiMessage}
                onChange={e => setAiMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendAiMessage()}
                className="flex-1 p-2 bg-gray-950 rounded border border-gray-800 text-xs text-white text-sans text-left min-w-0"
              />
              <button
                onClick={handleSendAiMessage}
                disabled={isAiLoading || (!aiMessage.trim() && !aiImageAttachment)}
                className="p-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-white font-bold cursor-pointer transition disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* ADMIN MORE MENU — mobile 4+1 */}
      {activeEmployee && activeEmployee.role === 'admin' && showMoreMenu && (
        <>
          <button
            type="button"
            aria-label={currentLanguage === 'FR' ? 'Fermer le menu Plus' : 'Close More menu'}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 cursor-default"
            onClick={() => setShowMoreMenu(false)}
          />
          <section
            id="admin-more-menu"
            className="fixed bottom-16 left-0 right-0 z-40 bg-[#16191F] border-t border-gray-800 rounded-t-3xl p-4 pb-6 shadow-2xl"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            role="dialog"
            aria-modal="true"
            aria-label={currentLanguage === 'FR' ? 'Navigation supplémentaire' : 'More navigation'}
          >
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              {[
                { tab: 'invoice' as const, icon: '🧾', label: t.navAdminInvoices },
                { tab: 'inventory' as const, icon: '📦', label: t.navShortInventory },
                { tab: 'commandes' as const, icon: '🚚', label: t.navShortOrders },
                { tab: 'motivation' as const, icon: '🎯', label: t.navShortGoals }
              ].map(item => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => { setActiveTab(item.tab); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${
                    activeTab === item.tab
                      ? 'bg-orange-600/20 border-orange-600 text-orange-400'
                      : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className="text-3xl" aria-hidden="true">{item.icon}</span>
                  <span className="text-[10px] uppercase font-black text-center leading-tight">{item.label}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => { setActiveTab('settings'); setActiveSettingsTab(0); setShowMoreMenu(false); }}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${
                  activeTab === 'settings'
                    ? 'bg-orange-600/20 border-orange-600 text-orange-400'
                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="text-3xl" aria-hidden="true">⚙️</span>
                <span className="text-[10px] uppercase font-black text-center leading-tight">{t.navShortSettings}</span>
                {hrAlerts.filter(a => !a.resolved).length > 0 && (
                  <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </button>
            </div>
          </section>
        </>
      )}

      {/* -------------------- ADMIN / EMPLOYEE FIXED BOTTOM NAV BAR -------------------- */}
      {activeEmployee && (
        <nav 
          id="fixed-bottom-navigation-main"
          className="fixed bottom-0 left-0 right-0 h-16 bg-[#16191F] border-t border-gray-800 flex items-center justify-between px-4 z-40 shadow-2xl"
        >
          <div className="flex-1 flex justify-around items-center max-w-4xl mx-auto">
            {activeEmployee.role === 'admin' ? (
              /* Administrative Buttons - mobile 4+1 navigation */
              <>
                <button
                  onClick={() => { setActiveTab('home'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'home' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">🏠</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminHome}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('documents'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'documents' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">📄</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminDocs}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('projects'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'projects' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">📋</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminProjects}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('stats'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'stats' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">📊</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navShortStats}</span>
                </button>

                <button
                  onClick={() => setShowMoreMenu(value => !value)}
                  className={`relative flex flex-col items-center gap-1 cursor-pointer transition ${
                    showMoreMenu || ['invoice', 'inventory', 'commandes', 'motivation', 'settings'].includes(activeTab)
                      ? 'text-orange-500 font-bold scale-105'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  aria-expanded={showMoreMenu}
                  aria-controls="admin-more-menu"
                >
                  <span className="text-2xl">☰</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">
                    {currentLanguage === 'FR' ? 'Plus' : 'More'}
                  </span>
                  {hrAlerts.filter(a => !a.resolved).length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                  )}
                </button>
              </>
            ) : (
              /* Employee Buttons - 5 items mapped physically */
              <>
                <button
                  onClick={() => setActiveTab('home')}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'home' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">🔨</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navEmpHome}</span>
                </button>

                <button
                  onClick={() => setActiveTab('invoice')}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'invoice' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">🧾</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navEmpInvoices}</span>
                </button>

                {/* La secrétaire a des droits de gestion sur l'inventaire et les commandes :
                    elle doit donc pouvoir naviguer vers ces vues, sinon ces droits sont inaccessibles. */}
                {activeEmployee.role === 'secretary' && (
                  <>
                    <button
                      onClick={() => setActiveTab('inventory')}
                      className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                        activeTab === 'inventory' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <span className="text-2xl">📦</span>
                      <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminInventory}</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('commandes')}
                      className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                        activeTab === 'commandes' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <span className="text-2xl">🚚</span>
                      <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminOrders}</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => { setActiveTab('stats'); setStatsSubTab('analytics'); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'stats' && statsSubTab === 'analytics' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">🏆</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navEmpStats}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('stats'); setStatsSubTab('payroll'); }} // ouvre directement le décompte de paie, pas le sous-onglet rendement/XP
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'stats' && statsSubTab === 'payroll' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">💵</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navEmpPaye}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('settings'); setActiveSettingsTab(2); }} // switches directly to Themes/language presets
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'settings' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">⚙️</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navEmpSettings}</span>
                </button>
              </>
            )}
          </div>
        </nav>
      )}


      {/* -------------------- MODAL : PUNCH IN START -------------------- */}
      {showPunchInModal && activeEmployee && (
        <div id="punchin-modal-container" className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#16191F] border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-850 pb-3">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1">
                🔨 {t.modalPunchInTitle}
              </h4>
              <button 
                onClick={() => setShowPunchInModal(false)}
                className="text-gray-500 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Proximity / Geofencing Warning */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-xs leading-relaxed flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p>
                  {t.geofenceWarning}
                </p>
              </div>

              {/* Select Project */}
              <div>
                <label className="text-[10px] text-gray-500 font-mono uppercase">{t.modalSelectProject}</label>
                <select
                  value={homePunchProject}
                  onChange={e => setHomePunchProject(e.target.value)}
                  className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-xs text-white"
                >
                  <option value="">{t.selectSiteOption}</option>
                  {(activeEmployee.role === 'admin' ? projects : projects.filter(p => p.assignedEmployees.includes(activeEmployee.id))).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Select Tarification Mode */}
              <div>
                <label className="text-[10px] text-gray-500 font-mono uppercase">{t.modalPayMode}</label>
                <div className="grid grid-cols-3 gap-2 mt-1.5 text-[10px] uppercase font-bold text-center">
                  {[
                    { mode: 'horaire', label: t.payModeHourly },
                    { mode: 'surface', label: t.payModeSurface },
                    { mode: 'forfait', label: t.payModeFixed }
                  ].map(option => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setHomePayMode(option.mode as any)}
                      className={`p-2 py-2.5 rounded border cursor-pointer transition ${
                        homePayMode === option.mode 
                          ? 'bg-orange-600 border-orange-500 text-white font-black' 
                          : 'bg-gray-850 border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom rate value */}
              <div>
                <label className="text-[10px] text-gray-500 font-mono uppercase">{t.modalConfirmRate}</label>
                <input 
                  type="number"
                  value={homeRateCustom}
                  onChange={e => setHomeRateCustom(Number(e.target.value))}
                  className="w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-xs font-mono font-semibold text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-gray-850">
              <button 
                onClick={() => setShowPunchInModal(false)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-750 text-white border border-gray-750 text-xs font-black rounded-lg transition cursor-pointer"
              >
                {t.modalCancelBtn}
              </button>
              <button 
                onClick={handlePunchInStart}
                disabled={!homePunchProject}
                className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition cursor-pointer disabled:opacity-40"
              >
                {t.modalConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* -------------------- MODAL : PUNCH OUT CONFIRMATION (WITH MATERIALS INPUT FOR PIECE/SURFACE) -------------------- */}
      {showPunchOutModal && activeEmployee && activePunchSession && (
        <div id="punchout-modal-container" className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#16191F] border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-850 pb-3">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1">
                ⏹️ {t.modalPunchOutTitle}
              </h4>
              <button 
                onClick={() => setShowPunchOutModal(false)}
                className="text-gray-500 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-300 leading-normal">
                {t.modalPunchOutCongrats} {t.verifyTotalsAt} <strong>{activePunchSession.projectName}</strong>.
              </p>

              <div className="p-3 bg-gray-900 rounded-lg space-y-1 text-xs border border-gray-850">
                <div className="flex justify-between text-gray-400">
                  <span>{t.activeSiteLabel}</span>
                  <span className="font-bold text-white">{activePunchSession.projectName}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>{t.startTimeLabel}</span>
                  <span className="font-mono">{new Date(activePunchSession.startTime).toLocaleTimeString(dateLocale)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>{t.cumulatedDuration}</span>
                  <span className="font-bold text-orange-500 font-mono">{timerDisplay}</span>
                </div>
              </div>

              {/* Mode Surface SPECIFIC materials reports input */}
              {activePunchSession.payMode === 'surface' && (
                <div className="space-y-3 border-t border-gray-850 pt-3">
                  <label className="text-[10px] text-orange-500 font-mono uppercase tracking-wide font-bold">
                    {t.modalWorkSurfaceMaterials}
                  </label>

                  <div className="space-y-2">
                    {/* Catalog Material choices quick click */}
                    <div className="grid grid-cols-2 gap-2">
                      {catalogue.slice(0, 4).map(catItem => {
                        const unitLabel = unitLabels[catItem.unit || 'pi2'];
                        return (
                          <button
                            key={catItem.id}
                            type="button"
                            onClick={() => handleAddMaterialToReport(catItem.name, 10, catItem.pricePerSqFt, catItem.emoji, unitLabel)}
                            className="p-1 px-2.5 bg-gray-800 hover:bg-gray-750 text-white rounded text-[10px] text-left transition truncate cursor-pointer flex items-center gap-1.5"
                          >
                            <span className="text-sm">{catItem.emoji}</span>
                            <span>+10 {unitLabel} {catItem.name} ({catItem.pricePerSqFt}$/{unitLabel})</span>
                          </button>
                        );
                      })}
                    </div>

                      {/* Reported list items */}
                      <div className="bg-gray-950 p-2.5 rounded-lg text-xs space-y-1 border border-gray-850">
                        {reportedMaterials.length === 0 ? (
                          <p className="text-gray-500 text-center py-2 italic font-sans animate-none">{t.noMaterialsDeclared}</p>
                        ) : (
                          reportedMaterials.map((m, idx) => (
                            <div key={idx} className="flex justify-between items-center text-gray-300 font-mono">
                              <span className="font-sans">{m.emoji} {m.name} ({m.quantity} {m.unit || unitLabels['pi2']})</span>
                              <span className="font-bold">{(m.quantity * m.unitPrice).toFixed(2)}$</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Total simulated earnings displaying large */}
              <div className="p-3 bg-green-950/20 border border-green-500/20 rounded-xl text-center font-sans animate-none mt-3">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">{t.modalRevenueEarned}</span>
                <span className="text-2xl font-black text-green-400 font-mono">
                  {activePunchSession.payMode === 'surface'
                    ? reportedMaterials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0).toFixed(2)
                    : earningsSimulation}$
                </span>
              </div>

              <div className="flex gap-3 pt-3 border-t border-gray-850 font-sans">
              <button 
                onClick={() => setShowPunchOutModal(false)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-750 text-white border border-gray-750 text-xs font-black rounded-lg transition cursor-pointer"
              >
                {t.modalCancelBtn}
              </button>
              <button 
                onClick={handlePunchOutConfirm}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-lg transition cursor-pointer shadow-lg shadow-red-950/25"
              >
                {t.modalPunchOutBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: SIGNATURE TACTILE AVANT ENVOI DE FACTURE -------------------- */}
      {invoiceToSign && activeEmployee && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#16191F] border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-850 pb-3">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1">
                {t.signSendTitle.replace('✍️ ', '✍️ ')}
              </h4>
              <button
                onClick={() => { setInvoiceToSign(null); setInvoiceSignatureData(null); }}
                className="text-gray-500 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-300 leading-normal">
                {fmt(t.signSendBody, { num: invoiceToSign.invoiceNumber, amt: invoiceToSign.totalWithTaxes.toFixed(2), company: companyInfo.name || 'Hailite Xteriors Inc.' })}
              </p>

              <SignaturePad
                label={fmt(t.signatureOf, { name: activeEmployee.name })}
                value={invoiceSignatureData}
                onChange={setInvoiceSignatureData}
                required
                accentClass="text-orange-500"
              />
            </div>

            <div className="flex gap-3 pt-3 border-t border-gray-850 font-sans">
              <button
                onClick={() => { setInvoiceToSign(null); setInvoiceSignatureData(null); }}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-750 text-white border border-gray-750 text-xs font-black rounded-lg transition cursor-pointer"
              >
                {t.modalCancelBtn}
              </button>
              <button
                onClick={() => {
                  if (!invoiceSignatureData) {
                    alert(t.signBeforeSend);
                    return;
                  }
                  updateInvoice({
                    ...invoiceToSign,
                    status: 'pending',
                    employeeSignature: invoiceSignatureData,
                    employeeSignedAt: new Date().toISOString()
                  });
                  setInvoiceToSign(null);
                  setInvoiceSignatureData(null);
                }}
                className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-lg transition cursor-pointer shadow-lg shadow-orange-950/25"
              >
                {t.signAndSendBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- INTERACTIVE VALIDATION TOUR OVERLAY -------------------- */}
      {tourStep !== null && TOUR_STEPS[tourStep] && (
        <div id="interactive-val-tour" className="fixed bottom-6 right-6 left-6 md:left-auto md:w-[440px] bg-[#16191F]/95 backdrop-blur-md border border-orange-500/30 rounded-2xl p-5 shadow-2xl z-[9999] text-left space-y-4 animate-fade-in font-sans">
          <div className="flex justify-between items-start gap-4">
            <span className="p-1 px-2.5 bg-orange-600/15 border border-orange-500/20 text-orange-400 font-bold uppercase font-mono text-[9px] rounded-lg tracking-wider">
              {TOUR_STEPS[tourStep].badgeText} ({t.tourStepWord} {tourStep + 1} / {TOUR_STEPS.length})
            </span>
            <button 
              onClick={() => setTourStep(null)}
              className="text-gray-400 hover:text-white transition cursor-pointer font-bold text-xs"
            >
              {t.skipBtn}
            </button>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-sm font-black text-white flex items-center gap-1.5">
              <span className="text-orange-400">⚡</span> {TOUR_STEPS[tourStep].title}
            </h4>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              {TOUR_STEPS[tourStep].description}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-850">
            <button
              disabled={tourStep === 0}
              onClick={() => {
                const prev = tourStep - 1;
                setTourStep(prev);
                const step = TOUR_STEPS[prev];
                if (step && step.targetTab) {
                  setActiveTab(step.targetTab as any);
                }
              }}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-750 text-gray-300 text-[10px] font-bold rounded-lg transition disabled:opacity-30 cursor-pointer"
            >
              {t.prevStepBtn}
            </button>

            <div className="flex gap-1.5">
              {tourStep < TOUR_STEPS.length - 1 ? (
                <button
                  onClick={() => {
                    const next = tourStep + 1;
                    setTourStep(next);
                    const step = TOUR_STEPS[next];
                    if (step && step.targetTab) {
                      setActiveTab(step.targetTab as any);
                    }
                  }}
                  className="px-3 py-1 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-[10px] font-black rounded-lg transition shadow cursor-pointer text-center"
                >
                  {t.nextStepBtn}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTourStep(null);
                    alert(t.tourCongrats);
                  }}
                  className="px-4 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-black rounded-lg transition cursor-pointer"
                >
                  {t.finishTourBtn}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
