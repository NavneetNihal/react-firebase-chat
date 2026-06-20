import "./detail.css"
import { account, databases, appwriteConfig } from "../../lib/appwrite";
import useUserStore from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import { toast } from "react-toastify";

const Detail = () => {
  const { currentUser, fetchUserInfo } = useUserStore();
  const { user, isCurrentUserBlocked, isReceiverBlocked, changeBlock } = useChatStore();

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

  return (
    <div className='detail'>
      <div className="user">
        <img src={user?.avatar || "./avatar.png"} alt="" />
        <h2>{user?.username || "User"}</h2>
        <p>{user?.status || "Available"}</p>
      </div>
      {/* Info Section */}
      <div className="info">
        <div className="option">
          <div className="title">
            <span>Chat Setting</span>
            <img src="./arrowUp.png" alt="" />
          </div>
        </div>
        <div className="option">
          <div className="title">
            <span>Privacy & help</span>
            <img src="./arrowUp.png" alt="" />
          </div>
        </div>
        <div className="option">
          <div className="title">
            <span>Shared Photos</span>
            <img src="./arrowDown.png" alt="" />
          </div>
          <div className="photos">
            <div className="photoItem">
               <div className="photoDetail">
                 <img src="https://images.pexels.com/photos/5210513/pexels-photo-5210513.jpeg" alt="" />
                 <span>photo_2026_2.png</span>
                </div>
               <img src="./download.png" alt="" className="icon"/>
            </div>
            <div className="photoItem">
               <div className="photoDetail">
                 <img src="https://images.pexels.com/photos/5210513/pexels-photo-5210513.jpeg" alt="" />
                 <span>photo_2026_2.png</span>
               </div>
               <img src="./download.png" alt="" className="icon"/>
            </div>
            <div className="photoItem">
               <div className="photoDetail">
                 <img src="https://images.pexels.com/photos/5210513/pexels-photo-5210513.jpeg" alt="" />
                 <span>photo_2026_2.png</span>
               </div>
               <img src="./download.png" alt="" className="icon"/>
            </div>
          </div>
        </div>
        <div className="option">
          <div className="title">
            <span>Shared Files</span>
            <img src="./arrowUp.png" alt="" />
          </div>
        </div>
        <button onClick={handleBlock}>
          {isCurrentUserBlocked
            ? "You are Blocked!"
            : isReceiverBlocked
            ? "Unblock User"
            : "Block User"}
        </button>
        <button className="logout" onClick={handleLogout}>Logout</button>
       </div>
    </div>
  )
}

export default Detail