import { useEffect, useRef, useState } from "react";
import { databases, appwriteConfig, client } from "../../lib/appwrite";
import useUserStore from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";

// ─────────────────────────────────────────────────────────────────────────────
// useTypingStatus — manages the full typing indicator lifecycle
//
// What it handles:
//   OUTGOING (your typing → other user sees it):
//     • Detects keystrokes in the text input
//     • Writes typing:true to OTHER user's userchats doc in Appwrite
//     • Debounces: after 1.8s of no typing → writes typing:false
//     • Clears typing flag when you switch chats or send a message
//
//   INCOMING (other user typing → you see it):
//     • Subscribes to YOUR own userchats doc via Appwrite Realtime
//     • Reads the typing field for the active chat
//     • Returns isOtherUserTyping boolean for the UI to display
//
// Usage in Chat.jsx:
//   const { isOtherUserTyping, handleInputChange, clearTyping } = useTypingStatus();
//
//   <input onChange={handleInputChange} />
//   {isOtherUserTyping && <p>💬 typing...</p>}
//
//   // Call clearTyping() before sending a message to immediately stop the indicator
// ─────────────────────────────────────────────────────────────────────────────

const useTypingStatus = () => {
  const { currentUser }    = useUserStore();
  const { chatId, user }   = useChatStore();

  // ── INCOMING: is the other person typing right now? ───────────────────────
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);

  // ── OUTGOING: are WE currently typing? ────────────────────────────────────
  const typingTimeoutRef = useRef(null);  // debounce timer
  const isTypingRef      = useRef(false); // tracks if we already sent typing:true
  const activeChatRef    = useRef({ chatId, userId: user?.$id || user?.id });

  // ── Subscribe to our own userchats doc to watch for the other user's typing ─
  useEffect(() => {
    const currentUserId = currentUser?.$id || currentUser?.id;
    if (!currentUserId || !chatId) return;

    // Load initial typing state (in case they were already typing when we opened)
    const loadInitialTyping = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userchatsCollectionId,
          currentUserId
        );
        if (doc?.chats) {
          const parsed = doc.chats
            .map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } })
            .filter(Boolean);
          const activeChat = parsed.find((c) => c.chatId === chatId);
          setIsOtherUserTyping(!!activeChat?.typing);
        }
      } catch {}
    };
    loadInitialTyping();

    // Realtime subscription: fires whenever our userchats doc changes
    // (which happens when the other user writes typing:true/false into it)
    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.userchatsCollectionId}.documents.${currentUserId}`;
    const unsub = client.subscribe(channel, (res) => {
      const doc = res.payload;
      if (doc?.chats) {
        const parsed = doc.chats
          .map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } })
          .filter(Boolean);
        const activeChat = parsed.find((c) => c.chatId === chatId);
        setIsOtherUserTyping(!!activeChat?.typing);
      }
    });

    return () => unsub();
  }, [chatId, currentUser]);

  // ── Clear OUR typing flag when we switch away from a chat ─────────────────
  useEffect(() => {
    const prev = activeChatRef.current;
    return () => {
      if (prev.chatId && prev.userId && isTypingRef.current) {
        const prevChatId = prev.chatId;
        const prevUserId = prev.userId;
        // Fire-and-forget: clear the typing flag in the other user's doc
        (async () => {
          try {
            const doc = await databases.getDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userchatsCollectionId,
              prevUserId
            );
            if (doc?.chats) {
              const parsed = doc.chats
                .map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } })
                .filter(Boolean);
              const idx = parsed.findIndex((c) => c.chatId === prevChatId);
              if (idx !== -1 && parsed[idx].typing) {
                parsed[idx].typing = false;
                await databases.updateDocument(
                  appwriteConfig.databaseId,
                  appwriteConfig.userchatsCollectionId,
                  prevUserId,
                  { chats: parsed.map((c) => JSON.stringify(c)) }
                );
              }
            }
          } catch (e) { console.warn("Failed to reset typing on chat swap:", e); }
        })();
      }
    };
  }, [chatId, user]);

  // ── Reset refs when chatId changes (new conversation opened) ──────────────
  useEffect(() => {
    activeChatRef.current = { chatId, userId: user?.$id || user?.id };
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    isTypingRef.current = false;
  }, [chatId, user]);

  // ── Write typing:true/false to the OTHER user's userchats doc ─────────────
  const updateTypingStatus = async (typingVal) => {
    const otherUserId   = user?.$id || user?.id;
    const currentUserId = currentUser?.$id || currentUser?.id;
    if (!otherUserId || !chatId || !currentUserId) return;
    try {
      const doc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        otherUserId
      );
      if (doc?.chats) {
        const parsed = doc.chats
          .map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } })
          .filter(Boolean);
        const idx = parsed.findIndex((c) => c.chatId === chatId);
        if (idx !== -1) {
          if (parsed[idx].typing === typingVal) return; // already correct, skip write
          parsed[idx].typing = typingVal;
          await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userchatsCollectionId,
            otherUserId,
            { chats: parsed.map((c) => JSON.stringify(c)) }
          );
        }
      }
    } catch (err) { console.warn("Error updating typing status:", err.message); }
  };

  // ── Called on every text input keystroke ─────────────────────────────────
  // Wrapped in a closure so Chat.jsx just does: onChange={handleInputChange}
  // The actual setText is passed in so this hook doesn't own the text state
  const handleInputChange = (e, setText) => {
    setText(e.target.value);

    // Send typing:true on first keystroke only (avoid spamming Appwrite)
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      updateTypingStatus(true);
    }

    // Reset the debounce timer on every keystroke
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      updateTypingStatus(false);
    }, 1800);
  };

  // ── Call this before sending a message to immediately kill typing indicator ─
  const clearTyping = () => {
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    isTypingRef.current = false;
    updateTypingStatus(false);
  };

  return {
    isOtherUserTyping,  // boolean — show "💬 typing..." in the UI
    handleInputChange,  // (e, setText) — wire to text <input onChange>
    clearTyping,        // () — call before sending a message
  };
};

export default useTypingStatus;
