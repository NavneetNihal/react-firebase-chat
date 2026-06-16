import "./detail.css"
import { account } from "../../lib/appwrite";
import useUserStore from "../../lib/userStore";
import { toast } from "react-toastify";

const Detail = () => {
  const { fetchUserInfo } = useUserStore();

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
        <img src="./avatar.png" alt="" />
        <h2>Jan Doe</h2>
        <p>Lorem ipsum dolor sit amet.</p>
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
        <button>Block User</button>
        <button className="logout" onClick={handleLogout}>Logout</button>
       </div>
    </div>
  )
}

export default Detail