import { create } from 'zustand'

// Preferencia de sonido por navegador; localStorage puede fallar (modo privado): sin él, con sonido
const MUTE_KEY = 'helpdesk-silencio'
const leerSilencio = () => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } }

export const useUIStore = create((set) => ({
    muted: leerSilencio(),
    toggleMuted: () => set((state) => {
        try { localStorage.setItem(MUTE_KEY, state.muted ? '0' : '1') } catch { /* solo dura la sesión */ }
        return { muted: !state.muted }
    }),

    isTicketModalOpen: false,
    openTicketModal: () => set({ isTicketModalOpen: true }),
    closeTicketModal: () => set({ isTicketModalOpen: false }),

    // Centro de notificaciones: cada aviso nuevo (o lectura) sube el contador y la campana recarga
    notifTick: 0,
    bumpNotifications: () => set((state) => ({ notifTick: state.notifTick + 1 })),

    refreshTrigger: 0,
    triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),

    // --- NUEVO: Control de mensajes no leídos ---
    unreadTickets: [],
    addUnreadTicket: (id) => set((state) => ({
        unreadTickets: state.unreadTickets.includes(id) ? state.unreadTickets : [...state.unreadTickets, id]
    })),
    removeUnreadTicket: (id) => set((state) => ({
        unreadTickets: state.unreadTickets.filter(ticketId => ticketId !== id)
    }))
}))