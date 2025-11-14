import { GoogleGenAI } from "@google/genai";
import { VEO_MODEL } from "../constants";

// Fix: Removed conflicting global declaration for `window.aistudio`.
// The execution environment is expected to provide these types globally,
// and redeclaring them was causing a TypeScript error.

// A simple utility to wait for a certain amount of time
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateVideoFromPrompt(prompt: string): Promise<string> {
    if (!process.env.API_KEY) {
        throw new Error("API key is not configured. Please select an API key.");
    }
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    // Poll for the result
    while (operation && !operation.done) {
      await sleep(10000); // Wait for 10 seconds before checking again
      try {
        operation = await ai.operations.getVideosOperation({operation: operation});
      } catch (e) {
        // If the operation is not found, it might mean it completed or expired.
        // Or if the API key is bad. We can check for a specific error message.
        if (e instanceof Error && e.message.includes("Requested entity was not found")) {
            throw new Error("API Key may be invalid or operation expired. Please try again.");
        }
        throw e; // Re-throw other errors
      }
    }

    if (!operation || !operation.response?.generatedVideos?.[0]?.video?.uri) {
      throw new Error("Video generation failed or returned no URI.");
    }

    const downloadLink = operation.response.generatedVideos[0].video.uri;
    
    // The download link needs the API key to be accessed
    const videoUrlWithKey = `${downloadLink}&key=${process.env.API_KEY}`;
    
    // Fetch the video data, create a Blob, and then a local URL to avoid CORS issues.
    const videoResponse = await fetch(videoUrlWithKey);
    if (!videoResponse.ok) {
        throw new Error(`Failed to download the generated video. Status: ${videoResponse.statusText}`);
    }
    const videoBlob = await videoResponse.blob();
    
    return URL.createObjectURL(videoBlob);
}