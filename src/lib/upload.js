import { storage, appwriteConfig } from "./appwrite";
import { ID } from "appwrite";

const upload = async (file) => {
    try {
        const uploadedFile = await storage.createFile(
            appwriteConfig.bucketId,
            ID.unique(),
            file
        );

        // Get the URL to view the image
        return storage.getFileView(appwriteConfig.bucketId, uploadedFile.$id);
    } catch (error) {
        console.error("Error uploading image:", error);
        throw new Error("Failed to upload image. Please try again.");
    }
};

export default upload;