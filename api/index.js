const express = require('express');
const cors = require('cors');
const analyzeRoutes = require('../src/routes/analyze');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS || '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Export pour Vercel
module.exports = app;
