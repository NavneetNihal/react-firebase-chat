import { Client, Storage } from 'appwrite';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Replace with your endpoint
    .setProject('dummy');               // Replace with your project ID

const storage = new Storage(client);

try {
    const fileUrl = storage.getFileView('dummy_bucket', 'dummy_file');
    console.log("Type of fileUrl:", typeof fileUrl);
    console.log("fileUrl.toString():", fileUrl.toString());
} catch (e) {
    console.error(e);
}
