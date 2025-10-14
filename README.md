# Eco-Score Web API

API pour calculer l'empreinte carbone des sites web.

## Déploiement sur Vercel

1. Créez un repository GitHub
2. Uploadez tous les fichiers de ce dossier
3. Connectez le repository à Vercel
4. Ajoutez la variable d'environnement :
   - `CORS_ORIGINS` = `https://votre-site.com`
5. Déployez !

## Endpoints

### GET /
Informations sur l'API

### GET /api/health
Vérification de santé

### POST /api/analyze
Analyse d'une URL

**Body:**
```json
{
  "url": "https://exemple.com"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "url": "https://exemple.com",
    "ecoScore": 85,
    "ranking": "A",
    "carbon": {
      "gramsCO2PerView": 0.52
    },
    "hosting": {
      "isGreen": true
    }
  }
}
```

