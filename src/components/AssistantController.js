/**
 * @fileoverview SmartStadium AI - Assistant Controller (Context-Aware)
 * @description Orchestrates Gemini AI with live stadium business logic.
 * Uses Google Generative Language API (Gemini 1.5 Flash) for AI responses
 * and falls back to a rule-based intent engine for offline resilience.
 * @module AssistantController
 */

/**
 * AssistantController - AI assistant orchestration module.
 * Integrates Gemini AI for natural language responses with a
 * comprehensive fallback engine for offline/error scenarios.
 * Supports voice input/output via Web Speech API.
 * @namespace
 */
const AssistantController = {
    /** @type {string} Google Generative Language API endpoint */
    API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',

    /**
     * Gets an AI response for the given user query.
     * Uses Gemini AI if API key is configured; falls back to rule-based engine.
     * @param {string} query - The user's natural language query
     * @returns {Promise<string>} The AI or fallback response text
     */
    async getResponse(query) {
        const state = window.state;
        const currentId = document.getElementById('stadium-select')?.value || 'ahmedabad';
        const stadium = state?.stadiums?.find(s => s.id === currentId);

        if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.includes('YOUR_')) {
            console.warn('AssistantController: Gemini API Key missing or placeholder. Using fallback engine.');
            const response = this.fallback(query, state, stadium);
            if (this.voiceEnabled) this.speak(response);
            return response;
        }

        const systemPrompt = `
            You are "SmartStadium AI Elite", the ultimate stadium concierge and logistical mastermind.
            Venue: ${stadium?.name || 'the stadium'}
            Live Stats: ${JSON.stringify({ zones: stadium?.zones || [], food: state?.stalls || [], emergency: state?.emergency || {} })}

            CONVICTION & SCOPE:
            1. PERSERVE LIVE DATA: Always use real-time crowd/wait times for navigation and food advice.
            2. GENERAL KNOWLEDGE: Even if data is missing, answer questions about stadium life (Restrooms, Medical, Parking, Wi-Fi, Water) based on general ${stadium?.name || 'stadium'} layouts.
            3. PREDICTIVE WARNINGS: If a gate is >70% crowd, warn the user about upcoming congestion.
            4. VOICE & STYLE: Be helpful, concise (max 2-3 sentences), and multi-lingual (Hinglish/Hindi/English).
            5. FALLBACK: Never say "I don't know" if it's about stadium amenities.
        `;

        try {
            console.log('AssistantController: Fetching Gemini AI response...');
            const res = await fetch(`${this.API_URL}?key=${CONFIG.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: query }] }],
                    generationConfig: {
                        temperature: 0.6,
                        maxOutputTokens: 300,
                        topK: 40
                    }
                })
            });
            const data = await res.json();
            
            let responseText = '';
            if (data.error) {
                console.error('AssistantController: Gemini API Error', data.error);
                responseText = this.fallback(query, state, stadium);
            } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                responseText = data.candidates[0].content.parts[0].text;
            } else {
                responseText = this.fallback(query, state, stadium);
            }

            if (this.voiceEnabled) this.speak(responseText);
            return responseText;
 
        } catch (err) {
            console.error('AssistantController: Network Error', err);
            const fallbackRes = this.fallback(query, state, stadium);
            if (this.voiceEnabled) this.speak(fallbackRes);
            return fallbackRes;
        }
    },

    /** @type {boolean} Whether voice output is enabled */
    voiceEnabled: false,

    /** @type {SpeechRecognition|null} Active speech recognition instance */
    recognition: null,

    /**
     * Speaks the given text using the Web Speech API.
     * Selects the best available English voice automatically.
     * @param {string} text - The text to synthesize
     */
    speak(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        // Attempt to find a natural voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.includes('en') && v.name.includes('Google')) || voices[0];
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
    },

    /**
     * Starts listening for voice input using the Web Speech API.
     * @param {Function|null} onResult - Callback with transcript string on success
     * @param {Function|null} onError - Callback with error string on failure
     * @param {Function|null} onEnd - Callback when recognition ends
     */
    listen(onResult, onError, onEnd) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (onError) onError('Speech Recognition not supported in this browser.');
            return;
        }

        if (!this.recognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-IN'; // Optimized for Hinglish/Indian context
        }

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (onResult) onResult(transcript);
        };

        this.recognition.onerror = (event) => {
            if (onError) onError(event.error);
        };

        this.recognition.onend = () => {
            if (onEnd) onEnd();
        };

        this.recognition.start();
    },

    /**
     * Rule-based fallback engine for handling queries without AI.
     * Covers crowd flow, food, washrooms, medical, and parking intents
     * with Hinglish keyword support.
     * @param {string} query - The user's query
     * @param {Object} state - Current global application state
     * @param {Object|null} stadium - Current stadium object
     * @returns {string} Fallback response text
     */
    fallback(query, state, stadium) {
        const q = query.toLowerCase();
        if (state?.emergency?.active) return '🚨 EMERGENCY: Please follow the red pulse paths on your map for the safest exit.';
        
        // Comprehensive Keyword Mapping (Hinglish Support)
        const intents = [
            {
                keys: ['crowd', 'gate', 'bheed', 'entry', 'exit', 'entry', 'bahar', 'khali'],
                resp: () => {
                    const low = (stadium?.zones?.filter(z => z.type === 'entry') || []).sort((a,b) => a.crowd - b.crowd)[0];
                    return low ? `Logical Advice: Use ${low.name} right now. It is only ${low.crowd}% full. If you wait 20 mins, it might get more crowded.` : 'I suggest checking the Map for green color zones; they have the least crowd right now.';
                }
            },
            {
                keys: ['food', 'hungry', 'stall', 'khana', 'bhuk', 'bhook', 'chai', 'tea', 'coffee', 'pani', 'water', 'cafe'],
                resp: () => {
                    const items = state?.stalls || [];
                    const best = items.sort((a,b) => a.avg_wait - b.avg_wait)[0];
                    if (q.includes('chai') || q.includes('tea') || q.includes('coffee')) {
                        const tea = items.find(i => i.name.toLowerCase().includes('tea') || i.name.toLowerCase().includes('coffee'));
                        return tea ? `Chai/Coffee is available at ${tea.name} (${tea.location}). Wait time is ${tea.avg_wait}m.` : 'Tea stalls are located near the East and West stands.';
                    }
                    return best ? `I recommend ${best.name} at ${best.location}. It's the fastest option right now (${best.avg_wait}m wait).` : "Please check the 'Food' tab for live wait times at all available stalls.";
                }
            },
            {
                keys: ['washroom', 'toilet', 'restroom', 'tatti', 'susu', 'bathroom', 'looo'],
                resp: () => "Washrooms are located near every major Stand. There's a clean facility right behind the North Stand and next to Gate B."
            },
            {
                keys: ['medical', 'doctor', 'hospital', 'chot', 'dard', 'medicine', 'dawai'],
                resp: () => 'Medical assistance is available at the First Aid center located near the Main Entry and Gate 3.'
            },
            {
                keys: ['parking', 'gaadi', 'car', 'bike', 'cycle'],
                resp: () => 'Parking zones are outside Gate A and Gate 1. Follow the on-site signage for availability.'
            }
        ];

        const match = intents.find(intent => intent.keys.some(k => q.includes(k)));
        if (match) return match.resp();

        return 'I am your SmartStadium Assistant. I can help with crowd flow, food lines, washroom locations, or emergency paths. How can I help you have a better experience?';
    }
};

window.AssistantController = AssistantController;

// Allow Jest to instrument this file for coverage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AssistantController };
}
