/**
 * SmartStadium AI - Simulator Tests
 */

global.window = {
    state: null,
    dispatchEvent: jest.fn()
};

global.localStorage = {
    setItem: jest.fn(),
    getItem: jest.fn(() => null)
};

global.CONFIG = {
    SIMULATION_AUTO_START: false,
    SIMULATION_INTERVAL: 10000
};

// Mock Worker class
global.Worker = class {
    constructor(path) { 
        this.postMessage = jest.fn(); 
        this.path = path;
    }
};
global.window.Worker = global.Worker;

const { SimulationEngine } = require('../src/engine/simulator');

describe('Simulation Engine', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        SimulationEngine.currentPhase = 0;
        SimulationEngine.phaseTick = 0;
        SimulationEngine.worker = null;
        global.window.SimulationEngine = SimulationEngine;
        global.window.state = { stadiums: [], stalls: [], emergency: { active: false } };
        global.localStorage.getItem.mockReturnValue(null);
    });

    it('should increment phaseTick on tick()', () => {
        SimulationEngine.worker = new global.Worker('dummy');
        SimulationEngine.tick();
        expect(SimulationEngine.phaseTick).toBe(1);
    });

    it('should change phase after 12 ticks', () => {
        SimulationEngine.worker = new global.Worker('dummy');
        SimulationEngine.phaseTick = 12;
        SimulationEngine.tick(); // 13th tick changes phase
        expect(SimulationEngine.currentPhase).toBe(1);
        expect(SimulationEngine.phaseTick).toBe(0);
    });

    it('should return correct phase names', () => {
        SimulationEngine.currentPhase = 0;
        expect(SimulationEngine.getPhaseName()).toContain('Entry');
        SimulationEngine.currentPhase = 1;
        expect(SimulationEngine.getPhaseName()).toContain('Match');
        SimulationEngine.currentPhase = 2;
        expect(SimulationEngine.getPhaseName()).toContain('Break');
    });

    it('should do nothing on tick() without state', () => {
        global.window.state = null;
        SimulationEngine.tick();
        expect(SimulationEngine.phaseTick).toBe(0); // unchanged
    });

    it('should cycle phases correctly (0->1->2->0)', () => {
        SimulationEngine.worker = new global.Worker('dummy');
        SimulationEngine.currentPhase = 2;
        SimulationEngine.phaseTick = 12;
        SimulationEngine.tick();
        expect(SimulationEngine.currentPhase).toBe(0); // wraps around
    });

    it('should restore state from localStorage on start if missing', () => {
        global.window.state = null;
        global.localStorage.getItem.mockImplementation((key) => {
            if (key === 'smartstadium_data') return JSON.stringify({ restored: true });
            return null;
        });
        SimulationEngine.start();
        expect(window.state).toEqual({ restored: true });
    });

    it('should restore phase from localStorage on start()', () => {
        global.localStorage.getItem = jest.fn((key) => {
            if (key === 'smartstadium_sim_phase') return '2';
            if (key === 'smartstadium_sim_tick') return '5';
            return null;
        });
        SimulationEngine.start();
        expect(SimulationEngine.currentPhase).toBe(2);
        expect(SimulationEngine.phaseTick).toBe(5);
    });

    it('should initialize worker and handle onmessage', () => {
        SimulationEngine.worker = null;
        SimulationEngine.start();
        expect(SimulationEngine.worker).not.toBeNull();
        
        // Trigger onmessage
        const mockState = { stadiums: [{ test: 1 }] };
        SimulationEngine.worker.onmessage({ data: { state: mockState } });
        expect(window.state).toEqual(mockState);
        expect(global.localStorage.setItem).toHaveBeenCalledWith('smartstadium_data', JSON.stringify(mockState));
        expect(global.window.dispatchEvent).toHaveBeenCalled();
    });

    it('should fallback natively if Worker throws exception', () => {
        const originalWorker = global.Worker;
        const originalWindowWorker = global.window.Worker;
        
        global.Worker = class {
            constructor() { throw new Error('CORS issue'); }
        };
        global.window.Worker = global.Worker;

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        SimulationEngine.start();
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(SimulationEngine.worker).toBeNull();
        
        global.Worker = originalWorker;
        global.window.Worker = originalWindowWorker;
        consoleErrorSpy.mockRestore();
    });

    it('should warn if Worker is not supported', () => {
        const originalWorker = global.Worker;
        const originalWindowWorker = global.window.Worker;
        
        global.Worker = undefined;
        global.window.Worker = undefined;
        
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        SimulationEngine.start();
        expect(consoleWarnSpy).toHaveBeenCalledWith('Web Workers not supported in this browser.');
        
        global.Worker = originalWorker;
        global.window.Worker = originalWindowWorker;
        consoleWarnSpy.mockRestore();
    });

});

describe('Simulation Engine Auto Start', () => {
    it('should auto-start if CONFIG.SIMULATION_AUTO_START is true', () => {
        jest.useFakeTimers();
        global.CONFIG.SIMULATION_AUTO_START = true;
        
        let loadedEngine;
        jest.isolateModules(() => {
            const mod = require('../src/engine/simulator');
            loadedEngine = mod.SimulationEngine;
        });
        
        const spyStart = jest.spyOn(loadedEngine, 'start').mockImplementation(() => {});
        
        jest.advanceTimersByTime(2000);
        expect(spyStart).toHaveBeenCalled();
        jest.clearAllTimers();
        global.CONFIG.SIMULATION_AUTO_START = false;
    });
});
