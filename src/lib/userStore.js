import { create } from 'zustand'
import { databases, appwriteConfig } from './appwrite';

const useUserStore = create((set) => ({
  currentUser : null,
  isLoading: true,
  fetchUserInfo: async(id) => {
    if(!id) return set({currentUser: null, isLoading: false})

        try { 
            const doc = await databases.getDocument(
                appwriteConfig.databaseId,
                appwriteConfig.usersCollectionId,
                id
            );
            return set({currentUser: doc, isLoading: false})
        } catch (error) {
            return set({currentUser: null, isLoading: false})
        }
  }
}))

export default useUserStore;