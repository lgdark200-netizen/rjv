/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { Game, PlayStatus, UserTrackedGame } from './types';
import { CURATED_GAMES, GENRES_LIST, PLATFORMS_LIST } from './data';
import { GameCard } from './components/GameCard';
import { GameDetailModal } from './components/GameDetailModal';
import { 
  Gamepad2, 
  Search, 
} from 'lucide-react';

export default function App() {
  const [sortBy, setSortBy] = useState<string>('default');
  const [activeTab, setActiveTab] = useState<'catalog' | 'stats'>('catalog');
  
  // États pour la synchronisation Steam
  const [steamIdInput, setSteamIdInput] = useState<string>('');
  const [isImportingSteam, setIsImportingSteam] = useState<boolean>(false);

  // États de recherche et de filtres
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('Tous');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('Toutes');

  // État de la modale de détails
  const [activeDetailGame, setActiveDetailGame] = useState<Game | null>(null);

  // Jeux suivis par l'utilisateur (Backlog, En cours, Terminé...)
  const [trackedGames, setTrackedGames] = useState<Record<string, UserTrackedGame>>(() => {
    const saved = localStorage.getItem('reparage_tracked_games_v2');
    return saved ? JSON.parse(saved) : {};
  });

  // Liste globale des jeux (Jeux de base + Jeux importés)
  const [gamesList, setGamesList] = useState<Game[]>(() => {
    const savedGames = localStorage.getItem('reparage_custom_games_list_v2');
    if (savedGames) {
      try {
        const parsed = JSON.parse(savedGames);
        
        // SÉCURITÉ : Si la sauvegarde existe mais est vide ou corrompue, on affiche le catalogue par défaut
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return CURATED_GAMES;
        }

        const customOnly = parsed.filter((g: Game) => g.isCustom);
        
        // Fusion saine avec les jeux de base sans doublons
        const combined = [...CURATED_GAMES];
        customOnly.forEach((customGame: Game) => {
          if (!combined.some((g) => g.id === customGame.id)) {
            combined.push(customGame);
          }
        });
        return combined;
      } catch (e) {
        console.error("Erreur de lecture du localStorage:", e);
        return CURATED_GAMES;
      }
    }
    return CURATED_GAMES;
  });

  // Sauvegarde automatique des jeux suivis
  useEffect(() => {
    localStorage.setItem('reparage_tracked_games_v2', JSON.stringify(trackedGames));
  }, [trackedGames]);

  // Fonction d'importation Steam depuis l'API Back-end
  const handleImportSteam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!steamIdInput.trim()) return;

    setIsImportingSteam(true);
    try {
      const response = await fetch(`http://localhost:3000/api/steam/games?steamId=${steamIdInput.trim()}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erreur lors de l'importation");
      }

      const importedGames: Game[] = await response.json();

      if (importedGames.length === 0) {
        alert("Aucun jeu trouvé. Vérifie que le profil et la visibilité des jeux sont bien publics sur Steam.");
        return;
      }

      setGamesList((prevGames) => {
        const uniqueNewGames = importedGames.filter(
          (newGame) => !prevGames.some((g) => g.id === newGame.id)
        );
        
        const updatedList = [...prevGames, ...uniqueNewGames];
        localStorage.setItem('reparage_custom_games_list_v2', JSON.stringify(updatedList.filter(g => g.isCustom)));
        return updatedList;
      });

      alert(`${importedGames.length} jeux Steam synchronisés avec succès !`);
      setSteamIdInput('');
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setIsImportingSteam(false);
    }
  };

  // Liste des IDs en cours de comparaison
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const handleToggleCompare = (gameId: string) => {
    setCompareIds(prev => 
      prev.includes(gameId) ? prev.filter(id => id !== gameId) : [...prev, gameId]
    );
  };

  // Mises à jour des statuts et détails de suivi d'un jeu
  const handleUpdateTrackDetails = (gameId: string, status: PlayStatus, personalRating?: number, personalNotes?: string) => {
    setTrackedGames(prev => ({
      ...prev,
      [gameId]: {
        gameId,
        status,
        personalRating,
        personalNotes,
        addedAt: prev[gameId]?.addedAt || new Date().toISOString()
      }
    }));
  };

  const handleStatusChange = (gameId: string, status: PlayStatus) => {
    handleUpdateTrackDetails(gameId, status, trackedGames[gameId]?.personalRating, trackedGames[gameId]?.personalNotes);
  };

  const handleRemoveTrack = (gameId: string) => {
    setTrackedGames(prev => {
      const copy = { ...prev };
      delete copy[gameId];
      return copy;
    });
  };

  // Filtrage dynamique des jeux
  const filteredGames = gamesList.filter(game => {
    const matchesSearch = game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          game.developer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = selectedGenre === 'Tous' || game.genres?.includes(selectedGenre);
    const matchesPlatform = selectedPlatform === 'Toutes' || game.platforms?.includes(selectedPlatform);
    return matchesSearch && matchesGenre && matchesPlatform;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyber-green selection:text-black">
      
      {/* HEADER */}
      <header className="border-b border-cyber-darkgreen/20 bg-black/40 backdrop-blur-md sticky top-0 z-40 px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyber-green/10 border border-cyber-green/30 rounded-xl">
              <Gamepad2 className="w-6 h-6 text-cyber-green" />
            </div>
            <div>
              <h1 className="text-xl font-orbitron font-bold tracking-wider text-white">REPARAGE</h1>
              <p className="text-xs font-mono text-cyber-green/70">👾 Catalogue & Suivi Gaming Pro</p>
            </div>
          </div>

          {/* Onglets de Navigation */}
          <div className="flex bg-slate-900/90 p-1 border border-slate-800 rounded-xl">
            <button 
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 text-xs font-orbitron tracking-wide rounded-lg transition-all ${activeTab === 'catalog' ? 'bg-cyber-green text-black font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              Catalogue
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 text-xs font-orbitron tracking-wide rounded-lg transition-all ${activeTab === 'stats' ? 'bg-cyber-green text-black font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              Statistiques
            </button>
          </div>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Module d'importation Steam V2 */}
        <div className="bg-black/60 border border-cyber-darkgreen/30 p-4 rounded-xl max-w-md mb-8">
          <h3 className="text-sm font-orbitron text-cyber-green mb-2 flex items-center gap-2">
            <span>🎮</span> Importation & Synchro Steam (V2.0)
          </h3>
          <form onSubmit={handleImportSteam} className="flex gap-2">
            <input
              type="text"
              placeholder="Entre ton SteamID64 (ex: 76561198000000000)"
              value={steamIdInput}
              onChange={(e) => setSteamIdInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyber-green font-mono"
              disabled={isImportingSteam}
            />
            <button
              type="submit"
              disabled={isImportingSteam || !steamIdInput.trim()}
              className="bg-cyber-green/20 hover:bg-cyber-green/40 text-cyber-green border border-cyber-green px-4 py-1.5 rounded-lg text-xs font-mono transition-all disabled:opacity-50"
            >
              {isImportingSteam ? 'Synchro...' : 'Importer'}
            </button>
          </form>
          <p className="text-[10px] text-slate-500 font-mono mt-1">
            ⚠️ Les paramètres de confidentialité de ton profil Steam doivent être en **Public**.
          </p>
        </div>

        {/* BARRE DE RECHERCHE ET FILTRES */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-slate-900/40 p-4 border border-slate-900 rounded-xl">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Rechercher un jeu, un studio..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyber-green transition-colors"
            />
          </div>

          <div>
            <select 
              value={selectedGenre} 
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyber-green transition-colors"
            >
              {GENRES_LIST.map(genre => <option key={genre} value={genre}>{genre}</option>)}
            </select>
          </div>

          <div>
            <select 
              value={selectedPlatform} 
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyber-green transition-colors"
            >
              {PLATFORMS_LIST.map(platform => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </div>
        </section>

        {/* AFFICHAGE DES JEUX */}
        <section>
          {filteredGames.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredGames.map((game) => (
                <GameCard 
                  key={game.id} 
                  game={game}
                  trackedState={trackedGames[game.id]}
                  onStatusChange={handleStatusChange}
                  onRemoveTrack={handleRemoveTrack}
                  isComparing={compareIds.includes(game.id)}
                  onToggleCompare={handleToggleCompare}
                  onViewDetails={setActiveDetailGame}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-black/40 border border-cyber-darkgreen/30 rounded-2xl p-6">
              <Gamepad2 className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">Aucun résultat</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-mono">
                Aucun jeu de votre catalogue ne correspond à vos filtres combinés. Utilisez le formulaire Steam pour injecter vos nouveautés !
              </p>
            </div>
          )}
        </section>

      </main>

      {/* MODALE DE DÉTAILS */}
      {activeDetailGame && (
        <GameDetailModal
          game={activeDetailGame}
          trackedState={trackedGames[activeDetailGame.id]}
          onClose={() => setActiveDetailGame(null)}
          onUpdateTrack={handleUpdateTrackDetails}
          onRemoveTrack={handleRemoveTrack}
        />
      )}

      {/* FOOTER */}
      <footer className="mt-20 border-t border-cyber-darkgreen/20 bg-black/60 py-6 text-center text-xs text-slate-500 font-mono">
        <p>© 2026 REPARAGE - Tous droits réservés.</p>
      </footer>

    </div>
  );
}