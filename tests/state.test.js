/**
 * SmartStadium AI - Unit Tests for StateManager
 */

global.window = {
    state: { stadiums: [], stalls: [], emergency: { active: false } },
    dispatchEvent: jest.fn()
};

global.localStorage = {
    setItem: jest.fn(),
    getItem: jest.fn(() => null)
};

global.CustomEvent = class CustomEvent {
    constructor(name, options) {
        this.name = name;
        this.detail = options.detail;
    }
};

global.fetch = jest.fn();

const { StateManager } = require('../src/engine/state');

describe('SmartStadium StateManager', () => {
    
    beforeEach(() => {
        window.state = {
            stadiums: [{ id: 'ahmedabad', zones: [{ id: 'gate_1', name: 'Gate 1', crowd: 50 }] }],
            stalls: [],
            emergency: { active: false }
        };
        jest.clearAllMocks();
    });

    it('should update zone crowd value', () => {
        StateManager.updateZone('ahmedabad', 'gate_1', 85);
        expect(window.state.stadiums[0].zones[0].crowd).toBe(85);
    });

    it('should NOT update crowd if stadium is not found', () => {
        StateManager.updateZone('invalid_stadium', 'gate_1', 10);
        expect(window.state.stadiums[0].zones[0].crowd).toBe(50);
    });

    it('should NOT update crowd if zone is not found', () => {
        StateManager.updateZone('ahmedabad', 'invalid_zone', 99);
        expect(window.state.stadiums[0].zones[0].crowd).toBe(50);
    });

    it('should set and clear emergency correctly', () => {
        StateManager.setEmergency(true, 'EVACUATE');
        expect(window.state.emergency.active).toBe(true);
        
        StateManager.setEmergency(false, '');
        expect(window.state.emergency.active).toBe(false);
    });

    it('should restore state from localStorage on init()', async () => {
        global.localStorage.getItem.mockReturnValue(JSON.stringify({ stadiums: [{ id: 'wankhede' }] }));
        await StateManager.init();
        expect(window.state.stadiums[0].id).toBe('wankhede');
    });

    it('should load mock data if localStorage is empty and fetch succeeds', async () => {
        global.localStorage.getItem.mockReturnValue(null);
        global.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ stadiums: [{ id: 'mocked_stadium' }] })
        });
        await StateManager.init();
        expect(global.fetch).toHaveBeenCalledWith('data/mockData.json');
        expect(window.state.stadiums[0].id).toBe('mocked_stadium');
    });

    it('should handle loadMockData fetch failure gracefully', async () => {
        global.localStorage.getItem.mockReturnValue(null);
        global.fetch.mockRejectedValue(new Error('Network Error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await StateManager.init();
        
        expect(consoleSpy).toHaveBeenCalled();
        expect(window.state).toEqual({ stadiums: [], stalls: [], emergency: { active: false } });
        consoleSpy.mockRestore();
    });
});
