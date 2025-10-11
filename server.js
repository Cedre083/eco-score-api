require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const analyzeRoutes = require('./src/routes/analyze');

const app = express();

// Middleware
app.use(cors({
  origin: config.corsOrigins
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', analyzeRoutes);

// Route racine
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

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route non trouvée'
  });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err);
  res.status(500).json({
    status: 'error',
    message: 'Erreur interne du serveur'
  });
});

// Démarrage du serveur
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n🌱 Eco-Score Web API démarrée sur le port ${PORT}`);
  console.log(`📊 Endpoints disponibles:`);
  console.log(`   - POST http://localhost:${PORT}/api/analyze`);
  console.log(`   - GET  http://localhost:${PORT}/api/health`);
  console.log(`\n✅ Prêt à analyser des sites web!\n`);
});

module.exports = app;

