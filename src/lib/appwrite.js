import { Client, Account, Databases, Storage } from 'appwrite';

export const appwriteConfig = {
    url: import.meta.env.VITE_APPWRITE_URL,
    projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID,
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID,
    usersCollectionId: import.meta.env.VITE_APPWRITE_USERS_COLLECTION_ID,
    chatsCollectionId: import.meta.env.VITE_APPWRITE_CHATS_COLLECTION_ID,
    userchatsCollectionId: import.meta.env.VITE_APPWRITE_USERCHATS_COLLECTION_ID,
    callsCollectionId: import.meta.env.VITE_APPWRITE_CALLS_COLLECTION_ID,
    bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID,
};

export const client = new Client();

client
    .setEndpoint(appwriteConfig.url)
    .setProject(appwriteConfig.projectId);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);