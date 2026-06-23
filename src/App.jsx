import { useEffect } from "react";
import { Query } from "appwrite";
import { account, client, databases, appwriteConfig } from "./lib/appwrite";
import Chat from "./components/chat/Chat";
import Detail from "./components/detail/Detail";
import List from "./components/list/List";
import Login from "./components/login/Login";
import Notification from "./components/notification/Notification";
import CallOverlay from "./components/call/CallOverlay";
import useUserStore from "./lib/userStore";
import { useChatStore } from "./lib/chatStore";
import useCallStore from "./lib/callStore";

const App = () => {
  const { currentUser, isLoading, fetchUserInfo } = useUserStore();
  const { chatId, isDetailOpen } = useChatStore();
  const { initIncoming } = useCallStore();

  // ── Session check on mount ───────────────────────────────────────────
  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentAccount = await account.get();
        fetchUserInfo(currentAccount.$id);
      } catch (error) {
        fetchUserInfo(null);
      }
    };
    checkUser();
  }, [fetchUserInfo]);

  // ── Resilient missed calls checking (poll + focus sync) ──────────────
  useEffect(() => {
    if (!currentUser || !appwriteConfig.callsCollectionId) return;
    const currentUserId = currentUser.$id || currentUser.id;

    const checkActiveCalls = async () => {
      const { callState: activeCallState } = useCallStore.getState();
      if (activeCallState !== "idle") return;

      try {
        const response = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          [
            Query.equal("receiverId", currentUserId),
            Query.equal("status", "calling"),
            Query.orderDesc("$createdAt"),
            Query.limit(1)
          ]
        );

        if (response.documents.length > 0) {
          const doc = response.documents[0];
          const docTime = new Date(doc.$createdAt).getTime();
          const now = Date.now();
          // Only trigger if document was created in the last 45 seconds
          if (now - docTime < 45000) {
            initIncoming(doc.$id, doc.type, {
              id: doc.callerId,
              name: doc.callerName,
              avatar: doc.callerAvatar || "",
            });
          }
        }
      } catch (err) {
        console.warn("Failed checking missed calls:", err.message);
      }
    };

    checkActiveCalls();

    const handleFocus = () => checkActiveCalls();
    window.addEventListener("focus", handleFocus);

    const interval = setInterval(checkActiveCalls, 4000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [currentUser, initIncoming]);

  // ── Listen for incoming calls via Realtime subscription ───────────────
  useEffect(() => {
    if (!currentUser || !appwriteConfig.callsCollectionId) return;
    const currentUserId = currentUser.$id || currentUser.id;

    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.callsCollectionId}.documents`;

    const unsub = client.subscribe(channel, (response) => {
      const doc = response.payload;
      if (!doc) return;

      const isCreated = response.events.some((e) => e.includes(".create"));
      const { callState: activeCallState } = useCallStore.getState();

      if (
        isCreated &&
        doc.status === "calling" &&
        doc.receiverId === currentUserId &&
        doc.callerId !== currentUserId &&
        activeCallState === "idle"
      ) {
        initIncoming(doc.$id, doc.type, {
          id: doc.callerId,
          name: doc.callerName,
          avatar: doc.callerAvatar || "",
        });
      }
    });

    return () => unsub();
  }, [currentUser, initIncoming]);

  if (isLoading) return <div className="loading"></div>;

  return (
    <div className={`container ${chatId ? "chat-active" : ""} ${isDetailOpen ? "detail-active" : ""}`}>
      {currentUser ? (
        <>
          <List />
          {chatId && <Chat />}
          {chatId && <Detail />}
        </>
      ) : (
        <Login />
      )}

      {/* Global call overlay — renders on top of everything */}
      <CallOverlay />
      <Notification />
    </div>
  );
};

export default App;