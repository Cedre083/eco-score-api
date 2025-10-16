const axios = require('axios');

// Cache simple
const cache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h

async function checkGreenHosting(url) {
  try {
    const domain = new URL(url).hostname;
    const response = await axios.get(
      `https://api.thegreenwebfoundation.org/greencheck/${domain}`,
      { timeout: 10000 }
     );
    return {
      isGreen: response.data.green || false,
      hostedBy: response.data.hostedby || 'Inconnu'
    };
  } catch (error) {
    return { isGreen: false, hostedBy: 'Inconnu' };
  }
}

async function calculatePageWeight(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      responseType: 'arraybuffer'
    });
    return Buffer.byteLength(response.data);
  } catch (error) {
    return 2 * 1024 * 1024; // 2MB par défaut
  }
}

function calculateCarbon(bytes, isGreen) {
  const megabytes = bytes / (1024 * 1024);
  let gramsCO2 = megabytes * 0.5;
  if (isGreen) gramsCO2 *= 0.5;
  
  return {
    gramsCO2PerView: parseFloat(gramsCO2.toFixed(2)),
    equivalence: {
      treesPlanted: parseFloat((gramsCO2 / 6000).toFixed(5)),
      kettlesBoiled: parseFloat((gramsCO2 / 15).toFixed(2)),
      kmDriven: parseFloat((gramsCO2 / 120).toFixed(3))
    }
  };
}

function calculateScore(carbonData, hostingData) {
  let score = 100;
  const co2 = carbonData.gramsCO2PerView;
  
  if (co2 <= 0.5) score -= co2 * 20;
  else if (co2 <= 1) score -= 10 + (co2 - 0.5) * 40;
  else if (co2 <= 2) score -= 30 + (co2 - 1) * 15;
  else score -= 50;
  
  if (hostingData.isGreen) score += 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  let ranking = 'F';
  if (score >= 90) ranking = 'A';
  else if (score >= 75) ranking = 'B';
  else if (score >= 60) ranking = 'C';
  else if (score >= 45) ranking = 'D';
  else if (score >= 30) ranking = 'E';
  
  return { ecoScore: score, ranking };
}

async function analyzeSite(url) {
  const hosting = await checkGreenHosting(url);
  const weight = await calculatePageWeight(url);
  const carbon = calculateCarbon(weight, hosting.isGreen);
  const score = calculateScore(carbon, hosting);
  
  return {
    url,
    ecoScore: score.ecoScore,
    hosting: {
      isGreen: hosting.isGreen,
      hostedBy: hosting.hostedBy
    },
    carbon: {
      gramsCO2PerView: carbon.gramsCO2PerView,
      equivalence: carbon.equivalence
    },
    ranking: score.ranking,
    pageWeight: weight,
    lastAnalyzed: new Date().toISOString()
  };
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Méthode non autorisée' });
  }
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'Le paramètre "url" est requis.'
      });
    }
    
    // Valider l'URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        status: 'error',
        message: 'L\'URL fournie n\'est pas valide.'
      });
    }
    
    // Vérifier le cache
    const cacheKey = `analysis_${url}`;
    const cached = cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return res.json({
        status: 'success',
        data: cached.data,
        cached: true
      });
    }
    
    // Analyser
    const result = await analyzeSite(url);
    
    // Mettre en cache
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
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
};
