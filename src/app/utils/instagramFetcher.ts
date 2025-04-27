// utils/instagramFetcher.ts

// Define the structure of the Instagram data
type InstagramPost = {
    id: string;
    shortcode: string;
    thumbnailUrl: string;
    displayUrl: string;
    isVideo: boolean;
    caption: string;
    timestamp: number;
    likeCount: number;
    commentCount: number;
};

type InstagramData = {
    username: string;
    fullName: string;
    biography: string;
    profilePicture: string;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    posts: InstagramPost[];
};

/**
 * Function to fetch Instagram data via server-side proxy to avoid CORS issues
 */
export async function fetchInstagramData(username: string, debug: boolean = false): Promise<InstagramData> {
    try {
        // Build the URL for the API proxy request
        const url = `/api/instagram-proxy?username=${username}${debug ? '&debug=true' : ''}`;

        // Fetch data from the server-side proxy
        const response = await fetch(url);

        // Check for HTTP errors
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed with status: ${response.status}`);
        }

        // Parse the returned JSON data
        const data: InstagramData = await response.json();

        // Basic validation of the returned data
        if (!data || !data.username) {
            throw new Error('Invalid response data from Instagram API');
        }

        return data;
    } catch (error) {
        console.error("Error fetching Instagram data:", error);
        throw error;
    }
}
