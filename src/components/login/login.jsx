import { useState } from "react";
import { toast } from "react-toastify";
import "./login.css"
import { account, databases, appwriteConfig } from "../../lib/appwrite";
import { ID } from "appwrite";
import upload from "../../lib/upload";
import useUserStore from "../../lib/userStore";

const Login = () => {
    const [avatar, setAvatar] = useState({
        file: null,
        url: ""
    })

    const [loading, setLoading] = useState(false)
    const { fetchUserInfo } = useUserStore()

    const handleAvatar = e => {
        if (e.target.files[0]) {
            setAvatar({
            file: e.target.files[0],
            url: URL.createObjectURL(e.target.files[0])
           })
        }
    }

    const handleRegister = async (e) => {
        e.preventDefault()
        setLoading(true);
        const formData = new FormData(e.target);

        const { username, email, password } = Object.fromEntries(formData);
       
        try {
            // 1. Create the user in Appwrite Auth
            const res = await account.create(ID.unique(), email, password, username);
            console.log("User created successfully:", res);

            // 2. Clear old sessions and log the new user in
            try {
                await account.deleteSession("current");
            } catch (err) {
            }
            await account.createEmailPasswordSession(email, password);

            // 3. Upload Avatar to Storage (if the user selected one)
            let imgUrl = "";
            if (avatar.file) {
                imgUrl = await upload(avatar.file);
            }

            // 4. Save the user's profile to the Appwrite Database
            await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.usersCollectionId,
                res.$id, // Using the Auth ID as the Document ID
                {
                    username: username,
                    email: email,
                    id: res.$id,
                    blocked: [],
                    avatar: imgUrl || null
                });

            await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userchatsCollectionId,
                res.$id,
                {
                   chats: [],
                   id: res.$id,
                });

            // Trigger the global state to update so App.jsx switches to Chat!
            await fetchUserInfo(res.$id);
            toast.success("Account created successfully!");
        } catch (error) {
            console.log(error);
            toast.error(error.message)
        } finally {
            setLoading(false);
        }
    }

    
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target);
        const { email, password } = Object.fromEntries(formData);

        try {
            // Clear any stuck sessions before trying to log in
            try {
                await account.deleteSession("current");
            } catch (err) {
            }
            await account.createEmailPasswordSession(email, password);
            
            // Get the current user to find their ID, then update the global store!
            const currentAccount = await account.get();
            await fetchUserInfo(currentAccount.$id);
            
            toast.success("Logged in successfully!");
        } catch (error) {
            console.log(error);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    }

  return (
    <div className='login'>
        <div className="item">
            <h2>Welcome back</h2>
            <form onSubmit={handleLogin}>
                <input type="email" placeholder="Email" name="email" />
                <input type="password" placeholder="Password" name="password" />
                <button disabled={loading}>{loading ? "Loading..." : "Sign in"}</button>
            </form>
        </div>
        <div className="separator"></div>
        <div className="item">
            <h2>Create an Account</h2>
            <form onSubmit={handleRegister}>
                <label htmlFor="file">
                    <img src={avatar.url || "./avatar.png"} alt="" />
                    Upload an image</label>
                <input type="file" id="file" style={{display: "none"}} onChange={handleAvatar}/>
                <input type="text" placeholder="Username" name="username" />
                <input type="email" placeholder="Email" name="email" />
                <input type="password" placeholder="Password" name="password" />
                <button disabled={loading}>{loading ? "Loading..." : "Sign up"}</button>
            </form>
        </div>
    </div>
  )
}

export default Login