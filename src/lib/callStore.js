import { create } from "zustand";

const useCallStore = create((set) => ({
  // "idle" | "incoming" | "outgoing" | "active"
  callState: "idle",
  callId: null,
  callType: null,       // "audio" | "video"
  remoteUser: null,     // { id, name, avatar }
  isInitiator: false,

  initiateOutgoing: (callId, callType, remoteUser) =>
    set({ callState: "outgoing", callId, callType, remoteUser, isInitiator: true }),

  initIncoming: (callId, callType, remoteUser) =>
    set({ callState: "incoming", callId, callType, remoteUser, isInitiator: false }),

  setActive: () => set({ callState: "active" }),

  endCall: () =>
    set({ callState: "idle", callId: null, callType: null, remoteUser: null, isInitiator: false }),
}));

export default useCallStore;
