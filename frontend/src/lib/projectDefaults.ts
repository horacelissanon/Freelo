// Professional-practice default steps/conditions per ProjectType — used to
// pre-fill "Étapes du projet" and "Conditions" the moment a freelance picks
// a secteur/type, so the picker itself teaches what each field is for
// instead of handing over a blank form. Every field stays fully editable —
// this is a starting point, not a constraint. OTHER keeps the original
// generic 4-step fallback (no sector-specific knowledge to draw from).
import type { ProjectType } from './constants';

export interface StepTemplate {
  title: string;
  description: string;
}

export interface ConditionTemplate {
  primaryText: string;
  secondaryText: string;
}

const GENERIC_STEPS: StepTemplate[] = [
  { title: 'Brief & découverte', description: 'Collecte de vos informations et objectifs' },
  { title: 'Premiers concepts', description: 'Premières propositions à valider' },
  { title: 'Révisions', description: 'Ajustements selon vos retours' },
  { title: 'Livraison finale', description: 'Remise des fichiers finaux' },
];

const GENERIC_CONDITIONS: ConditionTemplate[] = [
  {
    primaryText: 'Nombre de révisions',
    secondaryText:
      'Le nombre de révisions incluses est précisé au devis, au-delà facturé en supplément.',
  },
  {
    primaryText: 'Livraison',
    secondaryText: 'Les fichiers finaux sont livrés dans les formats convenus avec le client.',
  },
];

export const PROJECT_TYPE_DEFAULT_STEPS: Record<ProjectType, StepTemplate[]> = {
  // Design & Graphisme
  LOGO: [
    {
      title: 'Brief & découverte',
      description: 'Collecte des informations, valeurs et références visuelles du client',
    },
    {
      title: 'Recherche & moodboard',
      description: 'Exploration de pistes graphiques et de références',
    },
    { title: 'Propositions de logos', description: '2 à 3 concepts distincts présentés au client' },
    { title: 'Révisions', description: 'Ajustements selon les retours (1 à 2 tours inclus)' },
    {
      title: 'Livraison des fichiers finaux',
      description: 'Formats vectoriels (AI, SVG, PDF) et exports (PNG, JPG)',
    },
  ],
  IDENTITY: [
    { title: 'Brief & audit de marque', description: 'Analyse du positionnement et des besoins' },
    { title: 'Recherche de direction artistique', description: 'Palette, typographies, moodboard' },
    { title: 'Déclinaisons de la charte', description: 'Logo, couleurs, typographies, usages' },
    {
      title: 'Application sur supports types',
      description: 'Carte de visite, en-tête, réseaux sociaux',
    },
    {
      title: 'Livraison du guide de style',
      description: 'Document PDF complet + fichiers sources',
    },
  ],
  POSTER: [
    {
      title: 'Brief & contenu',
      description: 'Récupération des textes, visuels et informations à intégrer',
    },
    { title: 'Maquette', description: 'Première proposition de mise en page' },
    { title: 'Révisions', description: 'Ajustements de contenu et de mise en forme' },
    { title: 'Validation finale', description: 'Bon à tirer (BAT) validé par le client' },
    {
      title: 'Livraison des fichiers',
      description: 'Fichiers imprimables (PDF haute résolution) et web (JPG/PNG)',
    },
  ],
  PACKAGING: [
    {
      title: 'Brief & contraintes techniques',
      description: 'Dimensions, matière, contraintes de fabrication',
    },
    { title: 'Recherche créative', description: 'Pistes graphiques et volumes' },
    { title: 'Maquette 3D / mockup', description: 'Visualisation réaliste du rendu final' },
    { title: 'Révisions & ajustements', description: 'Intégration des retours' },
    {
      title: "Livraison des fichiers d'impression",
      description: 'Fichiers en aplats et découpe (BAT presse)',
    },
  ],
  SOCIAL: [
    {
      title: 'Brief & ligne éditoriale',
      description: 'Définition du ton, des thématiques et des objectifs',
    },
    { title: 'Calendrier de publication', description: 'Planning des contenus à produire' },
    { title: 'Création des visuels', description: 'Production du batch de visuels' },
    { title: 'Révisions', description: 'Ajustements selon les retours' },
    {
      title: 'Livraison & programmation',
      description: 'Fichiers livrés (et publication si incluse)',
    },
  ],
  PRINT: [
    { title: 'Brief & maquette', description: 'Récupération du contenu et mise en page initiale' },
    {
      title: 'Mise en page',
      description: 'Structuration du document (pages intérieures, couverture)',
    },
    { title: 'Révisions', description: 'Corrections et ajustements de contenu' },
    { title: 'Bon à tirer (BAT)', description: 'Validation finale avant impression' },
    {
      title: 'Livraison des fichiers imprimables',
      description: 'Export PDF haute résolution avec fonds perdus',
    },
  ],
  UI_WEB: [
    {
      title: 'Brief & recherche UX',
      description: 'Analyse des besoins utilisateurs et de la concurrence',
    },
    { title: 'Wireframes', description: 'Structure et parcours utilisateur' },
    { title: 'Maquettes UI', description: 'Design visuel des écrans clés' },
    { title: 'Révisions', description: 'Ajustements selon les retours' },
    {
      title: 'Livraison des fichiers',
      description: 'Maquettes finales + spécifications (Figma, exports)',
    },
  ],
  // Développement
  WEBSITE: [
    {
      title: 'Cahier des charges',
      description: 'Recueil des besoins, arborescence et fonctionnalités',
    },
    { title: 'Maquettes / wireframes', description: 'Validation de la structure et du design' },
    { title: 'Développement', description: 'Intégration et développement des fonctionnalités' },
    {
      title: 'Tests & recette',
      description: 'Vérification du bon fonctionnement sur tous supports',
    },
    {
      title: 'Mise en ligne & formation',
      description: 'Déploiement et prise en main par le client',
    },
  ],
  MOBILE_APP: [
    {
      title: 'Cahier des charges',
      description: 'Définition des fonctionnalités et plateformes cibles (iOS/Android)',
    },
    { title: 'Maquettes UI/UX', description: 'Validation des parcours et écrans' },
    { title: 'Développement', description: 'Programmation des fonctionnalités' },
    { title: 'Tests', description: 'Vérification sur différents appareils et systèmes' },
    { title: 'Publication', description: 'Mise en ligne sur les stores (App Store / Google Play)' },
  ],
  SAAS_APP: [
    {
      title: 'Cadrage fonctionnel',
      description: 'Définition du MVP et des fonctionnalités prioritaires',
    },
    { title: 'Architecture & maquettes', description: 'Structure technique et design des écrans' },
    { title: 'Développement', description: 'Construction des fonctionnalités par itérations' },
    { title: 'Tests & recette', description: 'Vérification fonctionnelle et corrections de bugs' },
    { title: 'Mise en production', description: "Déploiement et formation à l'utilisation" },
  ],
  API_INTEGRATION: [
    { title: 'Analyse technique', description: "Étude de l'API et des besoins d'intégration" },
    {
      title: 'Développement',
      description: 'Implémentation de la connexion et des flux de données',
    },
    { title: 'Tests', description: 'Vérification des échanges de données et gestion des erreurs' },
    {
      title: 'Documentation',
      description: "Rédaction d'une documentation technique de l'intégration",
    },
    {
      title: 'Livraison & mise en production',
      description: "Déploiement de l'intégration finalisée",
    },
  ],
  MAINTENANCE: [
    { title: 'Audit initial', description: 'État des lieux technique du site/application' },
    {
      title: "Plan d'intervention",
      description: 'Définition des priorités (correctifs, mises à jour)',
    },
    { title: 'Interventions', description: 'Corrections de bugs et mises à jour de sécurité' },
    { title: 'Suivi & rapport', description: 'Compte-rendu des interventions effectuées' },
    {
      title: 'Point de suivi régulier',
      description: 'Bilan périodique selon la fréquence convenue',
    },
  ],
  // Rédaction
  BLOG_ARTICLE: [
    { title: 'Brief & mots-clés', description: 'Sujet, angle, cible et contraintes SEO' },
    { title: "Plan de l'article", description: 'Structure proposée avant rédaction' },
    { title: 'Rédaction', description: 'Écriture du contenu' },
    { title: 'Relecture & révisions', description: 'Corrections selon les retours du client' },
    { title: 'Livraison', description: 'Remise du texte formaté (Word, Google Doc ou CMS)' },
  ],
  SEO_CONTENT: [
    {
      title: 'Analyse des mots-clés',
      description: 'Étude de la thématique et des requêtes cibles',
    },
    { title: 'Plan optimisé SEO', description: 'Structure Hn et angle éditorial' },
    { title: 'Rédaction', description: 'Écriture du contenu optimisé' },
    { title: 'Optimisation on-page', description: 'Balises meta, maillage interne suggéré' },
    { title: 'Livraison', description: 'Remise du contenu prêt à publier' },
  ],
  COPYWRITING: [
    { title: 'Brief créatif', description: 'Objectifs, cible et ton de la marque' },
    { title: 'Proposition de textes', description: 'Premiers jets sur les supports concernés' },
    { title: 'Révisions', description: 'Ajustements selon les retours' },
    { title: 'Validation finale', description: 'Accord du client sur la version finale' },
    { title: 'Livraison', description: 'Remise des textes formatés' },
  ],
  TECHNICAL_DOC: [
    {
      title: "Recueil d'informations",
      description: 'Collecte des données techniques auprès du client',
    },
    { title: 'Plan de la documentation', description: 'Structure et sommaire proposés' },
    { title: 'Rédaction', description: 'Écriture du contenu technique' },
    { title: 'Relecture technique', description: "Vérification de l'exactitude avec le client" },
    { title: 'Livraison', description: 'Remise du document final (PDF, Word ou autre format)' },
  ],
  NEWSLETTER: [
    { title: 'Brief & ligne éditoriale', description: 'Objectifs et thématiques de la newsletter' },
    { title: 'Plan de contenu', description: 'Structure et sujets à couvrir' },
    { title: 'Rédaction', description: 'Écriture du contenu' },
    { title: 'Révisions', description: 'Ajustements selon les retours' },
    {
      title: 'Livraison',
      description: 'Remise du texte prêt à intégrer (et mise en forme si incluse)',
    },
  ],
  // Consulting
  STRATEGY: [
    {
      title: 'Diagnostic initial',
      description: 'Analyse de la situation actuelle et des objectifs',
    },
    {
      title: 'Recherche & analyse',
      description: 'Étude du marché, de la concurrence et des données disponibles',
    },
    { title: 'Recommandations', description: "Proposition d'un plan d'action stratégique" },
    { title: 'Présentation', description: 'Restitution des conclusions au client' },
    { title: 'Livraison', description: 'Remise du document stratégique final' },
  ],
  AUDIT: [
    { title: "Cadrage de l'audit", description: 'Définition du périmètre et des objectifs' },
    { title: 'Collecte de données', description: 'Recueil des informations nécessaires' },
    { title: 'Analyse', description: 'Étude approfondie des éléments collectés' },
    { title: 'Restitution', description: 'Présentation des constats et recommandations' },
    { title: 'Livraison du rapport', description: "Remise du document d'audit complet" },
  ],
  TRAINING: [
    { title: 'Recueil des besoins', description: 'Identification des objectifs pédagogiques' },
    { title: 'Conception du programme', description: 'Structuration du contenu de formation' },
    { title: 'Préparation des supports', description: 'Réalisation des supports pédagogiques' },
    { title: 'Animation de la formation', description: 'Session(s) de formation dispensée(s)' },
    { title: 'Bilan & supports finaux', description: "Remise des supports et retour d'expérience" },
  ],
  COACHING: [
    { title: 'Premier entretien', description: 'Définition des objectifs et attentes' },
    { title: "Plan d'accompagnement", description: 'Structuration des séances à venir' },
    { title: 'Séances de coaching', description: 'Déroulement des sessions prévues' },
    { title: "Points d'étape", description: 'Suivi de la progression' },
    { title: 'Bilan final', description: 'Synthèse des acquis et recommandations' },
  ],
  MARKET_RESEARCH: [
    { title: "Cadrage de l'étude", description: 'Définition des objectifs et du périmètre' },
    { title: 'Collecte de données', description: 'Recherche documentaire et/ou terrain' },
    { title: 'Analyse des résultats', description: 'Traitement et interprétation des données' },
    { title: 'Restitution', description: 'Présentation des conclusions' },
    { title: 'Livraison du rapport', description: 'Remise du document final' },
  ],
  // Vidéo
  PROMO_VIDEO: [
    { title: 'Brief & scénario', description: 'Objectifs, message clé et script' },
    { title: 'Storyboard', description: 'Visualisation des séquences avant tournage' },
    { title: 'Tournage / production', description: 'Captation des images (ou animation)' },
    { title: 'Montage', description: 'Édition, habillage et étalonnage' },
    { title: 'Livraison', description: 'Remise des fichiers finaux dans les formats demandés' },
  ],
  SOCIAL_VIDEO: [
    { title: 'Brief & format', description: 'Objectif, plateforme cible et durée' },
    { title: 'Script / storyboard', description: 'Structuration du contenu' },
    { title: 'Tournage ou montage des rushs', description: 'Production des séquences' },
    { title: 'Montage & habillage', description: 'Édition adaptée au format (vertical, carré…)' },
    { title: 'Livraison', description: 'Fichiers livrés aux formats demandés' },
  ],
  MOTION_DESIGN: [
    { title: 'Brief & script', description: "Message et ton de l'animation" },
    { title: 'Storyboard', description: 'Découpage visuel des séquences' },
    { title: 'Design des éléments', description: 'Création des assets graphiques' },
    { title: 'Animation', description: 'Mise en mouvement des éléments' },
    { title: 'Livraison', description: 'Export dans les formats demandés' },
  ],
  VIDEO_EDITING: [
    {
      title: 'Réception des rushs',
      description: 'Récupération des fichiers bruts fournis par le client',
    },
    { title: 'Dérushage', description: 'Sélection des meilleures séquences' },
    { title: 'Montage', description: 'Assemblage et structuration du récit' },
    {
      title: 'Habillage & étalonnage',
      description: 'Ajout de titres, transitions, correction colorimétrique',
    },
    { title: 'Livraison', description: 'Remise du fichier final exporté' },
  ],
  DOCUMENTARY: [
    { title: 'Recherche & préparation', description: 'Approfondissement du sujet et repérages' },
    { title: 'Écriture / trame narrative', description: 'Structuration du récit' },
    { title: 'Tournage', description: 'Captation des interviews et images' },
    { title: 'Montage', description: 'Construction du récit final' },
    { title: 'Livraison', description: 'Remise du film dans les formats demandés' },
  ],
  // Community management
  CONTENT_CALENDAR: [
    { title: 'Brief & objectifs', description: 'Définition de la stratégie de contenu' },
    { title: 'Recherche de thématiques', description: 'Identification des sujets pertinents' },
    { title: 'Construction du calendrier', description: 'Planification des publications' },
    { title: 'Validation', description: 'Retour et ajustements du client' },
    { title: 'Livraison', description: 'Remise du calendrier éditorial final' },
  ],
  SOCIAL_CAMPAIGN: [
    { title: 'Brief & objectifs', description: 'Définition des cibles et résultats attendus' },
    { title: 'Stratégie de campagne', description: 'Choix des plateformes et du message' },
    { title: 'Création des contenus', description: 'Production des visuels et textes' },
    { title: 'Lancement & suivi', description: 'Mise en ligne et pilotage de la campagne' },
    { title: 'Bilan', description: 'Rapport de performance en fin de campagne' },
  ],
  COMMUNITY_GROWTH: [
    { title: 'Audit des comptes', description: 'État des lieux de la présence actuelle' },
    { title: 'Stratégie de croissance', description: 'Définition des actions à mener' },
    { title: 'Mise en œuvre', description: "Actions d'animation et d'engagement" },
    { title: 'Suivi & ajustements', description: 'Analyse des résultats intermédiaires' },
    { title: 'Bilan', description: 'Rapport final sur la période' },
  ],
  MODERATION: [
    { title: 'Cadrage', description: 'Définition des règles de modération et du périmètre' },
    { title: 'Mise en place', description: 'Configuration des outils et process' },
    { title: 'Modération quotidienne', description: 'Suivi et gestion des interactions' },
    { title: 'Reporting', description: "Compte-rendu périodique de l'activité" },
    { title: 'Bilan', description: 'Synthèse en fin de période convenue' },
  ],
  ADS_MANAGEMENT: [
    {
      title: 'Brief & objectifs',
      description: 'Définition des cibles, budget et résultats attendus',
    },
    { title: 'Stratégie publicitaire', description: 'Choix des plateformes et formats' },
    { title: 'Création des campagnes', description: 'Configuration et création des annonces' },
    { title: 'Suivi & optimisation', description: 'Pilotage et ajustements en cours de diffusion' },
    { title: 'Bilan', description: 'Rapport de performance final' },
  ],
  OTHER: GENERIC_STEPS,
};

export const PROJECT_TYPE_DEFAULT_CONDITIONS: Record<ProjectType, ConditionTemplate[]> = {
  // Design & Graphisme
  LOGO: [
    {
      primaryText: 'Nombre de révisions',
      secondaryText:
        'Le nombre de tours de retouches inclus est précisé au devis, au-delà facturé en supplément.',
    },
    {
      primaryText: "Droits d'utilisation",
      secondaryText: 'Le logo devient pleine propriété du client après paiement intégral.',
    },
  ],
  IDENTITY: [
    {
      primaryText: 'Supports inclus',
      secondaryText:
        'Le nombre de supports de communication inclus dans le forfait est précisé au devis, au-delà sur devis complémentaire.',
    },
    {
      primaryText: 'Modifications ultérieures',
      secondaryText:
        'Toute évolution de la charte après livraison fait l’objet d’un nouveau devis.',
    },
  ],
  POSTER: [
    {
      primaryText: 'Format & impression',
      secondaryText:
        "Le fichier est livré prêt à imprimer ; l'impression elle-même n'est pas incluse sauf mention contraire.",
    },
    {
      primaryText: 'Contenu fourni par le client',
      secondaryText: 'Les textes et visuels transmis doivent être libres de droits.',
    },
  ],
  PACKAGING: [
    {
      primaryText: 'Validation avant impression',
      secondaryText: 'Un bon à tirer doit être validé avant tout lancement en production.',
    },
    {
      primaryText: 'Fabrication non incluse',
      secondaryText:
        "L'impression et la fabrication physique du packaging sont à la charge du client.",
    },
  ],
  SOCIAL: [
    {
      primaryText: 'Volume inclus',
      secondaryText: 'Le nombre de visuels inclus dans le forfait est précisé au devis.',
    },
    {
      primaryText: 'Contenu texte',
      secondaryText:
        "Les légendes/textes d'accompagnement sont à fournir par le client sauf mention contraire.",
    },
  ],
  PRINT: [
    {
      primaryText: 'Relecture',
      secondaryText: 'La relecture orthographique du contenu reste à la charge du client.',
    },
    {
      primaryText: 'Impression non incluse',
      secondaryText: 'Sauf mention contraire, seule la mise en page est fournie.',
    },
  ],
  UI_WEB: [
    {
      primaryText: 'Développement non inclus',
      secondaryText:
        "Cette prestation couvre le design ; l'intégration/développement fait l'objet d'un devis séparé sauf mention contraire.",
    },
    {
      primaryText: "Nombre d'écrans",
      secondaryText:
        'Le nombre d’écrans maquettés est précisé au devis, au-delà facturé en supplément.',
    },
  ],
  // Développement
  WEBSITE: [
    {
      primaryText: 'Hébergement & nom de domaine',
      secondaryText: 'À la charge du client sauf mention contraire.',
    },
    {
      primaryText: 'Maintenance',
      secondaryText: 'Non incluse au-delà de la période de garantie précisée au devis.',
    },
  ],
  MOBILE_APP: [
    {
      primaryText: 'Comptes développeur',
      secondaryText: 'Les frais et comptes développeur Apple/Google sont à la charge du client.',
    },
    {
      primaryText: 'Validation des stores',
      secondaryText: 'Les délais de validation par Apple/Google ne dépendent pas du prestataire.',
    },
  ],
  SAAS_APP: [
    {
      primaryText: 'Infrastructure',
      secondaryText: "Les coûts d'hébergement et services tiers sont à la charge du client.",
    },
    {
      primaryText: 'Évolutions futures',
      secondaryText: 'Les fonctionnalités hors périmètre initial font l’objet d’un nouveau devis.',
    },
  ],
  API_INTEGRATION: [
    {
      primaryText: 'Accès & clés API',
      secondaryText: 'Les accès et clés nécessaires sont à fournir par le client.',
    },
    {
      primaryText: 'Dépendance tierce',
      secondaryText: "Le bon fonctionnement dépend de la disponibilité de l'API concernée.",
    },
  ],
  MAINTENANCE: [
    {
      primaryText: 'Périmètre inclus',
      secondaryText: 'Le périmètre exact des interventions est précisé au devis.',
    },
    {
      primaryText: 'Urgences',
      secondaryText: 'Les interventions hors forfait (urgences) sont facturées en supplément.',
    },
  ],
  // Rédaction
  BLOG_ARTICLE: [
    {
      primaryText: 'Nombre de révisions',
      secondaryText: '1 tour de révision inclus, au-delà facturé en supplément.',
    },
    {
      primaryText: 'Recherche & sources',
      secondaryText:
        'Les sources et informations spécifiques sont à fournir par le client si non publiques.',
    },
  ],
  SEO_CONTENT: [
    {
      primaryText: 'Résultats de positionnement',
      secondaryText: 'Aucune garantie de classement, le SEO dépend de nombreux facteurs externes.',
    },
    {
      primaryText: "Délai d'indexation",
      secondaryText:
        "Les effets sur le référencement ne sont visibles qu'après plusieurs semaines.",
    },
  ],
  COPYWRITING: [
    {
      primaryText: 'Nombre de versions',
      secondaryText: 'Le nombre de propositions initiales est précisé au devis.',
    },
    {
      primaryText: 'Usage des textes',
      secondaryText:
        "Les textes livrés sont destinés à l'usage précisé au devis (web, publicité, etc.).",
    },
  ],
  TECHNICAL_DOC: [
    {
      primaryText: 'Exactitude technique',
      secondaryText: 'Le client reste responsable de la validation du contenu technique.',
    },
    {
      primaryText: 'Mises à jour',
      secondaryText:
        'Les mises à jour ultérieures de la documentation font l’objet d’un nouveau devis.',
    },
  ],
  NEWSLETTER: [
    {
      primaryText: 'Fréquence & volume',
      secondaryText: 'Le nombre de newsletters incluses est précisé au devis.',
    },
    {
      primaryText: 'Envoi non inclus',
      secondaryText:
        "L'envoi via une plateforme d'emailing reste à la charge du client sauf mention contraire.",
    },
  ],
  // Consulting
  STRATEGY: [
    {
      primaryText: 'Mise en œuvre',
      secondaryText:
        "L'accompagnement dans la mise en œuvre du plan n'est pas inclus sauf mention contraire.",
    },
    {
      primaryText: 'Confidentialité',
      secondaryText:
        'Les informations partagées par le client sont traitées de manière confidentielle.',
    },
  ],
  AUDIT: [
    {
      primaryText: 'Accès aux informations',
      secondaryText: 'Le client s’engage à fournir les accès et données nécessaires à l’audit.',
    },
    {
      primaryText: 'Recommandations',
      secondaryText: "Les recommandations formulées n'engagent pas leur mise en œuvre.",
    },
  ],
  TRAINING: [
    {
      primaryText: 'Nombre de participants',
      secondaryText: 'Le tarif est établi pour le nombre de participants précisé au devis.',
    },
    {
      primaryText: 'Logistique',
      secondaryText:
        'La logistique (salle, matériel) est à la charge du client sauf mention contraire.',
    },
  ],
  COACHING: [
    {
      primaryText: 'Nombre de séances',
      secondaryText: 'Le nombre de séances incluses est précisé au devis.',
    },
    {
      primaryText: 'Engagement',
      secondaryText: "Les résultats dépendent également de l'implication du client.",
    },
  ],
  MARKET_RESEARCH: [
    {
      primaryText: 'Fiabilité des données',
      secondaryText: 'Les résultats dépendent de la qualité des sources disponibles.',
    },
    {
      primaryText: 'Usage du rapport',
      secondaryText: "Le rapport est destiné à l'usage interne du client sauf mention contraire.",
    },
  ],
  // Vidéo
  PROMO_VIDEO: [
    {
      primaryText: 'Nombre de révisions',
      secondaryText: '2 tours de retouches inclus sur le montage.',
    },
    {
      primaryText: 'Musique & droits',
      secondaryText: 'La musique utilisée respecte les droits d’usage précisés au devis.',
    },
  ],
  SOCIAL_VIDEO: [
    {
      primaryText: 'Formats livrés',
      secondaryText: 'Les formats (ratio, durée) sont précisés au devis.',
    },
    {
      primaryText: 'Musique & droits',
      secondaryText: 'Utilisation de musiques libres de droits sauf fourniture par le client.',
    },
  ],
  MOTION_DESIGN: [
    { primaryText: 'Nombre de révisions', secondaryText: '2 tours de retouches inclus.' },
    {
      primaryText: 'Voix off & musique',
      secondaryText: 'Non incluses sauf mention contraire au devis.',
    },
  ],
  VIDEO_EDITING: [
    {
      primaryText: 'Qualité des rushs fournis',
      secondaryText: 'Le rendu final dépend de la qualité des images fournies par le client.',
    },
    {
      primaryText: 'Nombre de révisions',
      secondaryText: 'Le nombre de tours de retouches inclus est précisé au devis.',
    },
  ],
  DOCUMENTARY: [
    {
      primaryText: "Droits à l'image",
      secondaryText:
        'Les autorisations des personnes filmées sont à obtenir par le client sauf mention contraire.',
    },
    {
      primaryText: 'Durée de production',
      secondaryText:
        'Les délais de tournage/montage dépendent de la disponibilité des intervenants.',
    },
  ],
  // Community management
  CONTENT_CALENDAR: [
    {
      primaryText: 'Période couverte',
      secondaryText: 'La période couverte par le calendrier est précisée au devis.',
    },
    {
      primaryText: 'Production des visuels',
      secondaryText: 'La création des visuels associés n’est pas incluse sauf mention contraire.',
    },
  ],
  SOCIAL_CAMPAIGN: [
    {
      primaryText: 'Budget publicitaire',
      secondaryText: 'Le budget de diffusion (ads) n’est pas inclus dans la prestation.',
    },
    {
      primaryText: 'Résultats',
      secondaryText:
        'Aucune garantie de résultat, les performances dépendent de facteurs externes.',
    },
  ],
  COMMUNITY_GROWTH: [
    {
      primaryText: 'Résultats',
      secondaryText: 'La croissance dépend de nombreux facteurs, aucun chiffre n’est garanti.',
    },
    {
      primaryText: 'Durée de la prestation',
      secondaryText: 'La durée d’accompagnement est précisée au devis.',
    },
  ],
  MODERATION: [
    {
      primaryText: 'Horaires couverts',
      secondaryText: 'Les plages horaires de modération sont précisées au devis.',
    },
    {
      primaryText: 'Contenu sensible',
      secondaryText: 'Les cas litigieux graves sont transmis au client pour décision finale.',
    },
  ],
  ADS_MANAGEMENT: [
    {
      primaryText: 'Budget publicitaire',
      secondaryText: 'Le budget de diffusion (ads) est distinct des honoraires de gestion.',
    },
    {
      primaryText: 'Résultats',
      secondaryText:
        'Aucune garantie de résultat, les performances dépendent de la plateforme et du marché.',
    },
  ],
  OTHER: GENERIC_CONDITIONS,
};
