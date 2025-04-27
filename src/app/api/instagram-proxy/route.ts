// app/api/instagram-proxy/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';

// Define proper interfaces for Instagram data
interface InstagramUserData {
    username: string;
    fullName: string;
    biography: string;
    profilePicture: string;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    posts: InstagramPost[];
}

interface InstagramPost {
    id: string;
    shortcode: string;
    thumbnailUrl: string;
    displayUrl: string;
    isVideo: boolean;
    caption: string;
    timestamp: number;
    likeCount: number;
    commentCount: number;
}

interface InstagramEdge<T> {
    node: T;
}

interface InstagramCaption {
    text: string;
}

interface InstagramMediaNode {
    id: string;
    shortcode: string;
    thumbnail_src?: string;
    thumbnail_resources?: Array<{ src: string }>;
    display_url?: string;
    is_video: boolean;
    edge_media_to_caption?: {
        edges: Array<InstagramEdge<InstagramCaption>>;
    };
    taken_at_timestamp?: number;
    edge_liked_by?: { count: number };
    edge_media_preview_like?: { count: number };
    edge_media_to_comment?: { count: number };
}

interface InstagramRawUserData {
    username: string;
    full_name?: string;
    biography?: string;
    profile_pic_url_hd?: string;
    profile_pic_url?: string;
    edge_owner_to_timeline_media?: {
        count?: number;
        edges?: Array<InstagramEdge<InstagramMediaNode>>;
    };
    edge_followed_by?: { count?: number };
    edge_follow?: { count?: number };
}

interface JSONLDInteractionStatistic {
    name: string;
    userInteractionCount: number;
}

interface JSONLDData {
    mainEntityOfPage?: { "@type": string };
    name?: string;
    description?: string;
    image?: string;
    interactionStatistic?: JSONLDInteractionStatistic[];
}

type CacheData = {
    data: InstagramUserData;
    timestamp: number;
};

// Simple in-memory cache
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
const cache = new Map<string, CacheData>();

function getCachedData(key: string): InstagramUserData | null {
    if (cache.has(key)) {
        const { data, timestamp } = cache.get(key)!;
        const now = Date.now();
        if (now - timestamp < CACHE_DURATION) {
            return data;
        }
        // Cache expired
        cache.delete(key);
    }
    return null;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');
    const debug = searchParams.get('debug');
    const isDebugMode = debug === 'true';

    if (!username) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cacheKey = `instagram-${username}`;
    const cachedData = getCachedData(cacheKey);

    if (cachedData) {
        console.log(`Serving cached Instagram data for ${username}`);
        return NextResponse.json(cachedData);
    }

    // Store all potential errors to summarize at the end if all methods fail
    const errors: string[] = [];

    try {
        // Method 1: Try public GraphQL endpoint (most likely to work)
        try {
            if (isDebugMode) {
                console.log(`Attempting Instagram GraphQL API for ${username}`);
            }

            // Use Instagram's GraphQL API with user hash
            const graphqlResponse = await axios.get(
                `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'X-IG-App-ID': '936619743392459', // Public Instagram Web App ID
                        'X-ASBD-ID': '129477',
                        'X-IG-WWW-Claim': '0',
                        'Origin': 'https://www.instagram.com',
                        'Referer': `https://www.instagram.com/${username}/`,
                        'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-origin',
                    },
                }
            );

            if (graphqlResponse.data?.data?.user) {
                const userData = graphqlResponse.data.data.user as InstagramRawUserData;
                const processedData = processUserData(userData);

                cache.set(cacheKey, {
                    data: processedData,
                    timestamp: Date.now(),
                });

                return NextResponse.json(processedData);
            }
        } catch (graphqlError) {
            const error = graphqlError as AxiosError;
            const errorMessage = `GraphQL API error: ${error.message}`;
            errors.push(errorMessage);

            if (isDebugMode) {
                console.log(errorMessage, {
                    status: error.response?.status,
                    data: error.response?.data,
                });
            }
        }

        // Method 2: Try alternative public API endpoint
        try {
            if (isDebugMode) {
                console.log(`Attempting Instagram alternative API for ${username}`);
            }

            const altResponse = await axios.get(`https://www.instagram.com/${username}/?__a=1&__d=dis`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.instagram.com/',
                    'X-IG-App-ID': '936619743392459',
                    'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                }
            });

            interface AltResponseData {
                graphql?: {
                    user: InstagramRawUserData;
                };
            }

            const responseData = altResponse.data as AltResponseData;
            if (responseData && responseData.graphql?.user) {
                const userData = responseData.graphql.user;
                const processedData = processUserData(userData);

                cache.set(cacheKey, {
                    data: processedData,
                    timestamp: Date.now(),
                });

                return NextResponse.json(processedData);
            }
        } catch (altError) {
            const error = altError as AxiosError;
            const errorMessage = `Alternative API error: ${error.message}`;
            errors.push(errorMessage);

            if (isDebugMode) {
                console.log(errorMessage, {
                    status: error.response?.status,
                    data: error.response?.data,
                });
            }
        }

        // Method 3: HTML scraping with improved extraction
        try {
            if (isDebugMode) {
                console.log(`Attempting HTML scraping for ${username}`);
            }

            const response = await axios.get(`https://www.instagram.com/${username}/`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                }
            });

            const html = response.data;

            // Extract JSON data embedded in the page
            const jsonData = extractInstagramData(html, isDebugMode);

            if (jsonData.username) {
                cache.set(cacheKey, {
                    data: jsonData,
                    timestamp: Date.now(),
                });

                return NextResponse.json(jsonData);
            } else {
                throw new Error("Could not extract user data from HTML");
            }
        } catch (htmlError) {
            const error = htmlError as Error;
            const errorMessage = `HTML scraping error: ${error.message}`;
            errors.push(errorMessage);

            if (isDebugMode) {
                console.log(errorMessage);
            }
        }

        // If all methods fail, return an error with all collected error messages
        return NextResponse.json({
            error: 'Failed to fetch Instagram data using any available method',
            username: username,
            errors: errors,
            message: 'Instagram data extraction failed. The user profile might be private, not exist, or Instagram may have updated their API.'
        }, { status: 500 });

    } catch (error) {
        console.error('Error in Instagram proxy:', error);
        const err = error as Error;

        return NextResponse.json({
            error: 'Instagram proxy error',
            message: err.message,
            username: username,
            errors: errors.length > 0 ? errors : [err.message]
        }, { status: 500 });
    }
}

function extractInstagramData(html: string, isDebug: boolean = false): InstagramUserData {
    // Extract JSON data from script tags
    const dataRegexes = [
        // New format shared data
        /<script type="text\/javascript">window\._sharedData = (.+?);<\/script>/,
        // Additional data loader format
        /<script type="text\/javascript">window\.__additionalDataLoaded\('(.+?)',(.+?)\);<\/script>/,
        // New React ServerJS format
        /\["ServerJS","load",\[\],\[(.*?)\]\]/,
        // Look for user data in any script tag
        /<script type="text\/javascript">(?:.+?){"user":({.+?"username":"[^"]+"[^}]+})(?:.+?)<\/script>/,
        // Preloaded state format
        /window\.__PRELOADED_STATE__ = JSON.parse\('(.+?)'\);/,
    ];

    let capturedData: InstagramRawUserData | null = null;

    // Try each regex pattern
    for (const regex of dataRegexes) {
        const match = html.match(regex);
        if (match && (match[1] || match[2])) {
            try {
                // Parse the matching JSON - different regexes capture JSON in different groups
                const jsonStr = match[2] || match[1];
                // Using unknown as initial type until we determine what structure we have
                const jsonData = JSON.parse(jsonStr) as unknown;

                if (isDebug) {
                    console.log('Found potential data with regex:', regex.toString().substring(0, 50));
                }

                // Type guards to check different JSON structures
                if (
                    typeof jsonData === 'object' &&
                    jsonData !== null
                ) {
                    const data = jsonData as Record<string, unknown>;

                    // Check for user data in various formats
                    if (
                        data.entry_data &&
                        typeof data.entry_data === 'object' &&
                        data.entry_data !== null &&
                        'ProfilePage' in data.entry_data
                    ) {
                        const profilePage = (data.entry_data as Record<string, unknown>).ProfilePage;
                        if (Array.isArray(profilePage) && profilePage[0] && typeof profilePage[0] === 'object') {
                            const page = profilePage[0] as Record<string, unknown>;
                            if (page.graphql && typeof page.graphql === 'object' && page.graphql !== null) {
                                const graphql = page.graphql as Record<string, unknown>;
                                if (graphql.user && typeof graphql.user === 'object') {
                                    capturedData = graphql.user as InstagramRawUserData;
                                    break;
                                }
                            }
                        }
                    } else if (data.user && typeof data.user === 'object') {
                        capturedData = data.user as InstagramRawUserData;
                        break;
                    } else if (data.data && typeof data.data === 'object' && data.data !== null && 'user' in data.data) {
                        capturedData = (data.data as Record<string, unknown>).user as InstagramRawUserData;
                        break;
                    } else if (data.graphql && typeof data.graphql === 'object' && data.graphql !== null && 'user' in data.graphql) {
                        capturedData = (data.graphql as Record<string, unknown>).user as InstagramRawUserData;
                        break;
                    } else if (data.items && Array.isArray(data.items)) {
                        // Format for feed responses
                        const userData = findUserData(data);
                        if (userData) {
                            capturedData = userData;
                            break;
                        }
                    }
                }
            } catch (parseError) {
                if (isDebug) {
                    console.error('Error parsing JSON from regex match:', parseError);
                }
                // Continue trying other patterns
            }
        }
    }

    // If we found user data, process it
    if (capturedData) {
        return processUserData(capturedData);
    }

    // If no data from regex, try using cheerio
    const $ = cheerio.load(html);

    // Try to extract basic metadata from the page
    const username = $('meta[property="og:title"]').attr('content')?.split(' • ')[0] ||
        $('meta[property="og:url"]').attr('content')?.split('/').filter(Boolean).pop() || '';
    const profilePicture = $('meta[property="og:image"]').attr('content') || '';

    // Extract JSON-LD data
    const ldJsonScripts = $('script[type="application/ld+json"]').toArray();
    let ldJsonData: JSONLDData | null = null;

    for (const script of ldJsonScripts) {
        try {
            const json = JSON.parse($(script).html() || '{}') as JSONLDData;
            if (json.mainEntityOfPage?.["@type"] === "ProfilePage") {
                ldJsonData = json;
                break;
            }
        } catch {
            // Ignore parsing errors
        }
    }

    if (ldJsonData) {
        const followersStats = ldJsonData.interactionStatistic?.find(stat => stat.name === "Followers");
        const postsStats = ldJsonData.interactionStatistic?.find(stat => stat.name === "Posts");
        const followingStats = ldJsonData.interactionStatistic?.find(stat => stat.name === "Following");

        return {
            username: ldJsonData.name || username || '',
            fullName: ldJsonData.name || '',
            biography: ldJsonData.description || '',
            profilePicture: ldJsonData.image || profilePicture || '',
            postsCount: postsStats?.userInteractionCount || 0,
            followersCount: followersStats?.userInteractionCount || 0,
            followingCount: followingStats?.userInteractionCount || 0,
            posts: [],
        };
    }

    // Return minimal data if extraction failed
    return {
        username: username || '',
        fullName: '',
        biography: '',
        profilePicture: profilePicture || '',
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        posts: [],
    };
}

// Helper function to search for user data in nested objects
function findUserData(obj: Record<string, unknown>, depth: number = 0): InstagramRawUserData | null {
    if (!obj || typeof obj !== 'object' || depth > 5) {
        return null;
    }

    // Check if this object contains user properties
    if (
        'username' in obj && typeof obj.username === 'string' &&
        (
            ('full_name' in obj && typeof obj.full_name === 'string') ||
            ('biography' in obj && typeof obj.biography === 'string') ||
            ('profile_pic_url' in obj && typeof obj.profile_pic_url === 'string')
        )
    ) {
        return obj as unknown as InstagramRawUserData;
    }

    // Look for user objects in nested properties
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                const result = findUserData(obj[key] as Record<string, unknown>, depth + 1);
                if (result) return result;
            }
        }
    }

    return null;
}

// Process user data into a consistent format
function processUserData(userData: InstagramRawUserData): InstagramUserData {
    const posts: InstagramPost[] = [];

    if (userData.edge_owner_to_timeline_media?.edges) {
        for (const edge of userData.edge_owner_to_timeline_media.edges) {
            const node = edge.node;
            posts.push({
                id: node.id,
                shortcode: node.shortcode,
                thumbnailUrl: node.thumbnail_src || node.thumbnail_resources?.[0]?.src || '',
                displayUrl: node.display_url || '',
                isVideo: Boolean(node.is_video),
                caption: node.edge_media_to_caption?.edges[0]?.node?.text || '',
                timestamp: node.taken_at_timestamp || Math.floor(Date.now() / 1000),
                likeCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                commentCount: node.edge_media_to_comment?.count || 0,
            });
        }
    }

    return {
        username: userData.username || '',
        fullName: userData.full_name || '',
        biography: userData.biography || '',
        profilePicture: userData.profile_pic_url_hd || userData.profile_pic_url || '',
        postsCount: userData.edge_owner_to_timeline_media?.count || 0,
        followersCount: userData.edge_followed_by?.count || 0,
        followingCount: userData.edge_follow?.count || 0,
        posts,
    };
}