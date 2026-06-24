import { ID } from "appwrite";
import { Permission, Role } from "appwrite";
import { databases, appwriteConfig } from "../../lib/appwrite";
import useUserStore from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import useCallStore from "../../lib/callStore";

// ─────────────────────────────────────────────────────────────────────────────
// useCallInitiator — handles clicking the 📞 or 📹 button in the chat header
//
// What it does:
//   1. Creates a "call" document in Appwrite (this is the signaling message)
//   2. Sets callStore state to "outgoing" so CallOverlay appears
//
// What it does NOT do:
//   - WebRTC connection (that lives in CallOverlay.jsx)
//   - Receiving calls (that lives in App.jsx global listener)
//
// Usage in Chat.jsx:
//   const { handleCall } = useCallInitiator();
//   <img onClick={() => handleCall("audio")} />
//   <img onClick={() => handleCall("video")} />
// ─────────────────────────────────────────────────────────────────────────────

const useCallInitiator = () => {
  const { currentUser }                    = useUserStore();
  const { user, isCurrentUserBlocked, isReceiverBlocked } = useChatStore();
  const { callState, initiateOutgoing }    = useCallStore();

  const handleCall = async (type) => {
    // Guards
    if (!user || isCurrentUserBlocked || isReceiverBlocked) return;
    if (callState !== "idle") return; // already in a call
    if (!appwriteConfig.callsCollectionId) {
      alert("Calls collection not configured.\nAdd VITE_APPWRITE_CALLS_COLLECTION_ID to .env");
      return;
    }

    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId   = user?.$id || user?.id;

    if (!currentUserId || !otherUserId) {
      alert("Could not start call. User session is missing.");
      return;
    }

    try {
      // Build the signaling document payload
      const callData = {
        callerId:   currentUserId,
        receiverId: otherUserId,
        callerName: (currentUser?.username || "Unknown").slice(0, 100),
        type,                // "audio" | "video"
        status:     "calling",
        ...(currentUser?.avatar ? { callerAvatar: currentUser.avatar.slice(0, 500) } : {}),
      };

      // Try with document-level permissions first
      // If Appwrite is configured with collection-level permissions, fallback without them
      let callDoc;
      try {
        const permissions = [
          Permission.read(Role.user(currentUserId)),
          Permission.read(Role.user(otherUserId)),
          Permission.update(Role.user(currentUserId)),
          Permission.update(Role.user(otherUserId)),
          Permission.delete(Role.user(currentUserId)),
        ];
        callDoc = await databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          ID.unique(),
          callData,
          permissions
        );
      } catch (permErr) {
        console.warn("Call create with doc permissions failed, retrying without:", permErr.message);
        callDoc = await databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          ID.unique(),
          callData
        );
      }

      // Update callStore → triggers CallOverlay to show "Calling..." screen
      initiateOutgoing(callDoc.$id, type, {
        id:     otherUserId,
        name:   user?.username || "Unknown",
        avatar: user?.avatar   || "",
      });

    } catch (err) {
      console.error("Failed to initiate call:", err);
      alert(
        `Could not start call.\n\n${err.message || err}\n\n` +
        "Check Appwrite → calls collection:\n" +
        "• Collection ID matches VITE_APPWRITE_CALLS_COLLECTION_ID\n" +
        "• Attributes: callerId, receiverId, callerName, type, status\n" +
        "• Optional: callerAvatar, offer, answer, callerIce, receiverIce\n" +
        "• Permissions: Users → Create, Read, Update"
      );
    }
  };

  return { handleCall };
};

export default useCallInitiator;
