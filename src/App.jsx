import { useEffect } from "react";
import { account } from "./lib/appwrite";
import Chat from "./components/chat/Chat";
import Detail from "./components/detail/Detail";
import List from "./components/list/List";
import Login from "./components/login/login"
import Notification from "./components/notification/Notification";
import useUserStore from "./lib/userStore";

const App = () => {

  const { currentUser, isLoading, fetchUserInfo } = useUserStore();

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

  if (isLoading) return <div className="loading">Loading...</div>;

  return (
    <div className='container'>

    {
      currentUser ? (
        <>
         <List/>
         <Chat/>
         <Detail/>
        </>
      ) : 
      (
        <Login />
      )}
      <Notification />
    </div>
  )
}

export default App