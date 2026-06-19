import { useEffect, useState } from "react";
import useUserStore from "../../../lib/userStore";
import { databases, client, appwriteConfig } from "../../../lib/appwrite"; 
import "./chatList.css";
import AddUser from "./addUser/AddUser";

const ChatList = () => {
  const [chats, setChats] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const { currentUser } = useUserStore();

  useEffect(() => {
    // Prevent running if user isn't fully loaded yet
    if (!currentUser?.$id) return;

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
          currentUser.$id
        );
        
        console.log("Raw Appwrite chats array:", { chats: doc.chats });

        const processedChats = await processChats(doc.chats);
        setChats(processedChats);
      } catch (error) {
        console.log("Error fetching initial chats:", error);
      }
    };

    getInitialChats();

    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.userchatsCollectionId}.documents.${currentUser.$id}`;
    
    const unSub = client.subscribe(channel, async (response) => {
      // We take the new chats array and run it through our helper function again!
      if (response.events.some((e) => e.includes(".update")) || response.events.some((e) => e.includes(".create"))) {
        const newProcessedChats = await processChats(response.payload.chats);
        setChats(newProcessedChats);
      }
    });

    return () => {
      unSub();
    };
  }, [currentUser?.$id]);

  console.log("Current React chats state:", chats);

  return (
    <div className="chatList">
      <div className="search">
        <div className="searchBar">
          <img src="./search.png" alt="" />
          <input type="text" placeholder="Search" />
        </div>
        <img
          src={addMode ? "./minus.png" : "./plus.png"}
          alt=""
          className="add"
          onClick={() => setAddMode((prev) => !prev)}
        />
      </div>

      {chats.map((chat) => (
        <div className="item" key={chat.chatId}>
          <img src={chat.user?.avatar || "./avatar.png"} alt="" />
          <div className="texts">
            <span>{chat.user?.username || "Unknown User"}</span>
            <p>{chat.lastMessage}</p>
          </div>
        </div>
      ))}
      
      { addMode && <AddUser setAddMode={setAddMode} />}
    </div>
  );
};

export default ChatList;