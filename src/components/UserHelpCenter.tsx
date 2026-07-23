import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, Check, CheckCircle2, ChevronRight, Circle,
  FileText, FolderKanban, HardDrive, HelpCircle, Home, Package,
  RotateCcw, Search, ShieldCheck, Sparkles, Users, WalletCards, X
} from 'lucide-react';
import type { EmployeeRole } from '../types';

export type HelpNavigationTab =
  | 'home'
  | 'invoice'
  | 'projects'
  | 'documents'
  | 'inventory'
  | 'commandes'
  | 'stats'
  | 'settings'
  | 'motivation';

type HelpCategory =
  | 'start'
  | 'daily'
  | 'projects'
  | 'documents'
  | 'inventory'
  | 'team'
  | 'storage'
  | 'security'
  | 'troubleshooting';

interface LocalizedText {
  fr: string;
  en: string;
}

interface HelpArticle {
  id: string;
  category: HelpCategory;
  title: LocalizedText;
  summary: LocalizedText;
  steps: Array<{ title: LocalizedText; detail: LocalizedText }>;
  tips?: LocalizedText[];
  warning?: LocalizedText;
  roles: Array<EmployeeRole | 'all'>;
  tab?: HelpNavigationTab;
  settingsTab?: number;
  keywords: string[];
}

interface UserHelpCenterProps {
  open: boolean;
  onClose: () => void;
  language: 'FR' | 'EN';
  role: EmployeeRole;
  employeeId: string;
  employeeName: string;
  activeTab: HelpNavigationTab;
  onNavigate: (tab: HelpNavigationTab, settingsTab?: number) => void;
}

const CATEGORIES: Array<{
  id: HelpCategory;
  icon: React.ComponentType<{ className?: string }>;
  label: LocalizedText;
}> = [
  { id: 'start', icon: Sparkles, label: { fr: 'Bien démarrer', en: 'Getting started' } },
  { id: 'daily', icon: Home, label: { fr: 'Travail quotidien', en: 'Daily work' } },
  { id: 'projects', icon: FolderKanban, label: { fr: 'Clients et chantiers', en: 'Clients and projects' } },
  { id: 'documents', icon: FileText, label: { fr: 'Devis, contrats, factures', en: 'Quotes, contracts, invoices' } },
  { id: 'inventory', icon: Package, label: { fr: 'Inventaire, catalogue, outils', en: 'Inventory, catalogue, tools' } },
  { id: 'team', icon: Users, label: { fr: 'Équipe et paie', en: 'Team and payroll' } },
  { id: 'storage', icon: HardDrive, label: { fr: 'Sauvegarde et importation', en: 'Backup and import' } },
  { id: 'security', icon: ShieldCheck, label: { fr: 'Sécurité et confidentialité', en: 'Security and privacy' } },
  { id: 'troubleshooting', icon: HelpCircle, label: { fr: 'Dépannage', en: 'Troubleshooting' } }
];

const ARTICLES: HelpArticle[] = [
  {
    id: 'first-login',
    category: 'start',
    title: { fr: 'Première connexion et navigation', en: 'First sign-in and navigation' },
    summary: {
      fr: 'Comprendre le profil, le NIP, les onglets principaux et les droits liés au rôle.',
      en: 'Understand profiles, PINs, main tabs, and role-based access.'
    },
    roles: ['all'],
    tab: 'home',
    keywords: ['connexion', 'login', 'nip', 'pin', 'navigation', 'profil', 'role'],
    steps: [
      {
        title: { fr: 'Choisissez votre profil', en: 'Choose your profile' },
        detail: { fr: 'Touchez votre nom ou votre photo sur l’écran de connexion.', en: 'Tap your name or photo on the sign-in screen.' }
      },
      {
        title: { fr: 'Entrez votre NIP personnel', en: 'Enter your personal PIN' },
        detail: { fr: 'Le NIP identifie la personne qui effectue les actions. Ne l’échangez pas avec un collègue.', en: 'The PIN identifies who performs each action. Do not share it with a coworker.' }
      },
      {
        title: { fr: 'Utilisez la barre du bas', en: 'Use the bottom navigation' },
        detail: { fr: 'Accueil, Documents, Projets, Statistiques et Plus regroupent les fonctions principales. Les options affichées dépendent de votre rôle.', en: 'Home, Documents, Projects, Statistics, and More contain the main functions. Visible options depend on your role.' }
      },
      {
        title: { fr: 'Déconnectez-vous après usage', en: 'Sign out after use' },
        detail: { fr: 'Sur un appareil partagé, utilisez toujours Déconnexion avant de remettre l’appareil à une autre personne.', en: 'On a shared device, always sign out before handing it to someone else.' }
      }
    ],
    tips: [
      { fr: 'Le bouton Aide demeure accessible dans le haut de l’application.', en: 'The Help button remains available at the top of the app.' }
    ]
  },
  {
    id: 'admin-setup',
    category: 'start',
    title: { fr: 'Configuration initiale de la compagnie', en: 'Initial company setup' },
    summary: {
      fr: 'Les vérifications essentielles avant de commencer à travailler avec de vraies données.',
      en: 'Essential checks before working with real company data.'
    },
    roles: ['admin'],
    tab: 'settings',
    settingsTab: 0,
    keywords: ['compagnie', 'company', 'logo', 'taxes', 'parametres', 'configuration'],
    steps: [
      {
        title: { fr: 'Vérifiez la fiche de compagnie', en: 'Review the company profile' },
        detail: { fr: 'Confirmez le nom légal, l’adresse, le téléphone, le courriel, les numéros de taxes, la région et le logo.', en: 'Confirm the legal name, address, phone, email, tax numbers, region, and logo.' }
      },
      {
        title: { fr: 'Choisissez le stockage', en: 'Choose data storage' },
        detail: { fr: 'Validez si les données sont conservées sur l’appareil, dans Supabase ou dans un fichier de cloud personnel.', en: 'Confirm whether data is stored on the device, in Supabase, or in a personal-cloud file.' }
      },
      {
        title: { fr: 'Créez les utilisateurs', en: 'Create users' },
        detail: { fr: 'Ajoutez les administrateurs, secrétaires, comptables et employés avec un NIP distinct et le bon rôle.', en: 'Add administrators, secretaries, accountants, and employees with a unique PIN and correct role.' }
      },
      {
        title: { fr: 'Configurez la paie et les cycles', en: 'Configure payroll and cycles' },
        detail: { fr: 'Vérifiez les taux, fréquences de paie, modes de rémunération et règles propres à votre région.', en: 'Review rates, pay frequencies, compensation modes, and regional rules.' }
      }
    ],
    warning: {
      fr: 'Avant la mise en service, effectuez une sauvegarde et créez un petit dossier d’essai pour confirmer le fonctionnement.',
      en: 'Before going live, create a backup and a small test file to confirm the workflow.'
    }
  },
  {
    id: 'employee-day',
    category: 'daily',
    title: { fr: 'Journée de travail : pointage complet', en: 'Workday: complete time tracking' },
    summary: {
      fr: 'La bonne séquence pour commencer, mettre en pause et terminer une journée.',
      en: 'The correct sequence to start, pause, and complete a workday.'
    },
    roles: ['employee', 'admin', 'secretary'],
    tab: 'home',
    keywords: ['pointage', 'punch', 'pause', 'chantier', 'heure', 'gps', 'surface', 'forfait'],
    steps: [
      {
        title: { fr: 'Choisissez le chantier', en: 'Choose the project' },
        detail: { fr: 'Confirmez le bon client, l’adresse et le chantier avant de commencer.', en: 'Confirm the correct client, address, and project before starting.' }
      },
      {
        title: { fr: 'Choisissez le mode de rémunération', en: 'Choose the pay mode' },
        detail: { fr: 'Horaire, surface ou forfait doivent correspondre à l’entente du chantier.', en: 'Hourly, surface, or flat-rate must match the project agreement.' }
      },
      {
        title: { fr: 'Appuyez sur Débuter', en: 'Tap Start' },
        detail: { fr: 'L’application enregistre l’heure, le chantier et, lorsque permis, la position GPS.', en: 'The app records time, project, and—when allowed—GPS position.' }
      },
      {
        title: { fr: 'Utilisez Pause', en: 'Use Pause' },
        detail: { fr: 'Mettez le pointage en pause pour les périodes non travaillées. Reprenez-le dès le retour au travail.', en: 'Pause for non-working periods and resume immediately when work restarts.' }
      },
      {
        title: { fr: 'Terminez la journée', en: 'Complete the day' },
        detail: { fr: 'Au Punch Out, vérifiez les heures et déclarez les quantités ou matériaux demandés avant de confirmer.', en: 'At Punch Out, review hours and report required quantities or materials before confirming.' }
      }
    ],
    warning: {
      fr: 'Ne pointez jamais au nom d’une autre personne. Signalez une erreur à l’administration plutôt que de créer un second pointage.',
      en: 'Never clock in for another person. Report an error to administration instead of creating a second entry.'
    }
  },
  {
    id: 'client-project-workflow',
    category: 'projects',
    title: { fr: 'Créer un client et son chantier', en: 'Create a client and project' },
    summary: {
      fr: 'Créer les dossiers dans le bon ordre afin que les documents, pointages et dépenses soient reliés.',
      en: 'Create records in the correct order so documents, time entries, and expenses stay linked.'
    },
    roles: ['admin', 'secretary'],
    tab: 'projects',
    keywords: ['client', 'chantier', 'project', 'adresse', 'gps', 'taches', 'assignation'],
    steps: [
      {
        title: { fr: 'Ajoutez d’abord le client', en: 'Add the client first' },
        detail: { fr: 'Inscrivez son nom, sa compagnie, son téléphone, son courriel et son adresse de facturation.', en: 'Enter the client name, company, phone, email, and billing address.' }
      },
      {
        title: { fr: 'Créez le chantier', en: 'Create the project' },
        detail: { fr: 'Associez le client, indiquez l’adresse réelle du chantier et donnez un nom facile à rechercher.', en: 'Link the client, enter the real job address, and use an easy-to-search project name.' }
      },
      {
        title: { fr: 'Vérifiez le GPS', en: 'Verify GPS' },
        detail: { fr: 'Capturez la position sur place ou vérifiez les coordonnées et le rayon dans Google Maps.', en: 'Capture the on-site position or verify coordinates and radius using Google Maps.' }
      },
      {
        title: { fr: 'Assignez les travailleurs', en: 'Assign workers' },
        detail: { fr: 'Ajoutez seulement les personnes qui doivent voir ou exécuter ce chantier.', en: 'Add only the people who should see or work on the project.' }
      },
      {
        title: { fr: 'Ajoutez tâches et outils requis', en: 'Add required tasks and tools' },
        detail: { fr: 'Utilisez la fiche du chantier comme référence opérationnelle pour l’équipe.', en: 'Use the project record as the team’s operational reference.' }
      }
    ]
  },
  {
    id: 'document-workflow',
    category: 'documents',
    title: { fr: 'Parcours professionnel : Devis → Contrat → Facture', en: 'Professional workflow: Quote → Contract → Invoice' },
    summary: {
      fr: 'Créer chaque document au bon moment et conserver les références et signatures.',
      en: 'Create each document at the correct stage while preserving references and signatures.'
    },
    roles: ['admin', 'secretary', 'accountant'],
    tab: 'documents',
    keywords: ['devis', 'soumission', 'contrat', 'facture', 'signature', 'document', 'quote', 'invoice'],
    steps: [
      {
        title: { fr: 'Créez le devis', en: 'Create the quote' },
        detail: { fr: 'Choisissez le client, décrivez les travaux, ajoutez matériaux, main-d’œuvre, taxes, rabais, dépôt et durée de validité.', en: 'Choose the client and add scope, materials, labour, taxes, discounts, deposit, and validity period.' }
      },
      {
        title: { fr: 'Relisez avant l’envoi', en: 'Review before sending' },
        detail: { fr: 'Vérifiez les prix, quantités, coordonnées, exclusions et conditions. L’aperçu doit être exact avant la signature.', en: 'Check prices, quantities, contact details, exclusions, and terms. The preview must be correct before signature.' }
      },
      {
        title: { fr: 'Marquez le devis accepté', en: 'Mark the quote accepted' },
        detail: { fr: 'Après l’accord réel du client, utilisez Créer contrat. Le contrat reprend les travaux et ajoute les clauses et signatures propres au contrat.', en: 'After the client truly accepts, use Create contract. The contract carries over the scope and adds contract-specific clauses and signatures.' }
      },
      {
        title: { fr: 'Confirmez la fin des travaux', en: 'Confirm work completion' },
        detail: { fr: 'Lorsque le contrat est exécuté, marquez Travaux terminés, puis créez la facture à partir du contrat.', en: 'When the contract is fulfilled, mark Work completed, then create the invoice from the contract.' }
      },
      {
        title: { fr: 'Enregistrez les paiements', en: 'Record payments' },
        detail: { fr: 'Inscrivez les dépôts, paiements partiels et paiement final pour maintenir le solde exact.', en: 'Record deposits, partial payments, and final payment to keep the balance accurate.' }
      }
    ],
    warning: {
      fr: 'Ne transformez jamais un devis en contrat avant l’acceptation réelle du client. Vérifiez les exigences légales de votre région avant utilisation officielle.',
      en: 'Never convert a quote to a contract before genuine client acceptance. Review regional legal requirements before official use.'
    }
  },
  {
    id: 'catalogue-prices',
    category: 'inventory',
    title: { fr: 'Catalogue : matériaux et prix', en: 'Catalogue: materials and pricing' },
    summary: {
      fr: 'Maintenir les coûts et prix de vente à jour sans recréer les matériaux.',
      en: 'Keep costs and selling prices current without recreating materials.'
    },
    roles: ['admin', 'secretary'],
    tab: 'inventory',
    keywords: ['catalogue', 'materiau', 'prix', 'fournisseur', 'sous-traitant', 'client', 'marge'],
    steps: [
      {
        title: { fr: 'Créez le fournisseur', en: 'Create the supplier' },
        detail: { fr: 'Ajoutez le fournisseur avant le matériau pour pouvoir les associer.', en: 'Add the supplier before the material so they can be linked.' }
      },
      {
        title: { fr: 'Ajoutez le matériau', en: 'Add the material' },
        detail: { fr: 'Indiquez le nom, la photo, l’unité, le coût fournisseur, le prix sous-traitant et le prix client.', en: 'Enter name, photo, unit, supplier cost, subcontractor price, and client price.' }
      },
      {
        title: { fr: 'Contrôlez la marge', en: 'Review the margin' },
        detail: { fr: 'La marge affichée aide à repérer un prix client trop faible ou un coût devenu trop élevé.', en: 'The displayed margin helps identify a selling price that is too low or a cost that has increased.' }
      },
      {
        title: { fr: 'Modifiez les prix au besoin', en: 'Update prices as needed' },
        detail: { fr: 'Utilisez Modifier les prix sur le matériau existant. Les futurs documents utilisent les nouveaux prix; les anciens documents conservent leurs montants.', en: 'Use Edit prices on the existing material. Future documents use new prices; historical documents retain their amounts.' }
      }
    ],
    tips: [
      { fr: 'Révisez les prix fournisseur régulièrement et avant une soumission importante.', en: 'Review supplier prices regularly and before a major quote.' }
    ]
  },
  {
    id: 'inventory-stock',
    category: 'inventory',
    title: { fr: 'Stocks et commandes fournisseurs', en: 'Stock and supplier orders' },
    summary: {
      fr: 'Suivre les quantités réelles et éviter les ruptures de matériel.',
      en: 'Track actual quantities and avoid material shortages.'
    },
    roles: ['admin', 'secretary'],
    tab: 'inventory',
    keywords: ['stock', 'inventaire', 'commande', 'reception', 'minimum', 'fournisseur'],
    steps: [
      {
        title: { fr: 'Créez les articles de stock', en: 'Create stock items' },
        detail: { fr: 'Indiquez la quantité actuelle, l’unité et le seuil minimum.', en: 'Enter current quantity, unit, and minimum threshold.' }
      },
      {
        title: { fr: 'Créez une commande', en: 'Create an order' },
        detail: { fr: 'Sélectionnez le fournisseur, les articles, les quantités et les prix.', en: 'Select supplier, items, quantities, and prices.' }
      },
      {
        title: { fr: 'Confirmez seulement à la réception', en: 'Confirm only upon receipt' },
        detail: { fr: 'Marquez une commande reçue lorsque le matériel est réellement livré et vérifié.', en: 'Mark an order received only when materials are physically delivered and checked.' }
      },
      {
        title: { fr: 'Corrigez les écarts', en: 'Correct discrepancies' },
        detail: { fr: 'Ajustez les quantités après retour, perte, dommage ou inventaire physique.', en: 'Adjust quantities after returns, loss, damage, or a physical count.' }
      }
    ]
  },
  {
    id: 'tool-registry',
    category: 'inventory',
    title: { fr: 'Registre des outils et dossier de vol', en: 'Tool registry and theft report' },
    summary: {
      fr: 'Conserver les preuves nécessaires pour l’assurance et une déclaration policière.',
      en: 'Preserve evidence needed for insurance and police reporting.'
    },
    roles: ['admin', 'secretary'],
    tab: 'inventory',
    keywords: ['outil', 'vol', 'numero serie', 'modele', 'facture', 'photo', 'assurance', 'trailer'],
    steps: [
      {
        title: { fr: 'Photographiez l’outil', en: 'Photograph the tool' },
        detail: { fr: 'Prenez une photo générale permettant de reconnaître l’état et les caractéristiques de l’outil.', en: 'Take an overall photo showing the tool’s condition and identifying features.' }
      },
      {
        title: { fr: 'Photographiez la plaque', en: 'Photograph the identification plate' },
        detail: { fr: 'Le modèle et le numéro de série doivent être lisibles.', en: 'The model and serial number must be readable.' }
      },
      {
        title: { fr: 'Joignez la facture', en: 'Attach the receipt' },
        detail: { fr: 'Ajoutez une photo ou un PDF de la facture et inscrivez la valeur de remplacement actuelle.', en: 'Attach a receipt photo or PDF and enter the current replacement value.' }
      },
      {
        title: { fr: 'Tenez l’emplacement à jour', en: 'Keep the location current' },
        detail: { fr: 'Indiquez le camion, trailer, entrepôt, chantier ou employé responsable.', en: 'Record the truck, trailer, warehouse, project, or responsible employee.' }
      },
      {
        title: { fr: 'Créez un dossier de vol', en: 'Create a theft report' },
        detail: { fr: 'Sélectionnez tous les outils disparus, inscrivez les circonstances, le dossier policier et la réclamation, puis imprimez ou enregistrez le PDF.', en: 'Select all missing tools, enter circumstances, police file and claim numbers, then print or save the PDF.' }
      }
    ],
    warning: {
      fr: 'Le rapport prépare les renseignements, mais il ne transmet pas automatiquement une plainte à la police ni une réclamation à l’assureur.',
      en: 'The report prepares the information but does not automatically submit a police report or insurance claim.'
    }
  },
  {
    id: 'employees-payroll',
    category: 'team',
    title: { fr: 'Employés, rôles, compétences et paie', en: 'Employees, roles, credentials, and payroll' },
    summary: {
      fr: 'Configurer correctement chaque personne et contrôler les heures avant le paiement.',
      en: 'Configure each person correctly and review hours before payment.'
    },
    roles: ['admin', 'accountant'],
    tab: 'settings',
    settingsTab: 1,
    keywords: ['employe', 'role', 'nip', 'paie', 'taux', 'competence', 'certificat', 'payroll'],
    steps: [
      {
        title: { fr: 'Attribuez le bon rôle', en: 'Assign the correct role' },
        detail: { fr: 'Admin, secrétaire, comptable et employé n’ont pas les mêmes accès. Accordez seulement les permissions nécessaires.', en: 'Admin, secretary, accountant, and employee have different access. Grant only what is required.' }
      },
      {
        title: { fr: 'Vérifiez le taux et le mode', en: 'Verify rate and mode' },
        detail: { fr: 'Confirmez le taux horaire, surface ou forfait ainsi que la fréquence de paie.', en: 'Confirm hourly, surface, or flat-rate compensation and pay frequency.' }
      },
      {
        title: { fr: 'Ajoutez les cartes de compétence', en: 'Add credentials' },
        detail: { fr: 'Photographiez les cartes, inscrivez leurs dates et configurez les rappels d’expiration.', en: 'Photograph credentials, enter dates, and configure expiry reminders.' }
      },
      {
        title: { fr: 'Révisez les pointages', en: 'Review time entries' },
        detail: { fr: 'Corrigez ou refusez les anomalies avant de marquer la période approuvée ou payée.', en: 'Correct or reject anomalies before marking a period approved or paid.' }
      }
    ],
    warning: {
      fr: 'Les calculs de paie et retenues doivent être vérifiés par une personne qualifiée selon les lois de votre région.',
      en: 'Payroll and deduction calculations must be verified by a qualified person under regional laws.'
    }
  },
  {
    id: 'reports-statistics',
    category: 'team',
    title: { fr: 'Statistiques et contrôle administratif', en: 'Statistics and administrative review' },
    summary: {
      fr: 'Lire les heures, revenus, coûts, marges et alertes sans confondre estimation et comptabilité officielle.',
      en: 'Read hours, revenue, costs, margins, and alerts without confusing estimates with official accounting.'
    },
    roles: ['admin', 'accountant', 'secretary'],
    tab: 'stats',
    keywords: ['statistique', 'rapport', 'marge', 'revenu', 'heure', 'alerte', 'comptabilite'],
    steps: [
      {
        title: { fr: 'Choisissez la bonne période', en: 'Choose the correct period' },
        detail: { fr: 'Vérifiez le mois, le cycle de paie ou la période fiscale affichée.', en: 'Verify the displayed month, pay cycle, or fiscal period.' }
      },
      {
        title: { fr: 'Contrôlez les données sources', en: 'Review source data' },
        detail: { fr: 'Une statistique erronée vient souvent d’un pointage incomplet, d’une facture mal classée ou d’une dépense non associée.', en: 'Incorrect statistics often result from incomplete time entries, misclassified invoices, or unlinked expenses.' }
      },
      {
        title: { fr: 'Utilisez les marges comme indicateur', en: 'Use margins as an indicator' },
        detail: { fr: 'Les marges aident à gérer les chantiers, mais ne remplacent pas les états financiers produits par un comptable.', en: 'Margins help manage projects but do not replace financial statements prepared by an accountant.' }
      }
    ]
  },
  {
    id: 'storage-choice',
    category: 'storage',
    title: { fr: 'Choisir et comprendre le stockage', en: 'Choose and understand storage' },
    summary: {
      fr: 'Différences entre appareil local, Supabase et cloud personnel.',
      en: 'Differences between local device, Supabase, and personal cloud.'
    },
    roles: ['admin'],
    tab: 'settings',
    settingsTab: 0,
    keywords: ['stockage', 'local', 'supabase', 'google drive', 'icloud', 'onedrive', 'backup', 'cloud'],
    steps: [
      {
        title: { fr: 'Appareil local', en: 'Local device' },
        detail: { fr: 'Les données restent dans le navigateur de cet appareil. Un fichier de sauvegarde externe est indispensable.', en: 'Data remains in this device’s browser. An external backup file is essential.' }
      },
      {
        title: { fr: 'Supabase', en: 'Supabase' },
        detail: { fr: 'Les utilisateurs autorisés peuvent synchroniser les données entre appareils au moyen du compte de la compagnie.', en: 'Authorized users can synchronize company data across devices.' }
      },
      {
        title: { fr: 'Cloud personnel', en: 'Personal cloud' },
        detail: { fr: 'L’application crée un fichier JSON dans le dossier ou service autorisé. Certains téléphones demandent une confirmation manuelle à chaque sauvegarde.', en: 'The app creates a JSON file in the authorized folder or service. Some phones require manual confirmation for each backup.' }
      },
      {
        title: { fr: 'Testez la restauration', en: 'Test restoration' },
        detail: { fr: 'Une sauvegarde n’est fiable que si vous avez confirmé qu’elle peut être relue et restaurée.', en: 'A backup is reliable only after confirming it can be read and restored.' }
      }
    ]
  },
  {
    id: 'legacy-import',
    category: 'storage',
    title: { fr: 'Importer les données d’une ancienne application', en: 'Import data from a previous application' },
    summary: {
      fr: 'Migrer une année fiscale déjà commencée à partir d’un fichier CSV ou JSON.',
      en: 'Migrate an already-started fiscal year from CSV or JSON.'
    },
    roles: ['admin', 'accountant'],
    tab: 'settings',
    settingsTab: 0,
    keywords: ['import', 'migration', 'csv', 'json', 'ancienne application', 'fiscal'],
    steps: [
      {
        title: { fr: 'Exportez depuis l’ancien logiciel', en: 'Export from the old software' },
        detail: { fr: 'Créez des fichiers CSV ou JSON séparés si possible : clients, chantiers, factures, dépenses, employés et heures.', en: 'Create separate CSV or JSON files when possible: clients, projects, invoices, expenses, employees, and hours.' }
      },
      {
        title: { fr: 'Importez une catégorie à la fois', en: 'Import one category at a time' },
        detail: { fr: 'Commencez par les clients et employés, puis les chantiers et enfin les transactions qui y font référence.', en: 'Start with clients and employees, then projects, and finally transactions that reference them.' }
      },
      {
        title: { fr: 'Vérifiez l’association des colonnes', en: 'Review column mapping' },
        detail: { fr: 'Confirmez chaque colonne obligatoire avant de lancer l’importation.', en: 'Confirm every required column before starting the import.' }
      },
      {
        title: { fr: 'Contrôlez les totaux', en: 'Reconcile totals' },
        detail: { fr: 'Comparez le nombre de clients, factures, dépenses et les totaux de l’année avec l’ancien logiciel.', en: 'Compare client, invoice, expense counts and annual totals with the old software.' }
      }
    ],
    warning: {
      fr: 'Les photos, signatures et pièces jointes absentes du fichier exporté ne peuvent pas être recréées automatiquement.',
      en: 'Photos, signatures, and attachments missing from the export file cannot be recreated automatically.'
    }
  },
  {
    id: 'privacy-access',
    category: 'security',
    title: { fr: 'Accès, confidentialité et usage responsable', en: 'Access, privacy, and responsible use' },
    summary: {
      fr: 'Protéger les renseignements des employés, clients et projets.',
      en: 'Protect employee, client, and project information.'
    },
    roles: ['all'],
    tab: 'settings',
    settingsTab: 3,
    keywords: ['securite', 'confidentialite', 'nip', 'gps', 'permissions', 'donnees', 'privacy'],
    steps: [
      {
        title: { fr: 'Utilisez un profil personnel', en: 'Use your personal profile' },
        detail: { fr: 'Chaque action importante doit être attribuable à la bonne personne.', en: 'Every important action should be attributable to the correct person.' }
      },
      {
        title: { fr: 'Limitez les rôles privilégiés', en: 'Limit privileged roles' },
        detail: { fr: 'Réservez les rôles administrateur, secrétaire et comptable aux personnes qui en ont réellement besoin.', en: 'Reserve administrator, secretary, and accountant roles for people who genuinely need them.' }
      },
      {
        title: { fr: 'Protégez les appareils', en: 'Protect devices' },
        detail: { fr: 'Activez le verrouillage de l’écran, les mises à jour et la protection du compte cloud.', en: 'Enable screen lock, updates, and cloud-account protection.' }
      },
      {
        title: { fr: 'Expliquez l’utilisation du GPS', en: 'Explain GPS use' },
        detail: { fr: 'Les travailleurs doivent comprendre quand la position est utilisée et dans quel but.', en: 'Workers should understand when location is used and for what purpose.' }
      },
      {
        title: { fr: 'Supprimez avec prudence', en: 'Delete carefully' },
        detail: { fr: 'Avant de retirer un employé, client, chantier ou document, vérifiez les obligations de conservation et créez une sauvegarde.', en: 'Before removing an employee, client, project, or document, review retention duties and create a backup.' }
      }
    ]
  },
  {
    id: 'common-problems',
    category: 'troubleshooting',
    title: { fr: 'Problèmes courants et solutions', en: 'Common problems and solutions' },
    summary: {
      fr: 'Les premières vérifications à faire avant de demander une intervention technique.',
      en: 'First checks to perform before requesting technical assistance.'
    },
    roles: ['all'],
    keywords: ['probleme', 'erreur', 'ecran', 'sauvegarde', 'gps', 'synchronisation', 'cache'],
    steps: [
      {
        title: { fr: 'La nouvelle version n’apparaît pas', en: 'The new version does not appear' },
        detail: { fr: 'Fermez complètement l’application ou le navigateur, puis rouvrez-le. Si nécessaire, videz le cache du site ou réinstallez la PWA.', en: 'Fully close the app or browser and reopen it. If necessary, clear the site cache or reinstall the PWA.' }
      },
      {
        title: { fr: 'Le GPS ne fonctionne pas', en: 'GPS is not working' },
        detail: { fr: 'Vérifiez l’autorisation de localisation, activez le GPS de l’appareil et utilisez Rafraîchir position.', en: 'Check location permission, enable device GPS, and use Refresh position.' }
      },
      {
        title: { fr: 'Une sauvegarde ne se met pas à jour', en: 'A backup is not updating' },
        detail: { fr: 'Ouvrez le sélecteur de fichier depuis l’application et renouvelez l’autorisation. Sur certains téléphones, l’enregistrement doit être confirmé manuellement.', en: 'Open the file picker from the app and renew permission. Some phones require manual confirmation.' }
      },
      {
        title: { fr: 'Une donnée semble absente après synchronisation', en: 'Data appears missing after synchronization' },
        detail: { fr: 'Confirmez le bon profil et la bonne compagnie, vérifiez la connexion, puis rechargez l’application avant de recréer la donnée.', en: 'Confirm the correct profile and company, check connectivity, then reload before recreating the data.' }
      },
      {
        title: { fr: 'Un calcul paraît incorrect', en: 'A calculation looks incorrect' },
        detail: { fr: 'Vérifiez le taux, le mode de rémunération, les pauses, les quantités, les taxes et la période sélectionnée.', en: 'Check the rate, pay mode, pauses, quantities, taxes, and selected period.' }
      }
    ],
    tips: [
      { fr: 'Prenez une capture d’écran complète et notez le profil, l’onglet et l’action effectuée avant le problème.', en: 'Take a complete screenshot and note the profile, tab, and action performed before the issue.' }
    ]
  }
];

const STARTER_BY_ROLE: Record<EmployeeRole, Array<{ id: string; label: LocalizedText; articleId: string }>> = {
  admin: [
    { id: 'company', label: { fr: 'Vérifier la compagnie, les taxes et le logo', en: 'Review company, taxes, and logo' }, articleId: 'admin-setup' },
    { id: 'storage', label: { fr: 'Confirmer le stockage et tester une sauvegarde', en: 'Confirm storage and test a backup' }, articleId: 'storage-choice' },
    { id: 'users', label: { fr: 'Créer les utilisateurs et leurs rôles', en: 'Create users and roles' }, articleId: 'employees-payroll' },
    { id: 'project', label: { fr: 'Créer un client et un chantier d’essai', en: 'Create a test client and project' }, articleId: 'client-project-workflow' },
    { id: 'catalogue', label: { fr: 'Vérifier le catalogue et les marges', en: 'Review catalogue and margins' }, articleId: 'catalogue-prices' },
    { id: 'document', label: { fr: 'Tester Devis → Contrat → Facture', en: 'Test Quote → Contract → Invoice' }, articleId: 'document-workflow' },
    { id: 'backup', label: { fr: 'Créer la première sauvegarde officielle', en: 'Create the first official backup' }, articleId: 'storage-choice' }
  ],
  secretary: [
    { id: 'login', label: { fr: 'Comprendre le profil et la navigation', en: 'Understand profile and navigation' }, articleId: 'first-login' },
    { id: 'clients', label: { fr: 'Créer et rechercher clients et chantiers', en: 'Create and search clients and projects' }, articleId: 'client-project-workflow' },
    { id: 'docs', label: { fr: 'Maîtriser Devis → Contrat → Facture', en: 'Master Quote → Contract → Invoice' }, articleId: 'document-workflow' },
    { id: 'catalogue', label: { fr: 'Mettre à jour le catalogue et les prix', en: 'Update catalogue and pricing' }, articleId: 'catalogue-prices' },
    { id: 'orders', label: { fr: 'Créer et recevoir une commande', en: 'Create and receive an order' }, articleId: 'inventory-stock' }
  ],
  accountant: [
    { id: 'login', label: { fr: 'Comprendre les accès du comptable', en: 'Understand accountant access' }, articleId: 'first-login' },
    { id: 'docs', label: { fr: 'Réviser factures, paiements et soldes', en: 'Review invoices, payments, and balances' }, articleId: 'document-workflow' },
    { id: 'payroll', label: { fr: 'Réviser la paie et les périodes', en: 'Review payroll and periods' }, articleId: 'employees-payroll' },
    { id: 'reports', label: { fr: 'Contrôler statistiques et données sources', en: 'Review statistics and source data' }, articleId: 'reports-statistics' },
    { id: 'import', label: { fr: 'Valider les données importées', en: 'Validate imported data' }, articleId: 'legacy-import' }
  ],
  employee: [
    { id: 'login', label: { fr: 'Se connecter avec son profil personnel', en: 'Sign in with your personal profile' }, articleId: 'first-login' },
    { id: 'project', label: { fr: 'Choisir le bon chantier', en: 'Choose the correct project' }, articleId: 'employee-day' },
    { id: 'punch', label: { fr: 'Faire un pointage complet avec pauses', en: 'Complete a time entry with pauses' }, articleId: 'employee-day' },
    { id: 'finish', label: { fr: 'Vérifier et terminer la journée', en: 'Review and complete the day' }, articleId: 'employee-day' },
    { id: 'privacy', label: { fr: 'Comprendre le GPS et la confidentialité', en: 'Understand GPS and privacy' }, articleId: 'privacy-access' }
  ]
};

function localize(value: LocalizedText, language: 'FR' | 'EN'): string {
  return language === 'FR' ? value.fr : value.en;
}

export default function UserHelpCenter({
  open,
  onClose,
  language,
  role,
  employeeId,
  employeeName,
  activeTab,
  onNavigate
}: UserHelpCenterProps) {
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>('start');
  const [selectedArticleId, setSelectedArticleId] = useState<string>('first-login');
  const [searchQuery, setSearchQuery] = useState('');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const isFR = language === 'FR';
  const progressKey = `gcp_help_progress_${employeeId}`;

  useEffect(() => {
    if (!open) return;
    try {
      const stored = JSON.parse(localStorage.getItem(progressKey) || '[]');
      setCompletedSteps(Array.isArray(stored) ? stored : []);
    } catch {
      setCompletedSteps([]);
    }
  }, [open, progressKey]);

  const availableArticles = useMemo(
    () => ARTICLES.filter(article => article.roles.includes('all') || article.roles.includes(role)),
    [role]
  );

  const filteredArticles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return availableArticles.filter(article => {
      if (!query) return article.category === selectedCategory;
      const searchable = [
        article.title.fr,
        article.title.en,
        article.summary.fr,
        article.summary.en,
        ...article.keywords,
        ...article.steps.flatMap(step => [step.title.fr, step.title.en, step.detail.fr, step.detail.en])
      ].join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }, [availableArticles, searchQuery, selectedCategory]);

  useEffect(() => {
    if (!open) return;
    if (!availableArticles.some(article => article.id === selectedArticleId)) {
      setSelectedArticleId(availableArticles[0]?.id || 'first-login');
    }
  }, [availableArticles, open, selectedArticleId]);

  useEffect(() => {
    if (!open || searchQuery.trim()) return;
    const first = availableArticles.find(article => article.category === selectedCategory);
    if (first) setSelectedArticleId(first.id);
  }, [selectedCategory, open]);

  const selectedArticle = availableArticles.find(article => article.id === selectedArticleId)
    || filteredArticles[0]
    || availableArticles[0];

  const starterSteps = STARTER_BY_ROLE[role];
  const completionCount = starterSteps.filter(step => completedSteps.includes(step.id)).length;
  const completionPercent = starterSteps.length ? Math.round((completionCount / starterSteps.length) * 100) : 0;

  const toggleStarter = (id: string) => {
    setCompletedSteps(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      try { localStorage.setItem(progressKey, JSON.stringify(next)); } catch { /* localStorage unavailable */ }
      return next;
    });
  };

  const openStarterArticle = (articleId: string) => {
    const article = availableArticles.find(item => item.id === articleId);
    if (!article) return;
    setSearchQuery('');
    setSelectedCategory(article.category);
    setSelectedArticleId(article.id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={isFR ? 'Centre d’aide et de formation' : 'Help and training center'}>
      <section className="flex h-[96dvh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-gray-700 bg-[#11141A] shadow-2xl sm:h-[92dvh]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800 bg-[#171A21] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-600 to-amber-400 text-white shadow-lg">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-white sm:text-2xl">
                {isFR ? 'Centre d’aide et de formation' : 'Help and training center'}
              </h2>
              <p className="truncate text-xs text-gray-400">
                {isFR ? `Instructions adaptées à ${employeeName}` : `Instructions tailored for ${employeeName}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 text-gray-300 transition hover:border-gray-500 hover:text-white" aria-label={isFR ? 'Fermer l’aide' : 'Close help'}>
            <X className="h-6 w-6" />
          </button>
        </header>

        <div className="shrink-0 border-b border-gray-800 bg-[#13161C] p-3 sm:px-6 sm:py-4">
          <div className="relative mx-auto max-w-4xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder={isFR ? 'Rechercher : devis, pointage, sauvegarde, outil, paie…' : 'Search: quote, time tracking, backup, tool, payroll…'}
              className="min-h-13 w-full rounded-2xl border border-gray-700 bg-gray-950 py-3 pl-12 pr-4 text-base text-white outline-none placeholder:text-gray-600 focus:border-orange-500"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="shrink-0 border-b border-gray-800 bg-[#151820] p-3 lg:w-72 lg:border-b-0 lg:border-r lg:p-4">
            <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label={isFR ? 'Sections d’aide' : 'Help sections'}>
              {CATEGORIES.map(category => {
                const Icon = category.icon;
                const count = availableArticles.filter(article => article.category === category.id).length;
                if (count === 0) return null;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => { setSearchQuery(''); setSelectedCategory(category.id); }}
                    className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-black transition lg:w-full ${
                      selectedCategory === category.id && !searchQuery
                        ? 'border-orange-500/50 bg-orange-600/15 text-orange-300'
                        : 'border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap lg:whitespace-normal">{localize(category.label, language)}</span>
                    <span className="ml-auto rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-gray-500">{count}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 hidden rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 lg:block">
              <p className="text-xs font-black text-cyan-200">{isFR ? 'Rôle connecté' : 'Signed-in role'}</p>
              <p className="mt-1 text-sm font-bold capitalize text-white">{role}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                {isFR ? 'Le contenu est filtré selon les fonctions normalement accessibles à ce rôle.' : 'Content is filtered according to the functions normally available to this role.'}
              </p>
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
            {selectedCategory === 'start' && !searchQuery && (
              <section className="mb-6 rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-600/15 to-amber-500/5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-orange-300">{isFR ? 'Parcours de démarrage' : 'Getting-started path'}</p>
                    <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{isFR ? 'Vos premières étapes essentielles' : 'Your essential first steps'}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
                      {isFR ? 'Cochez chaque étape après l’avoir réellement vérifiée. La progression est conservée pour votre profil sur cet appareil.' : 'Check each step only after actually verifying it. Progress is saved for your profile on this device.'}
                    </p>
                  </div>
                  <div className="min-w-32 rounded-2xl border border-orange-500/20 bg-black/25 p-4 text-center">
                    <div className="text-3xl font-black text-orange-300">{completionPercent}%</div>
                    <div className="mt-1 text-[10px] font-bold uppercase text-gray-500">{completionCount}/{starterSteps.length}</div>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-950">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-600 to-amber-400 transition-all" style={{ width: `${completionPercent}%` }} />
                </div>
                <div className="mt-5 grid gap-2 md:grid-cols-2">
                  {starterSteps.map(step => {
                    const completed = completedSteps.includes(step.id);
                    return (
                      <div key={step.id} className={`flex items-center gap-3 rounded-xl border p-3 ${completed ? 'border-green-500/30 bg-green-500/10' : 'border-gray-700 bg-gray-900/80'}`}>
                        <button type="button" onClick={() => toggleStarter(step.id)} className="shrink-0" aria-label={completed ? (isFR ? 'Marquer non terminé' : 'Mark incomplete') : (isFR ? 'Marquer terminé' : 'Mark complete')}>
                          {completed ? <CheckCircle2 className="h-6 w-6 text-green-400" /> : <Circle className="h-6 w-6 text-gray-500" />}
                        </button>
                        <button type="button" onClick={() => openStarterArticle(step.articleId)} className={`min-w-0 flex-1 text-left text-sm font-bold ${completed ? 'text-green-100' : 'text-gray-200'}`}>
                          {localize(step.label, language)}
                        </button>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
                      </div>
                    );
                  })}
                </div>
                {completionCount > 0 && (
                  <button type="button" onClick={() => { setCompletedSteps([]); try { localStorage.removeItem(progressKey); } catch { /* ignore */ } }} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white">
                    <RotateCcw className="h-4 w-4" /> {isFR ? 'Recommencer le parcours' : 'Reset the path'}
                  </button>
                )}
              </section>
            )}

            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <section className="space-y-2">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-gray-300">
                    {searchQuery ? (isFR ? 'Résultats' : 'Results') : (isFR ? 'Sujets' : 'Topics')}
                  </h3>
                  <span className="rounded-full bg-gray-900 px-2 py-1 text-[10px] font-bold text-gray-500">{filteredArticles.length}</span>
                </div>
                {filteredArticles.map(article => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => setSelectedArticleId(article.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedArticle?.id === article.id
                        ? 'border-orange-500/50 bg-orange-600/10'
                        : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                    }`}
                  >
                    <p className="text-sm font-black text-white">{localize(article.title, language)}</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-gray-400">{localize(article.summary, language)}</p>
                  </button>
                ))}
                {filteredArticles.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-700 p-6 text-center text-sm text-gray-500">
                    {isFR ? 'Aucun sujet ne correspond à cette recherche.' : 'No topic matches this search.'}
                  </div>
                )}
              </section>

              {selectedArticle && (
                <article className="rounded-3xl border border-gray-800 bg-[#171A21] p-4 sm:p-6">
                  <div className="flex flex-col gap-4 border-b border-gray-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                        {localize(CATEGORIES.find(item => item.id === selectedArticle.category)?.label || { fr: '', en: '' }, language)}
                      </p>
                      <h3 className="mt-2 text-xl font-black leading-tight text-white sm:text-3xl">{localize(selectedArticle.title, language)}</h3>
                      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-300">{localize(selectedArticle.summary, language)}</p>
                    </div>
                    {selectedArticle.tab && (
                      <button
                        type="button"
                        onClick={() => onNavigate(selectedArticle.tab!, selectedArticle.settingsTab)}
                        className="min-h-11 shrink-0 rounded-xl bg-orange-600 px-4 text-sm font-black text-white shadow-lg transition hover:bg-orange-500"
                      >
                        {isFR ? 'Ouvrir ce module' : 'Open this module'}
                      </button>
                    )}
                  </div>

                  <ol className="mt-6 space-y-3">
                    {selectedArticle.steps.map((step, index) => (
                      <li key={`${selectedArticle.id}-${index}`} className="flex gap-4 rounded-2xl border border-gray-800 bg-gray-950/50 p-4">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-600/20 text-sm font-black text-orange-300">{index + 1}</span>
                        <div>
                          <h4 className="font-black text-white">{localize(step.title, language)}</h4>
                          <p className="mt-1 text-sm leading-relaxed text-gray-400">{localize(step.detail, language)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {selectedArticle.tips && selectedArticle.tips.length > 0 && (
                    <div className="mt-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                      <h4 className="flex items-center gap-2 text-sm font-black text-cyan-200"><Check className="h-5 w-5" />{isFR ? 'Bonnes pratiques' : 'Best practices'}</h4>
                      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-cyan-50/80">
                        {selectedArticle.tips.map((tip, index) => <li key={index}>• {localize(tip, language)}</li>)}
                      </ul>
                    </div>
                  )}

                  {selectedArticle.warning && (
                    <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <h4 className="flex items-center gap-2 text-sm font-black text-amber-200"><AlertTriangle className="h-5 w-5" />{isFR ? 'Attention' : 'Important'}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-amber-50/80">{localize(selectedArticle.warning, language)}</p>
                    </div>
                  )}
                </article>
              )}
            </div>
          </main>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-800 bg-[#171A21] px-4 py-3 text-[11px] text-gray-500 sm:px-6">
          <span>{isFR ? 'Aide intégrée — disponible même hors ligne après le chargement de l’application' : 'Built-in help — available offline after the app loads'}</span>
          <span className="hidden sm:inline">{isFR ? `Page actuelle : ${activeTab}` : `Current page: ${activeTab}`}</span>
        </footer>
      </section>
    </div>
  );
}
