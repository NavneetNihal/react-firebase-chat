import { useState } from "react";
import "./addUser.css";
import { databases, appwriteConfig } from "../../../../lib/appwrite";
import { Query, ID } from "appwrite";
import useUserStore from "../../../../lib/userStore";

const AddUser = ({ setAddMode }) => {
  const [user, setUser] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const { currentUser } = useUserStore();

  const handleSearch = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get("username");

    try {
      const response = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        [Query.equal("username", username)],
      );

      if (response.documents.length > 0) {
        setUser(response.documents[0]);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleAdd = async () => {
    // BLOCK 1: THE SAFETY LOCK
    // Prevent double-clicks while a request is processing
    if (isAdding) return;
    setIsAdding(true);

    try {
      // BLOCK 2: CHECK IF CHAT ALREADY EXISTS
      // Fetch your current chat list to check for duplicates
      const myChatsDoc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        currentUser.id,
      );

      const myParsedChats = myChatsDoc.chats.map((c) => JSON.parse(c));

      const alreadyExists = myParsedChats.some(
        (c) => c.receiverId === user.$id,
      );

      // If yes, stop the function right here.
      if (alreadyExists) {
        console.log(
          "Chat with this user already exists, not creating a new one.",
        );
        setIsAdding(false);
        return;
      }

      // BLOCK 3: CREATE THE NEW CHAT ROOM
      // Tell Appwrite to make a brand new document in the chats collection
      const newChatDoc = await databases.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.chatsCollectionId,
        ID.unique(),
        {
          messages: [],
        },
      );

      const newChatId = newChatDoc.$id;

      // BLOCK 4: UPDATE FRIEND'S CONTACT LIST
      // Create the pointer for the friend (they receive messages from you)
      const friendChatPointer = JSON.stringify({
        chatId: newChatId,
        lastMessage: "",
        receiverId: currentUser.id,
        updatedAt: Date.now(),
      });

      const friendChatsDoc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        user.$id,
      );

      const updatedFriendChats = [...friendChatsDoc.chats, friendChatPointer];

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        user.$id,
        { chats: updatedFriendChats },
      );

      // BLOCK 5: UPDATE YOUR CONTACT LIST
      // Create the pointer for you (you receive messages from them)
      const myChatPointer = JSON.stringify({
        chatId: newChatId,
        lastMessage: "",
        receiverId: user.$id,
        updatedAt: Date.now(),
      });

      const updatedMyChats = [
        ...myParsedChats.map((c) => JSON.stringify(c)),
        myChatPointer,
      ];

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        currentUser.id,
        { chats: updatedMyChats },
      );

      // BLOCK 6: CLEANUP
      // Success! Clear the search result and reset the button.
      console.log("Chat successfully created!");
      setUser(null);
      setAddMode(false);
    } catch (error) {
      console.log(error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="addUser">
      <form onSubmit={handleSearch}>
        <input type="text" placeholder="Username" name="username" />
        <button>Search</button>
      </form>
      {user && (
        <div className="user">
          <div className="detail">
            <img src={user.avatar || "./avatar.png"} alt="" />
            <span>{user.username}</span>
          </div>
          <button onClick={handleAdd} disabled={isAdding}>
            {isAdding ? <div className="loader"></div> : "Add User"}
          </button>
        </div>
      )}
    </div>
  );
};

export default AddUser;
