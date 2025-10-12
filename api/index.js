const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 86400 }); // 24 heures

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS || '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== FONCTIONS D'ANALYSE =====

// Vérifier l'hébergement vert
async function checkGreenHosting(url) {
  try {
    const domain = new URL(url).hostname;
    const response = await axios.get(`https://api.thegreenwebfoundation.org/greencheck/${domain}` );
    
    if (response.data && response.data.green !== undefined) {
      return {
        isGreen: response.data.green,
        hostedBy: response.data.hostedby || 'Inconnu',
        hostedByWebsite: response.data.hostedbywebsite || null
      };
    }
    
    return { isGreen: false, hostedBy: 'Inconnu', hostedByWebsite: null };
  } catch (error) {
    console.error('Erreur hébergement vert:', error.message);
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
    console.log('HEAD request échouée, utilisation GET');
  }
  
  try {
    const getResponse = await axios.get(url, { timeout: 15000, maxRedirects: 5, responseType: 'arraybuffer' });
    return Buffer.byteLength(getResponse.data);
  } catch (error) {
    console.error('Erreur calcul poids:', error.message);
    return 2 * 1024 * 1024; // 2MB par défaut
  }
}

// Calculer l'empreinte carbone
function calculateCarbon(bytes, isGreen) {
  const megabytes = bytes / (1024 * 1024);
  let gramsCO2 = megabytes * 0.5;
  
  if (isGreen) {
    gramsCO2 *= 0.5;
  }
  
  return {
    gramsCO2PerView: parseFloat(gramsCO2.toFixed(2)),
    equivalence: {
      treesPlanted: parseFloat((gramsCO2 / 6000).toFixed(5)),
      kettlesBoiled: parseFloat((gramsCO2 / 15).toFixed(2)),
      kmDriven: parseFloat((gramsCO2 / 120).toFixed(3))
    },
    cleanerThan: 50
  };
}

// Calculer le score
function calculateEcoScore(carbonData, hostingData) {
  let score = 100;
  const co2 = carbonData.gramsCO2PerView;
  
  if (co2 <= 0.5) {
    score -= co2 * 20;
  } else if (co2 <= 1) {
    score -= 10 + (co2 - 0.5) * 40;
  } else if (co2 <= 2) {
    score -= 30 + (co2 - 1) * 15;
  } else {
    score -= 45 + Math.min((co2 - 2) * 5, 5);
  }
  
  if (hostingData.isGreen) {
    score += 10;
  }
  
  if (carbonData.cleanerThan) {
    score += (carbonData.cleanerThan / 100) * 5;
  }
  
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  const ranking = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : score >= 30 ? 'E' : 'F';
  
  return { ecoScore: score, ranking };
}

// Analyser un site complet
async function analyzeSite(url) {
  console.log(`Analyse de: ${url}`);
  
  const hostingData = await checkGreenHosting(url);
  const pageWeight = await calculatePageWeight(url);
  const carbonData = calculateCarbon(pageWeight, hostingData.isGreen);
  const scoreData = calculateEcoScore(carbonData, hostingData);
  
  return {
    url,
    ecoScore: scoreData.ecoScore,
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
    ranking: scoreData.ranking,
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
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'Le paramètre "url" est requis.'
      });
    }
    
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        status: 'error',
        message: 'L\'URL fournie n\'est pas valide.'
      });
    }
    
    const cacheKey = `analysis_${url}`;
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult) {
      return res.json({
        status: 'success',
        data: cachedResult,
        cached: true
      });
    }
    
    const result = await analyzeSite(url);
    cache.set(cacheKey, result);
    
    res.json({
      status: 'success',
      data: result,
      cached: false
    });
    
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Une erreur est survenue.'
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
