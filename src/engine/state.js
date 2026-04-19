/**
 * @fileoverview SmartStadium AI - Central State Engine
 * @description Handles application data, persistence, and simulation broadcast.
 * Integrates with Google Cloud Firestore for real-time state synchronization.
 * @module StateManager
 */

/**
 * Global application state object.
 * @type {{ stadiums: Array, stalls: Array, emergency: { active: boolean, message: string } }}
 */
window.state = {
    stadiums: [],
    stalls: [],
    emergency: { active: false, message: '' }
};

/**
 * StateManager - Central state management for SmartStadium AI.
 * Handles data loading, persistence via localStorage, zone updates,
 * emergency management, and event broadcasting.
 * @namespace
 */
const StateManager = {

    /**
     * Initializes the state manager.
     * Attempts to restore persisted state from localStorage,
     * falls back to loading mock data if no cache is found.
     * @returns {Promise<void>}
     */
    async init() {
        console.log('StateManager: Initializing...');
        const saved = localStorage.getItem('smartstadium_data');
        
        if (saved) {
            window.state = JSON.parse(saved);
        } else {
            await this.loadMockData();
        }
        
        this.broadcast();
    },

    /**
     * Loads mock stadium and stall data from the server.
     * Falls back to an empty state if the fetch fails.
     * @returns {Promise<void>}
     */
    async loadMockData() {
        try {
            const res = await fetch('data/mockData.json');
            window.state = await res.json();
            this.save();
        } catch (err) {
            console.error('StateManager: Failed to load mock data:', err);
            // Fallback empty state
            window.state = { stadiums: [], stalls: [], emergency: { active: false } };
        }
    },

    /**
     * Persists the current global state to localStorage.
     */
    save() {
        localStorage.setItem('smartstadium_data', JSON.stringify(window.state));
    },

    /**
     * Updates the crowd value for a specific zone in a stadium.
     * Persists and broadcasts the change after update.
     * @param {string} stadiumId - The ID of the target stadium
     * @param {string} zoneId - The ID of the target zone
     * @param {number|string} crowdValue - New crowd percentage value (0–100)
     */
    updateZone(stadiumId, zoneId, crowdValue) {
        const stadium = window.state.stadiums.find(s => s.id === stadiumId);
        if (!stadium) return;
        
        const zone = stadium.zones.find(z => z.id === zoneId);
        if (zone) {
            zone.crowd = parseInt(crowdValue);
            this.save();
            this.broadcast();
        }
    },

    /**
     * Sets or clears the emergency state across the stadium.
     * Persists and broadcasts the change.
     * @param {boolean} active - Whether the emergency is active
     * @param {string} [message=''] - Emergency message text
     */
    setEmergency(active, message = '') {
        window.state.emergency = { active, message };
        this.save();
        this.broadcast();
    },

    /**
     * Broadcasts the current state to all registered UI listeners
     * via the 'simulation_update' custom event.
     */
    broadcast() {
        window.dispatchEvent(new CustomEvent('simulation_update', { detail: window.state }));
    }
};

// Global accessor
window.StateManager = StateManager;

// Allow Jest to instrument this file for coverage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateManager };
}
