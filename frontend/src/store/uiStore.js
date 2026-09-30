import { create } from 'zustand'

export const useUIStore = create((set) => ({
    isTicketModalOpen: false,
    openTicketModal: () => set({ isTicketModalOpen: true }),
    closeTicketModal: () => set({ isTicketModalOpen: false }),

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