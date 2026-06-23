import { useState, useEffect } from "react";
import "./detail.css"
import { account, client, databases, appwriteConfig } from "../../lib/appwrite";
import useUserStore from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import { toast } from "react-toastify";
import ProfilePicViewer from "../profilePicViewer/ProfilePicViewer";

const Detail = () => {
  const { currentUser, fetchUserInfo } = useUserStore();
  const { chatId, user, isCurrentUserBlocked, isReceiverBlocked, changeBlock, resetChat, toggleDetail } = useChatStore();

  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [privacyHelpOpen, setPrivacyHelpOpen] = useState(false);
  const [sharedPhotosOpen, setSharedPhotosOpen] = useState(false);
  const [sharedFilesOpen, setSharedFilesOpen] = useState(false);
  const [chat, setChat] = useState(null);
  const [showPicPreview, setShowPicPreview] = useState(false);

  useEffect(() => {
    if (!chatId) {
      setChat(null);
      return;
    }

    const fetchChat = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.chatsCollectionId,
          chatId
        );
        setChat(doc);
      } catch (err) {
        console.log("Error loading chat in Detail:", err);
      }
    };
    fetchChat();

    // Subscribe to database updates for this specific chat room
    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.chatsCollectionId}.documents.${chatId}`;
    const unSub = client.subscribe(channel, (response) => {
      if (
        response.events.some((e) => e.includes(".update")) ||
        response.events.some((e) => e.includes(".create"))
      ) {
        setChat(response.payload);
      }
    });

    return () => {
      unSub();
    };
  }, [chatId]);

  const sharedPhotos = chat?.messages
    ?.map((msgStr) => {
      try {
        return typeof msgStr === "string" ? JSON.parse(msgStr) : msgStr;
      } catch {
        return null;
      }
    })
    .filter((msg) => msg && msg.img) || [];

  const handleBlock = async () => {
    if (!user) return;

    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId = user?.$id || user?.id;

    try {
      const isBlocked = currentUser.blocked?.includes(otherUserId);
      const updatedBlocked = isBlocked 
        ? currentUser.blocked.filter((id) => id !== otherUserId) 
        : [...(currentUser.blocked || []), otherUserId];

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        currentUserId,
        {
          blocked: updatedBlocked,
        }
      );

      // Mutably update the local store so subsequent clicks work without reloading
      currentUser.blocked = updatedBlocked;
      
      // Tell the UI to update the block status
      changeBlock();

    } catch (err) {
      console.log(err);
      toast.error("Failed to block/unblock user");
    }
  };

  const handleLogout = async () => {
    try {
      await account.deleteSession("current");
      console.log("User signed out successfully");
      toast.success("Logged out successfully!");
      fetchUserInfo(null);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDeleteChat = async () => {
    if (!chatId) return;

    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId = user?.$id || user?.id;

    try {
      // 1. Delete from current user's chats
      const userChatsDoc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        currentUserId
      );

      if (userChatsDoc?.chats) {
        const parsedChats = userChatsDoc.chats.map((c) => {
          try {
            return typeof c === "string" ? JSON.parse(c) : c;
          } catch {
            return null;
          }
        }).filter(Boolean);

        const updatedChats = parsedChats
          .filter((c) => c.chatId !== chatId)
          .map((c) => JSON.stringify(c));

        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userchatsCollectionId,
          currentUserId,
          {
            chats: updatedChats,
          }
        );
      }

      // 2. Delete from other user's chats
      if (otherUserId) {
        try {
          const otherUserChatsDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userchatsCollectionId,
            otherUserId
          );

          if (otherUserChatsDoc?.chats) {
            const parsedOtherChats = otherUserChatsDoc.chats.map((c) => {
              try {
                return typeof c === "string" ? JSON.parse(c) : c;
              } catch {
                return null;
              }
            }).filter(Boolean);

            const updatedOtherChats = parsedOtherChats
              .filter((c) => c.chatId !== chatId)
              .map((c) => JSON.stringify(c));

            await databases.updateDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userchatsCollectionId,
              otherUserId,
              {
                chats: updatedOtherChats,
              }
            );
          }
        } catch (err) {
          console.log("Error deleting chat from other user's list:", err);
        }
      }

      // 3. Delete the chat room document
      try {
        await databases.deleteDocument(
          appwriteConfig.databaseId,
          appwriteConfig.chatsCollectionId,
          chatId
        );
      } catch (err) {
        console.log("Error deleting chat room document:", err);
      }

      toast.success("Chat deleted successfully on both ends!");
      resetChat();
    } catch (err) {
      console.log(err);
      toast.error("Failed to delete chat");
    }
  };

  return (
    <>
    <div className='detail'>
      <div className="backButton" onClick={toggleDetail}>
        <img src="./arrowDown.png" alt="Back" />
      </div>
      <div className="user">
        <img
          src={user?.avatar || "./avatar.png"}
          alt=""
          className="detailAvatar"
          onClick={() => setShowPicPreview(true)}
        />
        <h2>{user?.username || "User"}</h2>
        <p>{user?.status || "Available"}</p>
      </div>
      {/* Info Section */}
      <div className="info">
        <div className="option">
          <div className="title" onClick={() => setChatSettingsOpen((prev) => !prev)}>
            <span>Chat Setting</span>
            <img src={chatSettingsOpen ? "./arrowUp.png" : "./arrowDown.png"} alt="" />
          </div>
          {chatSettingsOpen && (
            <div className="settingDetail" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px 0", fontSize: "14px", color: "#a5a5a5" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Mute Notifications</span>
                <input type="checkbox" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Search in Conversation</span>
                <img src="./search.png" alt="" style={{ width: "18px", height: "18px", opacity: 0.7, cursor: "pointer" }} />
              </div>
            </div>
          )}
        </div>
        <div className="option">
          <div className="title" onClick={() => setPrivacyHelpOpen((prev) => !prev)}>
            <span>Privacy & help</span>
            <img src={privacyHelpOpen ? "./arrowUp.png" : "./arrowDown.png"} alt="" />
          </div>
          {privacyHelpOpen && (
            <div className="privacyDetail" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px 0", fontSize: "14px", color: "#a5a5a5" }}>
              <p>• Chats are end-to-end encrypted on server databases.</p>
              <p>• Media items are stored securely in storage buckets.</p>
              <p style={{ cursor: "pointer", color: "#ff3c5f" }}>• Report User / Block User</p>
            </div>
          )}
        </div>
        <div className="option">
          <div className="title" onClick={() => setSharedPhotosOpen((prev) => !prev)}>
            <span>Shared Photos</span>
            <img src={sharedPhotosOpen ? "./arrowUp.png" : "./arrowDown.png"} alt="" />
          </div>
          {sharedPhotosOpen && (
            <div className="photos">
              {sharedPhotos.length > 0 ? (
                sharedPhotos.map((msg, index) => (
                  <div className="photoItem" key={index}>
                    <div className="photoDetail">
                      <img src={msg.img} alt="" />
                      <span>photo_{index + 1}.png</span>
                    </div>
                    <a href={msg.img} target="_blank" rel="noreferrer" download={`shared_photo_${index + 1}.png`} style={{ display: "flex", alignItems: "center" }}>
                      <img src="./download.png" alt="Download" className="icon"/>
                    </a>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "14px", color: "#a5a5a5", padding: "10px 0" }}>No photos shared yet</div>
              )}
            </div>
          )}
        </div>
        <div className="option">
          <div className="title" onClick={() => setSharedFilesOpen((prev) => !prev)}>
            <span>Shared Files</span>
            <img src={sharedFilesOpen ? "./arrowUp.png" : "./arrowDown.png"} alt="" />
          </div>
          {sharedFilesOpen && (
            <div className="filesDetail" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px 0", fontSize: "14px", color: "#a5a5a5" }}>
              <span>No files shared yet</span>
            </div>
          )}
        </div>
        <div className="buttons">
          <button onClick={handleBlock}>
            {isCurrentUserBlocked
              ? "You are Blocked!"
              : isReceiverBlocked
              ? "Unblock User"
              : "Block User"}
          </button>
          <button className="delete" onClick={handleDeleteChat}>Delete Chat</button>
          <button className="logout" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>

      {showPicPreview && user && (
        <ProfilePicViewer
          src={user?.avatar || "./avatar.png"}
          name={user?.username}
          onClose={() => setShowPicPreview(false)}
        />
      )}
    </>
  );
};

export default Detail;