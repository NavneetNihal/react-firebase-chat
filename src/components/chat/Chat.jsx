import { useEffect, useRef, useState } from "react";
import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { client, databases, appwriteConfig } from "../../lib/appwrite";
import { Permission, Role } from "appwrite";
import { useChatStore } from "../../lib/chatStore";
import useUserStore from "../../lib/userStore";
import upload from "../../lib/upload";

// Simple helper to replace timeago.js (which is not in dependencies)
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
};

const Chat = () => {
  const [chat, setChat] = useState();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [img, setImg] = useState({
    file: null,
    url: "",
  });

  const { currentUser } = useUserStore();
  const { chatId, user, isCurrentUserBlocked, isReceiverBlocked, toggleDetail, resetChat } = useChatStore();

  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  useEffect(() => {
    if (!chatId) return;

    // 1. Fetch initial data
    const fetchChat = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.chatsCollectionId,
          chatId
        );
        setChat(doc);
      } catch (err) {
        console.log("Error loading chat:", err);
      }
    };
    fetchChat();

    // 2. Real-time subscription
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

  const handleEmoji = (e) => {
    setText((prev) => prev + e.emoji);
  };

  const handleImg = (e) => {
    if (e.target.files[0]) {
      setImg({
        file: e.target.files[0],
        url: URL.createObjectURL(e.target.files[0]),
      });
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (text === "" && !img.file) return;

    setOpen(false);

    let imgUrl = null;
    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId = user?.$id || user?.id;

    try {
      if (img.file) {
        imgUrl = await upload(img.file);
      }

      // 1. Fetch existing chat document
      const chatDoc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.chatsCollectionId,
        chatId
      );

      // 2. Add the new message
      const newMessage = JSON.stringify({
        senderId: currentUserId,
        text,
        createdAt: Date.now(),
        ...(imgUrl && { img: imgUrl }),
      });

      const updatedMessages = [...(chatDoc.messages || []), newMessage];

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.chatsCollectionId,
        chatId,
        {
          messages: updatedMessages,
        }
      );

      // 3. Update both participants' userchats documents
      const userIDs = [currentUserId, otherUserId];

      for (const id of userIDs) {
        try {
          const userChatsDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userchatsCollectionId,
            id
          );

          if (userChatsDoc?.chats) {
            const parsedChats = userChatsDoc.chats.map((c) => {
              try {
                return typeof c === "string" ? JSON.parse(c) : c;
              } catch {
                return null;
              }
            }).filter(Boolean);

            const chatIndex = parsedChats.findIndex((c) => c.chatId === chatId);

            if (chatIndex !== -1) {
              parsedChats[chatIndex].lastMessage = text || "[Image]";
              parsedChats[chatIndex].isSeen = id === currentUserId;
              parsedChats[chatIndex].updatedAt = Date.now();

              const stringifiedChats = parsedChats.map((c) => JSON.stringify(c));

              await databases.updateDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userchatsCollectionId,
                id,
                {
                  chats: stringifiedChats,
                }
              );
            }
          }
        } catch (err) {
          console.error("Error updating userchats for id:", id, err);
        }
      }
    } catch (err) {
      console.log("Error sending message:", err);
    } finally {
      setImg({
        file: null,
        url: "",
      });
      setText("");
      setOpen(false);
    }
  };

  return (
    <div className="chat">
      <div className="top">
        <div className="backButton" onClick={resetChat}>
          <img src="./arrowDown.png" alt="Back" />
        </div>
        <div className="user" onClick={toggleDetail} style={{ cursor: "pointer" }}>
          <img src={user?.avatar || "./avatar.png"} alt="" />
          <div className="texts">
            <span>{user?.username || "User"}</span>
            <p>Lorem ipsum dolor, sit amet.</p>
          </div>
        </div>
        <div className="icons">
          <img src="./phone.png" alt="" />
          <img src="./video.png" alt="" />
          <img src="./info.png" alt="" onClick={toggleDetail} style={{ cursor: "pointer" }} />
        </div>
      </div>
      <div className="center">
        {chat?.messages?.map((msgStr, index) => {
          let message;
          try {
            message = typeof msgStr === "string" ? JSON.parse(msgStr) : msgStr;
          } catch (e) {
            console.error("Failed to parse message:", e);
            return null;
          }

          if (!message) return null;

          const isOwn = message.senderId === (currentUser?.$id || currentUser?.id);

          return (
            <div className={isOwn ? "message own" : "message"} key={index}>
              <div className="texts">
                {message.img && <img src={message.img} alt="" />}
                <p>{message.text}</p>
                <span>{formatTimeAgo(message.createdAt)}</span>
              </div>
            </div>
          );
        })}
        {img.url && (
          <div className="message own">
            <div className="texts">
              <img src={img.url} alt="" style={{ opacity: 0.6, border: "2px dashed #5183fe" }} />
              <p style={{ backgroundColor: "rgba(81, 131, 254, 0.2)", color: "#5183fe", fontSize: "12px", marginTop: "5px", padding: "8px", textAlign: "center", borderRadius: "8px", fontWeight: "bold" }}>
                Preview - Click Send to upload
              </p>
            </div>
          </div>
        )}
        <div ref={endRef}></div>
      </div>
      <form className="bottom" onSubmit={handleSend}>
        <div className="icons">
          <label htmlFor="file">
            <img src="./img.png" alt="" />
          </label>
          <input
            type="file"
            id="file"
            style={{ display: "none" }}
            onChange={handleImg}
          />
          <img src="./camera.png" alt="" />
          <img src="./mic.png" alt="" />
        </div>
        <input
          type="text"
          placeholder={
            isCurrentUserBlocked || isReceiverBlocked
              ? "You cannot send a message"
              : "Type a message..."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isCurrentUserBlocked || isReceiverBlocked}
        />
        <div className="emoji">
          <img
            src="./emoji.png"
            alt=""
            onClick={() => setOpen((prev) => !prev)}
          />
          <div className="picker">
            <EmojiPicker open={open} onEmojiClick={handleEmoji} />
          </div>
        </div>
        <button
          type="submit"
          className="sendButton"
          disabled={isCurrentUserBlocked || isReceiverBlocked}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
