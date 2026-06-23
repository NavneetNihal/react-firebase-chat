import { useEffect, useState, useRef } from "react";
import useUserStore from "../../../lib/userStore";
import { useChatStore } from "../../../lib/chatStore";
import { databases, client, appwriteConfig } from "../../../lib/appwrite"; 
import "./chatList.css";
import AddUser from "./addUser/AddUser";

import { initAndUnlockAudio, playNotificationSound } from "../../../lib/sound";

if (typeof window !== "undefined") {
  initAndUnlockAudio();
}

const ChatList = () => {
  const [chats, setChats] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [input, setInput] = useState("");
  const { currentUser } = useUserStore();
  const { chatId, changeChat, resetChat } = useChatStore();

  const chatsRef = useRef([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    // Prevent running if user isn't fully loaded yet
    if (!currentUser?.$id && !currentUser?.id) return;

    const currentUserId = currentUser?.$id || currentUser?.id;

    const processChats = async (rawChatsArray) => {
      if (!rawChatsArray || rawChatsArray.length === 0) return [];

      const promises = rawChatsArray.map(async (itemString) => {
        try {
          const item = JSON.parse(itemString);
          const otherUserId = item.receiverId; // More descriptive name for clarity

          const userDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            otherUserId // Use the clearer name to fetch the user
          );

          return { ...item, user: userDoc };
        } catch (error) {
          console.log("Could not fetch user for chat:", error);
          const parsedItem = typeof itemString === 'string' ? JSON.parse(itemString) : itemString;
          return { ...parsedItem, user: null }; 
        }
      });

      const chatData = await Promise.all(promises);

      return chatData.sort((a, b) => b.updatedAt - a.updatedAt);
    };

    const getInitialChats = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userchatsCollectionId,
          currentUserId
        );
        
        console.log("Raw Appwrite chats array:", { chats: doc.chats });

        const processedChats = await processChats(doc.chats);
        setChats(processedChats);
      } catch (error) {
        console.log("Error fetching initial chats:", error);
      }
    };

    getInitialChats();

    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.userchatsCollectionId}.documents.${currentUserId}`;
    
    const unSub = client.subscribe(channel, async (response) => {
      if (response.events.some((e) => e.includes(".update")) || response.events.some((e) => e.includes(".create"))) {
        const payloadChats = response.payload.chats || [];
        const newProcessedChats = await processChats(payloadChats);

        // Check if there is a new unread message in a chat other than the currently active one
        let shouldAlert = false;
        for (const itemString of payloadChats) {
          try {
            const incoming = typeof itemString === "string" ? JSON.parse(itemString) : itemString;
            if (
              incoming && 
              !incoming.isSeen && 
              (incoming.chatId !== useChatStore.getState().chatId || document.hidden || !document.hasFocus())
            ) {
              const existing = chatsRef.current.find((c) => c.chatId === incoming.chatId);
              if (
                !existing || 
                !existing.updatedAt || 
                incoming.updatedAt > existing.updatedAt || 
                incoming.lastMessage !== existing.lastMessage
              ) {
                console.log("New message incoming for chat:", incoming.chatId, "playing alert...");
                shouldAlert = true;
                break;
              }
            }
          } catch {}
        }

        if (shouldAlert) {
          playNotificationSound();
        }

        setChats(newProcessedChats);
      }
    });

    return () => {
      unSub();
    };
  }, [currentUser?.$id, currentUser?.id]);

  const handleSelect = async (chat) => {
    // 1. Immediately change the chat in UI for an instant mobile response
    changeChat(chat.chatId, chat.user);

    const userChats = chats.map((item) => {
      const { user, ...rest } = item;
      return rest;
    });

    const chatIndex = userChats.findIndex(
      (item) => item.chatId === chat.chatId
    );

    if (chatIndex !== -1) {
      userChats[chatIndex].isSeen = true;
      const currentUserId = currentUser?.$id || currentUser?.id;

      try {
        const stringifiedChats = userChats.map((c) => JSON.stringify(c));

        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userchatsCollectionId,
          currentUserId,
          {
            chats: stringifiedChats,
          }
        );
      } catch (err) {
        console.log("Error updating isSeen in Appwrite:", err);
      }
    }
  };

  const handleDelete = async (e, targetChatId, otherUserId) => {
    e.stopPropagation();
    const currentUserId = currentUser?.$id || currentUser?.id;

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
          .filter((c) => c.chatId !== targetChatId)
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
              .filter((c) => c.chatId !== targetChatId)
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
          targetChatId
        );
      } catch (err) {
        console.log("Error deleting chat room document:", err);
      }

      if (chatId === targetChatId) {
        resetChat();
      }
    } catch (err) {
      console.log("Error deleting chat:", err);
    }
  };

  const filteredChats = chats.filter((c) =>
    c.user?.username?.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div className="chatList">
      <div className="search">
        <div className="searchBar">
          <img src="./search.png" alt="" />
          <input
            type="text"
            placeholder="Search"
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <img
          src={addMode ? "./minus.png" : "./plus.png"}
          alt=""
          className="add"
          onClick={() => setAddMode((prev) => !prev)}
        />
      </div>

      {filteredChats.map((chat) => {
        const currentUserId = currentUser?.$id || currentUser?.id;
        const isBlocked = chat.user?.blocked?.includes(currentUserId);

        return (
          <div
            className={`item ${chat.chatId === chatId ? "active" : ""} ${chat.isSeen ? "" : "unread"}`}
            key={chat.chatId}
            onClick={() => handleSelect(chat)}
            style={{
              backgroundColor: chat.chatId === chatId 
                ? "rgba(255, 255, 255, 0.08)" 
                : (chat?.isSeen ? "transparent" : "rgba(81, 131, 254, 0.15)"),
            }}
          >
            <img
              src={
                isBlocked
                  ? "./avatar.png"
                  : chat.user?.avatar || "./avatar.png"
              }
              alt=""
            />
            <div className="texts">
              <span>
                {isBlocked
                  ? "User"
                  : chat.user?.username || "Unknown User"}
              </span>
              <p style={{ color: chat.typing ? "#8bb2ff" : "#e0e0e0", fontWeight: chat.typing ? "bold" : "300" }}>
                {chat.typing ? "💬 Typing..." : chat.lastMessage}
              </p>
            </div>
            <button className="deleteBtn" onClick={(e) => handleDelete(e, chat.chatId, chat.receiverId)}>Delete</button>
          </div>
        );
      })}
      
      {addMode && <AddUser setAddMode={setAddMode} />}
    </div>
  );
};

export default ChatList;