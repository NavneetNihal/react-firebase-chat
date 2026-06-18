import { useState } from "react";
import { toast } from "react-toastify";
import "./login.css"
import { account, databases, appwriteConfig } from "../../lib/appwrite";
import { ID, Permission, Role } from "appwrite";
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

        if (!username || !email || !password) {
            toast.warn("Please enter inputs!");
            return setLoading(false);
        }
        if (!avatar.file) {
            toast.warn("Please upload an avatar!");
            return setLoading(false);
        }
       
        try {
            const res = await account.create(ID.unique(), email, password, username);
            console.log("User created successfully:", res);

            try {
                await account.deleteSession("current");
            } catch (err) {
            }
            await account.createEmailPasswordSession(email, password);

            let imgUrl = "";
            if (avatar.file) {
                const permissions = [
                    Permission.read(Role.any()),
                    Permission.update(Role.user(res.$id)),
                    Permission.delete(Role.user(res.$id))
                ];
                imgUrl = await upload(avatar.file, permissions);
            }

            await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.usersCollectionId,
                res.$id, 
                {
                    username: username,
                    email: email,
                    id: res.$id,
                    blocked: [],
                    avatar: imgUrl
                });

            await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userchatsCollectionId,
                res.$id,
                {
                   chats: [],
                   id: res.$id,
                });

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
                <button disabled={loading}>{loading ? <div className="loader"></div> : "Sign in"}</button>
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
                <button disabled={loading}>{loading ? <div className="loader"></div> : "Sign up"}</button>
            </form>
        </div>
    </div>
  )
}

export default Login