import { storage, appwriteConfig } from "./appwrite";
import { ID } from "appwrite";

const upload = async (file, permissions = []) => {
    try {
        const uploadedFile = await storage.createFile(
            appwriteConfig.bucketId,
            ID.unique(),
            file,
            permissions
        );

        // Get the URL to view the image
        const fileUrl = storage.getFileView(appwriteConfig.bucketId, uploadedFile.$id);
        return fileUrl.toString();
    } catch (error) {
        console.error("Error uploading image:", error);
        throw new Error("Failed to upload image. Please try again.");
    }
};

export default upload;