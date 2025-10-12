const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config(); // CHANGEMENT : Pour gérer facilement les variables d'environnement

const app = express();
const cache = new NodeCache({ stdTTL: 86400 }); // 24 heures

// --- CONSTANTES DE CALCUL ---
// CHANGEMENT : Centraliser les "valeurs magiques" les rend plus faciles à modifier.
const GRAMS_CO2_PER_MB = 0.5;
const GREEN_HOSTING_DISCOUNT = 0.5;
const CLEANER_THAN_PERCENTAGE_DEFAULT = 50; // Pourcentage de sites plus polluants (valeur arbitraire)

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS || '*' // '*' est ok pour le dev, mais à restreindre en production
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== FONCTIONS D'ANALYSE =====

// Vérifier l'hébergement vert
async function checkGreenHosting(url) {
  try {
    const domain = new URL(url).hostname;
    const response = await axios.get(`https://api.thegreenwebfoundation.org/greencheck/${domain}`);

    if (response.data && response.data.green !== undefined) {
      return {
        isGreen: response.data.green,
        hostedBy: response.data.hostedby || 'Inconnu',
        hostedByWebsite: response.data.hostedbywebsite || null
      };
    }

    return { isGreen: false, hostedBy: 'Inconnu', hostedByWebsite: null };
  } catch (error) {
    console.error(`Erreur hébergement vert pour ${url}:`, error.message);
    return { isGreen: false, hostedBy: 'Erreur de vérification', hostedByWebsite: null };
  }
}

// Calculer le poids de la page
async function calculatePageWeight(url) {
  try {
    const headResponse = await axios.head(url, { timeout: 10000, maxRedirects: 5 });
    if (headResponse.headers['content-length']) {
      return parseInt(headResponse.headers['content-length'], 10);
    }
  } catch (error) {
    console.log(`HEAD request pour ${url} a échoué, tentative avec GET.`);
  }

  try {
    const getResponse = await axios.get(url, { timeout: 15000, maxRedirects: 5, responseType: 'arraybuffer' });
    return Buffer.byteLength(getResponse.data);
  } catch (error) {
    console.error(`Erreur lors du calcul du poids pour ${url}:`, error.message);
    // CHANGEMENT : Lancer une erreur au lieu de retourner une valeur par défaut.
    // Cela empêche de calculer un score basé sur des données incorrectes.
    throw new Error(`Impossible de récupérer le contenu de l'URL : ${url}`);
  }
}

// Calculer l'empreinte carbone
function calculateCarbon(bytes, isGreen) {
  const megabytes = bytes / (1024 * 1024);
  let gramsCO2 = megabytes * GRAMS_CO2_PER_MB;

  if (isGreen) {
    gramsCO2 *= GREEN_HOSTING_DISCOUNT;
  }

  return {
    gramsCO2PerView: parseFloat(gramsCO2.toFixed(2)),
    equivalence: {
      treesPlanted: parseFloat((gramsCO2 / 6000).toFixed(5)), // 1 arbre absorbe ~6kg CO2/an
      kettlesBoiled: parseFloat((gramsCO2 / 15).toFixed(2)), // Bouilloire ~15g
      kmDriven: parseFloat((gramsCO2 / 120).toFixed(3)) // Voiture ~120g/km
    },
    cleanerThan: CLEANER_THAN_PERCENTAGE_DEFAULT
  };
}

// Calculer le score
function calculateEcoScore(carbonData, hostingData) {
  let score = 100;
  const co2 = carbonData.gramsCO2PerView;

  // Barème de pénalité basé sur les gCO2
  if (co2 <= 0.5) score -= co2 * 20;
  else if (co2 <= 1) score -= 10 + (co2 - 0.5) * 40;
  else if (co2 <= 2) score -= 30 + (co2 - 1) * 15;
  else score -= 45 + Math.min((co2 - 2) * 5, 5);

  // Bonus pour hébergement vert
  if (hostingData.isGreen) {
    score += 10;
  }

  // Bonus basé sur la comparaison (si cette donnée était dynamique)
  if (carbonData.cleanerThan) {
    score += (carbonData.cleanerThan / 100) * 5;
  }
  
  // On s'assure que le score reste entre 0 et 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  const ranking = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : score >= 30 ? 'E' : 'F';

  return { ecoScore: score, ranking };
}

// Analyser un site complet
async function analyzeSite(url) {
  console.log(`Analyse de: ${url}`);

  const hostingData = await checkGreenHosting(url);
  // Le `calculatePageWeight` peut maintenant lancer une erreur, qui sera attrapée dans la route
  const pageWeight = await calculatePageWeight(url); 
  const carbonData = calculateCarbon(pageWeight, hostingData.isGreen);
  const scoreData = calculateEcoScore(carbonData, hostingData);

  return {
    url,
    ecoScore: scoreData.ecoScore,
    ranking: scoreData.ranking,
    hosting: {
      isGreen: hostingData.isGreen,
      hostedBy: hostingData.hostedBy,
      hostedByWebsite: hostingData.hostedByWebsite
    },
    carbon: {
      gramsCO2PerView: carbonData.gramsCO2PerView,
      equivalence: carbonData.equivalence,
      cleanerThan: carbonData.cleanerThan
    },
    pageWeight,
    lastAnalyzed: new Date().toISOString()
  };
}

// ===== ROUTES =====

app.get('/', (req, res) => {
  res.json({
    name: 'Eco-Score Web API',
    version: '1.0.0',
    description: 'API pour calculer l\'empreinte carbone des sites web',
    endpoints: {
      analyze: 'POST /api/analyze',
      health: 'GET /api/health'
    }
  });
});

app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ status: 'error', message: 'Le paramètre "url" est requis.' });
  }

  let validUrl;
  try {
    validUrl = new URL(url);
  } catch (urlError) {
    return res.status(400).json({ status: 'error', message: 'L\'URL fournie n\'est pas valide.' });
  }

  const cleanUrl = validUrl.href; // Utiliser une URL normalisée comme clé
  const cacheKey = `analysis_${cleanUrl}`;
  const cachedResult = cache.get(cacheKey);

  if (cachedResult) {
    return res.json({ status: 'success', data: cachedResult, cached: true });
  }

  try {
    const result = await analyzeSite(cleanUrl);
    cache.set(cacheKey, result);
    res.json({ status: 'success', data: result, cached: false });
  } catch (error) {
    console.error('Erreur d\'analyse:', error);
    res.status(500).json({
      status: 'error',
      // On renvoie un message plus lisible à l'utilisateur
      message: error.message || 'Une erreur interne est survenue lors de l\'analyse.'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cacheStats: cache.getStats()
  });
});

module.exports = app;
