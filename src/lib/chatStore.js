import { create } from "zustand";
import useUserStore from "./userStore";

export const useChatStore = create((set) => ({
  chatId: null,
  user: null,
  isCurrentUserBlocked: false,
  isReceiverBlocked: false,
  isDetailOpen: false,
  changeChat: (chatId, user) => {
    const currentUser = useUserStore.getState().currentUser;
    if (!currentUser || !user) return;

    const currentUserId = currentUser.$id || currentUser.id;
    const otherUserId = user.$id || user.id;

    // CHECK IF CURRENT USER IS BLOCKED
    if (user.blocked?.includes(currentUserId)) {
      return set({
        chatId,
        user: null,
        isCurrentUserBlocked: true,
        isReceiverBlocked: false,
        isDetailOpen: false,
      });
    }

    // CHECK IF RECEIVER IS BLOCKED
    else if (currentUser.blocked?.includes(otherUserId)) {
      return set({
        chatId,
        user: user,
        isCurrentUserBlocked: false,
        isReceiverBlocked: true,
        isDetailOpen: false,
      });
    } else {
      return set({
        chatId,
        user,
        isCurrentUserBlocked: false,
        isReceiverBlocked: false,
        isDetailOpen: false,
      });
    }
  },

  changeBlock: () => {
    set((state) => ({ ...state, isReceiverBlocked: !state.isReceiverBlocked }));
  },
  toggleDetail: () => {
    set((state) => ({ ...state, isDetailOpen: !state.isDetailOpen }));
  },
  closeDetail: () => {
    set({ isDetailOpen: false });
  },
  resetChat: () => {
    set({
      chatId: null,
      user: null,
      isCurrentUserBlocked: false,
      isReceiverBlocked: false,
      isDetailOpen: false,
    });
  },
}));
