# Eco-Score Web API

API centrale pour calculer l'empreinte carbone des sites web.

## Installation

```bash
npm install
```

## Configuration

Copier le fichier `.env.example` en `.env` et ajuster les paramètres si nécessaire:

```bash
cp .env.example .env
```

## Démarrage

```bash
npm start
```

L'API sera accessible sur `http://localhost:3000`

## Endpoints

### POST /api/analyze

Analyse une URL et retourne son éco-score.

**Corps de la requête:**
```json
{
  "url": "https://www.exemple.com"
}
```

**Réponse:**
```json
{
  "status": "success",
  "data": {
    "url": "https://www.exemple.com",
    "ecoScore": 85,
    "hosting": {
      "isGreen": true,
      "hostedBy": "Green Hosting Provider"
    },
    "carbon": {
      "gramsCO2PerView": 0.52,
      "equivalence": {
        "treesPlanted": 0.00008,
        "kettlesBoiled": 0.03,
        "kmDriven": 0.004
      }
    },
    "ranking": "A",
    "lastAnalyzed": "2025-10-10T14:00:00Z"
  }
}
```

### GET /api/health

Vérifie l'état de santé de l'API.

## Architecture

- `server.js` - Point d'entrée principal
- `config/` - Configuration
- `src/modules/` - Modules métier
- `src/routes/` - Routes Express

## Cache

L'API utilise un cache en mémoire (node-cache) pour stocker les résultats pendant 24 heures.

