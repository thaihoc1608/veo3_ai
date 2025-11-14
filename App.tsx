import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Scenario, ScenarioStatus } from './types';
import { generateVideoFromPrompt } from './services/geminiService';
import { LOADING_MESSAGES } from './constants';

// --- Icon Components ---
const SpinnerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

// --- Child Components ---

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}
const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const handleSelectKey = async () => {
    await window.aistudio.openSelectKey();
    onKeySelected();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-8 text-center">
      <h1 className="text-4xl font-bold mb-4 text-indigo-400">Welcome to Veo Video Workflow Builder</h1>
      <p className="text-lg text-gray-300 mb-8 max-w-2xl">
        This application uses the Gemini API to generate videos. To begin, please select a project with an enabled API key.
        Video generation is a billable feature.
      </p>
      <button
        onClick={handleSelectKey}
        className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 transition-transform transform hover:scale-105"
      >
        Select API Key
      </button>
      <a 
        href="https://ai.google.dev/gemini-api/docs/billing" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="mt-6 text-indigo-400 hover:text-indigo-300 underline"
      >
        Learn more about billing
      </a>
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [newPrompt, setNewPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const loadingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setApiKeySelected(true);
      }
    };
    checkApiKey();
  }, []);
  
  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      scenarios.forEach(scenario => {
        if (scenario.videoUrl) {
          URL.revokeObjectURL(scenario.videoUrl);
        }
      });
    };
  }, []);


  useEffect(() => {
    if (isGenerating) {
      loadingIntervalRef.current = window.setInterval(() => {
        setCurrentLoadingMessage(prev => {
          const currentIndex = LOADING_MESSAGES.indexOf(prev);
          const nextIndex = (currentIndex + 1) % LOADING_MESSAGES.length;
          return LOADING_MESSAGES[nextIndex];
        });
      }, 3000);
    } else {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
    }
    return () => {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
      }
    };
  }, [isGenerating]);


  const handleAddScenario = () => {
    const prompts = newPrompt
      .split('\n')
      .map(p => p.trim())
      .filter(p => p); // Filter out empty strings

    if (prompts.length > 0) {
      const newScenarios: Scenario[] = prompts.map(prompt => ({
        id: crypto.randomUUID(),
        prompt: prompt,
        status: ScenarioStatus.Idle,
      }));
      setScenarios(prev => [...prev, ...newScenarios]);
      setNewPrompt('');
    }
  };

  const handleDeleteScenario = (id: string) => {
    setScenarios(prev => {
      const scenarioToDelete = prev.find(scenario => scenario.id === id);
      if (scenarioToDelete?.videoUrl) {
        // Revoke the object URL to free up memory
        URL.revokeObjectURL(scenarioToDelete.videoUrl);
      }
      return prev.filter(scenario => scenario.id !== id);
    });
  };
  
  const handleKeySelected = useCallback(() => {
    setApiKeySelected(true);
  }, []);

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    
    // Create a new array to update states immutably
    let updatedScenarios = [...scenarios];

    for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        if (scenario.status === ScenarioStatus.Completed) continue;

        // Mark as generating
        updatedScenarios = updatedScenarios.map(s => s.id === scenario.id ? { ...s, status: ScenarioStatus.Generating } : s);
        setScenarios(updatedScenarios);

        try {
            const videoUrl = await generateVideoFromPrompt(scenario.prompt);
            updatedScenarios = updatedScenarios.map(s => s.id === scenario.id ? { ...s, status: ScenarioStatus.Completed, videoUrl } : s);
            setScenarios(updatedScenarios);
            if (!selectedVideo) {
                setSelectedVideo(videoUrl);
            }
        } catch (error: any) {
            console.error("Generation failed for scenario:", scenario.id, error);
            const errorMessage = error.message.includes("API Key may be invalid") 
                ? "API Key invalid. Please select a new key."
                : error.message || "An unknown error occurred.";

            updatedScenarios = updatedScenarios.map(s => s.id === scenario.id ? { ...s, status: ScenarioStatus.Error, error: errorMessage } : s);
            setScenarios(updatedScenarios);

            if (errorMessage.includes("API Key invalid")) {
                setApiKeySelected(false);
                break; // Stop generation if key is bad
            }
        }
    }
    setIsGenerating(false);
  };

  if (!apiKeySelected) {
    return <ApiKeySelector onKeySelected={handleKeySelected} />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
            Veo Video Workflow Builder
          </h1>
          <p className="mt-2 text-lg text-gray-400">Build your video, one scene at a time.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Controls and Scenario List */}
          <div className="flex flex-col gap-6">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
              <h2 className="text-xl font-semibold mb-4">Add a New Scenario</h2>
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="e.g., A majestic eagle soaring over a mountain range at sunrise."
                className="w-full h-24 p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                disabled={isGenerating}
              />
              <button
                onClick={handleAddScenario}
                disabled={!newPrompt.trim() || isGenerating}
                className="mt-4 w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 transition"
              >
                Add Scenario
              </button>
            </div>
            
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl flex-grow">
              <h2 className="text-xl font-semibold mb-4">Your Workflow</h2>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                {scenarios.length > 0 ? scenarios.map((scenario, index) => (
                  <div key={scenario.id} className="bg-gray-700 p-4 rounded-md flex items-start gap-4">
                    <div className="text-indigo-400 font-bold text-lg">{index + 1}</div>
                    <div className="flex-grow">
                        <p className="text-gray-200">{scenario.prompt}</p>
                        {scenario.status === ScenarioStatus.Error && <p className="text-red-400 text-sm mt-1">{scenario.error}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      {scenario.status === ScenarioStatus.Idle && <div className="w-5 h-5 border-2 border-gray-500 rounded-full"></div>}
                      {scenario.status === ScenarioStatus.Generating && <SpinnerIcon className="w-5 h-5 text-indigo-400" />}
                      {scenario.status === ScenarioStatus.Completed && <CheckIcon className="w-5 h-5 text-green-400" />}
                      {scenario.status === ScenarioStatus.Error && <WarningIcon className="w-5 h-5 text-red-400" />}
                      <button onClick={() => handleDeleteScenario(scenario.id)} disabled={isGenerating} className="text-gray-500 hover:text-red-500 disabled:text-gray-600 disabled:cursor-not-allowed transition">
                          <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )) : <p className="text-gray-500 text-center py-8">Add a scenario to get started.</p>}
              </div>
            </div>

             <div className="mt-auto">
              {isGenerating ? (
                <div className="text-center p-4 bg-gray-800 rounded-lg">
                    <SpinnerIcon className="w-8 h-8 mx-auto mb-3 text-indigo-400"/>
                    <p className="font-semibold text-lg">Generating Videos...</p>
                    <p className="text-gray-400">{currentLoadingMessage}</p>
                </div>
              ) : (
                <button
                    onClick={handleGenerateAll}
                    disabled={scenarios.length === 0 || scenarios.every(s => s.status === ScenarioStatus.Completed)}
                    className="w-full py-4 px-6 bg-green-600 text-white font-bold text-lg rounded-lg shadow-lg hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 transition-transform transform hover:scale-105"
                >
                    Generate All Videos
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Video Preview */}
          <div className="bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold mb-4 px-2">Preview</h2>
            <div className="flex-grow bg-black rounded-md flex items-center justify-center aspect-video">
                {selectedVideo ? (
                    <video key={selectedVideo} src={selectedVideo} controls autoPlay muted loop className="w-full h-full object-contain rounded-md">
                        Your browser does not support the video tag.
                    </video>
                ) : (
                    <div className="text-center text-gray-500">
                        <p>Your generated video will appear here.</p>
                    </div>
                )}
            </div>
            <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2 px-2">Generated Clips</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {scenarios.filter(s => s.status === ScenarioStatus.Completed && s.videoUrl).map((s, index) => (
                         <button key={s.id} onClick={() => setSelectedVideo(s.videoUrl!)} className={`relative aspect-video rounded-md overflow-hidden focus:outline-none focus:ring-4 ${selectedVideo === s.videoUrl ? 'ring-indigo-500' : 'ring-transparent'}`}>
                            <video src={s.videoUrl} muted className="w-full h-full object-cover"></video>
                            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                                <span className="text-white font-bold text-xl">{index + 1}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;