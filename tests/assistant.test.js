/**
 * SmartStadium AI - Assistant Controller Tests
 */

// Mock environment
global.window = {
    state: {
        stadiums: [{
            id: 'ahmedabad',
            name: 'Narendra Modi Stadium',
            zones: [
                { id: 'gate_1', name: 'Gate 1', type: 'entry', crowd: 10 },
                { id: 'gate_2', name: 'Gate 2', type: 'entry', crowd: 90 }
            ]
        }],
        stalls: [
            { id: 'c1', name: 'Tea Point', location: 'East Stand', avg_wait: 5 },
            { id: 'f1', name: 'Pizza Hut', location: 'West Stand', avg_wait: 20 }
        ],
        emergency: { active: false }
    }
};

global.CONFIG = { GEMINI_API_KEY: '' };
global.document = { getElementById: () => ({ value: 'ahmedabad' }) };
global.fetch = jest.fn();

const { AssistantController } = require('../src/components/AssistantController');

describe('Assistant Controller Fallbacks', () => {
    let stadium, state;
    beforeEach(() => {
        state = global.window.state;
        stadium = state.stadiums[0];
        state.emergency.active = false;
        jest.clearAllMocks();
    });

    it('should return emergency response if emergency is active', () => {
        state.emergency.active = true;
        const res = AssistantController.fallback('where is the food?', state, stadium);
        expect(res).toContain('EMERGENCY');
    });

    it('should return shortest gate for crowd queries', () => {
        const res = AssistantController.fallback('which gate is empty?', state, stadium);
        expect(res).toContain('Gate 1');
    });

    it('should return shortest wait food stall for general food queries', () => {
        const res = AssistantController.fallback('I am hungry', state, stadium);
        expect(res).toContain('Tea Point');
    });

    it('should return tea stall explicitly for chai queries', () => {
        const res = AssistantController.fallback('need tea', state, stadium);
        expect(res).toContain('Tea Point');
    });

    it('should identify washroom intents', () => {
        const res = AssistantController.fallback('where is the washroom?', state, stadium);
        expect(res).toContain('Washrooms are located');
    });

    it('should fallback gracefully for unknown queries', () => {
        const res = AssistantController.fallback('random random random', state, stadium);
        expect(res).toContain('I am your SmartStadium Assistant');
    });

    it('should handle medical queries', () => {
        expect(AssistantController.fallback('I need a doctor', state, stadium)).toContain('Medical assistance');
    });

    it('should handle parking queries', () => {
        expect(AssistantController.fallback('where can I park my car?', state, stadium)).toContain('Parking');
    });

    it('should handle exit queries in Hindi (bahar)', () => {
        expect(AssistantController.fallback('main bahar jaana chahta hun', state, stadium)).toContain('Gate 1');
    });

    it('should handle coffee query as a beverage intent', () => {
        expect(AssistantController.fallback('I want coffee', state, stadium)).toBeDefined();
    });

    it('should handle water queries', () => {
        expect(AssistantController.fallback('I need pani', state, stadium)).toBeDefined();
    });

    it('should handle crowd/entry query with no stalls info', () => {
        expect(AssistantController.fallback('is there a crowd at gate', state, stadium)).toContain('Gate 1');
    });

    it('should handle fallback when no stadium provided', () => {
        expect(AssistantController.fallback('which gate', state, null)).toBeDefined();
    });
});

describe('Assistant Controller Main Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AssistantController.voiceEnabled = true;
        global.CONFIG.GEMINI_API_KEY = 'REAL_API_KEY';
        // Mock fallback to track it
        jest.spyOn(AssistantController, 'fallback').mockReturnValue('Fallback Text');
        jest.spyOn(AssistantController, 'speak').mockImplementation(() => {});
    });

    it('should use fallback if API_KEY is empty or missing', async () => {
        global.CONFIG.GEMINI_API_KEY = 'YOUR_API_KEY';
        const res = await AssistantController.getResponse('hello');
        expect(AssistantController.fallback).toHaveBeenCalled();
        expect(AssistantController.speak).toHaveBeenCalledWith('Fallback Text');
        expect(res).toBe('Fallback Text');
    });

    it('should fetch from API successfully', async () => {
        global.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                candidates: [{ content: { parts: [{ text: 'API Response' }] } }]
            })
        });
        const res = await AssistantController.getResponse('hello');
        expect(res).toBe('API Response');
        expect(AssistantController.speak).toHaveBeenCalledWith('API Response');
    });

    it('should handle API error response properly', async () => {
        global.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ error: 'Some API error' })
        });
        const res = await AssistantController.getResponse('hello');
        expect(AssistantController.fallback).toHaveBeenCalled();
        expect(res).toBe('Fallback Text');
    });

    it('should handle fetch exception properly', async () => {
        global.fetch.mockRejectedValue(new Error('Network Down'));
        const res = await AssistantController.getResponse('hello');
        expect(AssistantController.fallback).toHaveBeenCalled();
        expect(res).toBe('Fallback Text');
    });

    it('should handle API success but empty candidates', async () => {
        global.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({})
        });
        const res = await AssistantController.getResponse('hello');
        expect(AssistantController.fallback).toHaveBeenCalled();
        expect(res).toBe('Fallback Text');
    });
});

describe('Assistant Controller Voice Listen/Speak', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });
    afterEach(() => {
        delete window.speechSynthesis;
        delete window.SpeechRecognition;
        AssistantController.recognition = null;
    });

    it('should do nothing if speechSynthesis is missing', () => {
        expect(() => AssistantController.speak('test')).not.toThrow();
    });

    it('should use speechSynthesis if available', () => {
        const mockSpeak = jest.fn();
        const mockCancel = jest.fn();
        const mockGetVoices = jest.fn().mockReturnValue([{ lang: 'en-US', name: 'Google US' }]);
        global.window.speechSynthesis = {
            speak: mockSpeak,
            cancel: mockCancel,
            getVoices: mockGetVoices
        };
        global.window.SpeechSynthesisUtterance = class {
            constructor(text) { this.text = text; }
        };
        // Need to make sure SpeechSynthesisUtterance is globally accessible if AssistantController uses new SpeechSynthesisUtterance
        global.SpeechSynthesisUtterance = global.window.SpeechSynthesisUtterance;
        AssistantController.speak('hello');
        expect(mockCancel).toHaveBeenCalled();
        expect(mockSpeak).toHaveBeenCalled();
    });

    it('should handle missing SpeechRecognition', () => {
        const onError = jest.fn();
        AssistantController.listen(null, onError, null);
        expect(onError).toHaveBeenCalledWith('Speech Recognition not supported in this browser.');
    });

    it('should setup SpeechRecognition and trigger callbacks', () => {
        let onresultCallback, onerrorCallback, onendCallback;
        const mockStart = jest.fn();
        
        global.window.SpeechRecognition = class {
            constructor() {
                this.start = mockStart;
            }
            set onresult(cb) { onresultCallback = cb; }
            set onerror(cb) { onerrorCallback = cb; }
            set onend(cb) { onendCallback = cb; }
        };

        const onResult = jest.fn();
        const onError = jest.fn();
        const onEnd = jest.fn();

        AssistantController.listen(onResult, onError, onEnd);
        expect(mockStart).toHaveBeenCalled();

        if(onresultCallback) onresultCallback({ results: [[{ transcript: 'test voice' }]] });
        expect(onResult).toHaveBeenCalledWith('test voice');

        if(onerrorCallback) onerrorCallback({ error: 'network' });
        expect(onError).toHaveBeenCalledWith('network');

        if(onendCallback) onendCallback();
        expect(onEnd).toHaveBeenCalled();
    });
});
