import { useState } from "react";
import { toast } from "react-toastify";
import "./login.css"
import { account, databases, appwriteConfig } from "../../lib/appwrite";
import { ID } from "appwrite";

const Login = () => {
    const [avatar, setAvatar] = useState({
        file: null,
        url: ""
    })

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

            // 3. Save the user's profile to the Appwrite Database
            await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.usersCollectionId,
                res.$id, // Using the Auth ID as the Document ID
                {
                    username: username,
                    email: email,
                    id: res.$id,
                    blocked: []
                });

            await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userchatsCollectionId,
                res.$id,
                {
                   chats: [],
                   id: res.$id,
                });

            toast.success("Account created successfully! You can Login Now");
        } catch (error) {
            console.log(error);
            toast.error(error.message)
        }
    }

    
    const handleLogin = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const { email, password } = Object.fromEntries(formData);

        try {
            await account.createEmailPasswordSession(email, password);
            toast.success("Logged in successfully!");
        } catch (error) {
            console.log(error);
            toast.error(error.message);
        }
    }

  return (
    <div className='login'>
        <div className="item">
            <h2>Welcome back</h2>
            <form onSubmit={handleLogin}>
                <input type="email" placeholder="Email" name="email" />
                <input type="password" placeholder="Password" name="password" />
                <button>Sign in</button>
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
                <button>Sign up</button>
            </form>
        </div>
    </div>
  )
}

export default Login