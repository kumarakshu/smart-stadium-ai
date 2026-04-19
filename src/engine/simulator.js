/**
 * @fileoverview SmartStadium AI - Simulation Engine (Worker Manager)
 * @description Manages the Web Worker for off-thread physics calculations
 * and crowd simulation phase cycling. Integrates with Google Cloud Run.
 * @module SimulationEngine
 */

/**
 * @typedef {Object} SimulationPhase
 * @property {number} ENTRY - Phase 0: Crowd Inflow (Entry)
 * @property {number} MATCH - Phase 1: Match in Progress
 * @property {number} BREAK - Phase 2: Intermission (Break)
 */

/**
 * SimulationEngine - Core crowd simulation controller.
 * Uses Web Workers for off-thread computation and localStorage for state persistence.
 * @namespace
 */
const SimulationEngine = {
    /** @type {number} Current simulation phase index (0-2) */
    currentPhase: 0,

    /** @type {number} Number of ticks elapsed in the current phase */
    phaseTick: 0,

    /** @type {Worker|null} Web Worker instance for off-thread crowd calculations */
    worker: null,

    /**
     * Starts the simulation engine.
     * Restores persisted state and phase from localStorage,
     * initializes the Web Worker, and begins the simulation interval.
     */
    start() {
        console.log('Simulation Engine: Starting Smart Cycle Logic (Worker Mode)...');
        
        // 1. Restore State
        if (!window.state) {
            const rawData = localStorage.getItem('smartstadium_data');
            if (rawData) window.state = JSON.parse(rawData);
        }
        
        // 2. Restore Phase
        const savedPhase = localStorage.getItem('smartstadium_sim_phase');
        if (savedPhase !== null) {
            this.currentPhase = parseInt(savedPhase);
            this.phaseTick = parseInt(localStorage.getItem('smartstadium_sim_tick') || '0');
            console.log(`Restored Simulation Phase: ${this.currentPhase} at tick ${this.phaseTick}`);
        }

        // 3. Initialize Web Worker for off-thread computation
        if (window.Worker) {
            try {
                this.worker = new Worker('src/engine/simulatorWorker.js');
                
                /**
                 * Handle reply from simulation Worker.
                 * Updates global state and persists to localStorage.
                 * @param {MessageEvent} e - Worker message event
                 */
                this.worker.onmessage = (e) => {
                    const { state } = e.data;
                    window.state = state;
                    localStorage.setItem('smartstadium_data', JSON.stringify(state));
                    window.dispatchEvent(new CustomEvent('simulation_update', { detail: state }));
                };
            } catch (err) {
                console.error('Worker initialization failed, fallback disabled for performance.', err);
            }
        } else {
            console.warn('Web Workers not supported in this browser.');
        }
        
        // 4. Run simulation tick on configured interval
        setInterval(() => this.tick(), CONFIG.SIMULATION_INTERVAL || 10000);
    },

    /**
     * Executes a single simulation tick.
     * Increments phaseTick, cycles phases after 12 ticks,
     * persists progress to localStorage, and dispatches to the Worker.
     */
    tick() {
        if (!window.state || !this.worker) return;

        this.phaseTick++;
        
        // Switch phases every 12 ticks (~2 mins if 10s interval)
        if (this.phaseTick > 12) {
            this.currentPhase = (this.currentPhase + 1) % 3;
            this.phaseTick = 0;
            console.log(`Simulation entering Phase: ${this.getPhaseName()}`);
        }

        // Save progress
        localStorage.setItem('smartstadium_sim_phase', this.currentPhase);
        localStorage.setItem('smartstadium_sim_tick', this.phaseTick);

        // Send task to Worker instead of calculating on main thread
        this.worker.postMessage({ 
            state: window.state, 
            currentPhase: this.currentPhase 
        });
    },

    /**
     * Returns the human-readable name for the current simulation phase.
     * @returns {string} Phase name string
     */
    getPhaseName() {
        return ['Crowd Inflow (Entry)', 'Match in Progress', 'Intermission (Break)'][this.currentPhase];
    }
};

if (CONFIG.SIMULATION_AUTO_START) {
    setTimeout(() => SimulationEngine.start(), 1500);
}
window.SimulationEngine = SimulationEngine;

// Allow Jest to instrument this file for coverage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimulationEngine };
}
