import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY manquant. Mode de secours activé.');
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // API statut de clé
  app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', hasAIKey: !!process.env.GEMINI_API_KEY });
  });

  // API : Récupère des vrais jeux depuis Internet (FreeToGame API)
  app.get('/api/games', async (req, res) => {
    try {
      const response = await fetch('https://www.freetogame.com/api/games');
      if (!response.ok) throw new Error('Erreur API distante');
      const data = await response.json();
      res.json(data.slice(0, 50));
    } catch (e: any) {
      res.status(500).json({ error: 'Erreur proxy', details: e.message });
    }
  });

  // ==========================================
  // NOUVELLE ROUTE : Importation de jeux Steam
  // ==========================================
  app.get('/api/steam/games', async (req, res) => {
    const { steamId } = req.query;

    if (!steamId) {
      return res.status(400).json({ error: "Le paramètre 'steamId' est obligatoire." });
    }

    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Configuration manquante : STEAM_API_KEY n'est pas définie sur le serveur." });
    }

    try {
      // Appel à l'API PlayerService de Valve
      const steamUrl = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=true`;
      
      const response = await fetch(steamUrl);
      if (!response.ok) {
        throw new Error(`Réponse Steam incorrecte (Statut : ${response.status})`);
      }

      const data = await response.json();
      const steamGames = data.response?.games || [];

      // Transformation des données Steam au format de ton application (Interface Game)
      const formattedGames = steamGames.map((game: any) => {
        // Steam fournit la durée globale en minutes -> conversion en heures
        const hours = Math.round(game.playtime_forever / 60);

        return {
          id: `steam-${game.appid}`, // Évite les conflits d'id
          title: game.name,
          developer: "Steam Library",
          releaseYear: "Inconnu",
          genres: ["PC Game"], // L'API basique de Steam ne renvoie pas les genres
          platforms: ["PC"],
          rating: 0, // Pas de note publique par défaut
          imageUrl: game.img_icon_url 
            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
            : "default-game", // Image par défaut si manquante
          shortDescription: `Jeu importé depuis Steam. Temps passé : ${hours} heures.`,
          description: `Ce jeu fait partie de la bibliothèque Steam de l'utilisateur (${steamId}).`,
          playTimeHours: hours,
          difficulty: "Inconnue",
          isCustom: true // Traité comme un jeu ajouté à la main/scouté
        };
      });

      res.json(formattedGames);
    } catch (error: any) {
      console.error("Erreur d'importation Steam:", error.message);
      res.status(500).json({ error: "Impossible de récupérer les jeux Steam. Assurez-vous que le profil est public.", details: error.message });
    }
  });

  // API Scout / Recommandation IA
  app.post('/api/scout', async (req, res) => {
    const { prompt } = req.body;
    const client = getGeminiClient();

    if (!client) {
      return res.status(200).json([
        {
          title: 'Mode Démo (Pas de clé API)',
          developer: 'Studio',
          releaseYear: '2025',
          genres: ['Action'],
          platforms: ['PC'],
          rating: 8.5,
          shortDescription: 'Configurez GEMINI_API_KEY pour activer les vraies suggestions.',
          description: 'L\'IA est en mode de secours.',
          reason: 'Clé absente.',
        },
      ]);
    }

    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Tu es un éclaireur (Scout) de jeux vidéo. L'utilisateur te demande : "${prompt}". Suggère une liste de jeux pertinents sous forme de JSON strict.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                developer: { type: Type.STRING },
                releaseYear: { type: Type.STRING },
                genres: { type: Type.ARRAY, items: { type: Type.STRING } },
                platforms: { type: Type.ARRAY, items: { type: Type.STRING } },
                rating: { type: Type.NUMBER },
                shortDescription: { type: Type.STRING },
                description: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: ['title', 'developer', 'releaseYear', 'genres', 'platforms', 'rating', 'shortDescription', 'description', 'reason'],
            },
          },
        },
      });
      res.json(JSON.parse(response.text || '[]'));
    } catch (e: any) {
      res.status(500).json({ error: 'Erreur IA', details: e.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, () => {
    console.log(`Serveur actif sur http://localhost:${PORT}`);
  });
}

startServer();