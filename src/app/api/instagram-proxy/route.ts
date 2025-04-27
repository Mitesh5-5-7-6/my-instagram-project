// app/api/instagram-proxy/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

type CacheData = {
    data: any;
    timestamp: number;
};

// Simple in-memory cache
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
const cache = new Map<string, CacheData>();

function getCachedData(key: string) {
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
                const userData = graphqlResponse.data.data.user;
                const processedData = {
                    username: userData.username,
                    fullName: userData.full_name,
                    biography: userData.biography,
                    profilePicture: userData.profile_pic_url_hd || userData.profile_pic_url,
                    postsCount: userData.edge_owner_to_timeline_media?.count || 0,
                    followersCount: userData.edge_followed_by?.count || 0,
                    followingCount: userData.edge_follow?.count || 0,
                    posts: (userData.edge_owner_to_timeline_media?.edges || []).map((edge: any) => {
                        const node = edge.node;
                        return {
                            id: node.id,
                            shortcode: node.shortcode,
                            thumbnailUrl: node.thumbnail_src || node.thumbnail_resources?.[0]?.src,
                            displayUrl: node.display_url,
                            isVideo: node.is_video,
                            caption: node.edge_media_to_caption?.edges[0]?.node?.text || "",
                            timestamp: node.taken_at_timestamp,
                            likeCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                            commentCount: node.edge_media_to_comment?.count || 0,
                        };
                    }),
                };

                cache.set(cacheKey, {
                    data: processedData,
                    timestamp: Date.now(),
                });

                return NextResponse.json(processedData);
            }
        } catch (graphqlError: any) {
            const errorMessage = `GraphQL API error: ${graphqlError.message}`;
            errors.push(errorMessage);

            if (isDebugMode) {
                console.log(errorMessage, {
                    status: graphqlError.response?.status,
                    data: graphqlError.response?.data,
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

            if (altResponse.data && altResponse.data.graphql?.user) {
                const userData = altResponse.data.graphql.user;
                const processedData = {
                    username: userData.username,
                    fullName: userData.full_name,
                    biography: userData.biography,
                    profilePicture: userData.profile_pic_url_hd || userData.profile_pic_url,
                    postsCount: userData.edge_owner_to_timeline_media?.count || 0,
                    followersCount: userData.edge_followed_by?.count || 0,
                    followingCount: userData.edge_follow?.count || 0,
                    posts: (userData.edge_owner_to_timeline_media?.edges || []).map((edge: any) => {
                        const node = edge.node;
                        return {
                            id: node.id,
                            shortcode: node.shortcode,
                            thumbnailUrl: node.thumbnail_src,
                            displayUrl: node.display_url,
                            isVideo: node.is_video,
                            caption: node.edge_media_to_caption?.edges[0]?.node?.text || "",
                            timestamp: node.taken_at_timestamp,
                            likeCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                            commentCount: node.edge_media_to_comment?.count || 0,
                        };
                    }),
                };

                cache.set(cacheKey, {
                    data: processedData,
                    timestamp: Date.now(),
                });

                return NextResponse.json(processedData);
            }
        } catch (altError: any) {
            const errorMessage = `Alternative API error: ${altError.message}`;
            errors.push(errorMessage);

            if (isDebugMode) {
                console.log(errorMessage, {
                    status: altError.response?.status,
                    data: altError.response?.data,
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
        } catch (htmlError: any) {
            const errorMessage = `HTML scraping error: ${htmlError.message}`;
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

    } catch (error: any) {
        console.error('Error in Instagram proxy:', error);

        return NextResponse.json({
            error: 'Instagram proxy error',
            message: error.message,
            username: username,
            errors: errors.length > 0 ? errors : [error.message]
        }, { status: 500 });
    }
}

function extractInstagramData(html: string, isDebug: boolean = false): any {
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

    let capturedData = null;

    // Try each regex pattern
    for (const regex of dataRegexes) {
        const match = html.match(regex);
        if (match && (match[1] || match[2])) {
            try {
                // Parse the matching JSON - different regexes capture JSON in different groups
                const jsonStr = match[2] || match[1];
                const jsonData = JSON.parse(jsonStr);

                if (isDebug) {
                    console.log('Found potential data with regex:', regex.toString().substring(0, 50));
                }

                // Check for user data in various formats
                if (jsonData.entry_data?.ProfilePage?.[0]?.graphql?.user) {
                    capturedData = jsonData.entry_data.ProfilePage[0].graphql.user;
                    break;
                } else if (jsonData.user) {
                    capturedData = jsonData.user;
                    break;
                } else if (jsonData.data?.user) {
                    capturedData = jsonData.data.user;
                    break;
                } else if (jsonData.graphql?.user) {
                    capturedData = jsonData.graphql.user;
                    break;
                } else if (jsonData.items && Array.isArray(jsonData.items)) {
                    // Format for feed responses
                    const userData = findUserData(jsonData);
                    if (userData) {
                        capturedData = userData;
                        break;
                    }
                }
            } catch (e) {
                if (isDebug) {
                    console.error('Error parsing JSON from regex match:', e);
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
    const ldJsonData = $('script[type="application/ld+json"]').toArray()
        .map(script => {
            try {
                return JSON.parse($(script).html() || '{}');
            } catch (e) {
                return null;
            }
        })
        .filter(Boolean)
        .find(json => json.mainEntityOfPage?.["@type"] === "ProfilePage");

    if (ldJsonData) {
        return {
            username: ldJsonData.name || username || '',
            fullName: ldJsonData.name || '',
            biography: ldJsonData.description || '',
            profilePicture: ldJsonData.image || profilePicture || '',
            postsCount: ldJsonData.interactionStatistic?.find((stat: any) => stat.name === "Posts")?.userInteractionCount || 0,
            followersCount: ldJsonData.interactionStatistic?.find((stat: any) => stat.name === "Followers")?.userInteractionCount || 0,
            followingCount: ldJsonData.interactionStatistic?.find((stat: any) => stat.name === "Following")?.userInteractionCount || 0,
            posts: [],
        };
    }

    // Return minimal data if extraction failed
    return {
        username: username || '',
        profilePicture: profilePicture || '',
        posts: [],
    };
}

// Helper function to search for user data in nested objects
function findUserData(obj: any, depth: number = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 5) {
        return null;
    }

    // Check if this object contains user properties
    if (obj.username && (obj.full_name || obj.biography || obj.profile_pic_url)) {
        return obj;
    }

    // Look for user objects in nested properties
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (typeof obj[key] === 'object') {
                const result = findUserData(obj[key], depth + 1);
                if (result) return result;
            }
        }
    }

    return null;
}

// Process user data into a consistent format
function processUserData(userData: any): any {
    return {
        username: userData.username || '',
        fullName: userData.full_name || '',
        biography: userData.biography || '',
        profilePicture: userData.profile_pic_url_hd || userData.profile_pic_url || '',
        postsCount: userData.edge_owner_to_timeline_media?.count || 0,
        followersCount: userData.edge_followed_by?.count || 0,
        followingCount: userData.edge_follow?.count || 0,
        posts: (userData.edge_owner_to_timeline_media?.edges || []).map((edge: any) => {
            const node = edge.node;
            return {
                id: node.id,
                shortcode: node.shortcode,
                thumbnailUrl: node.thumbnail_src || node.thumbnail_resources?.[0]?.src || '',
                displayUrl: node.display_url || '',
                isVideo: Boolean(node.is_video),
                caption: node.edge_media_to_caption?.edges[0]?.node?.text || '',
                timestamp: node.taken_at_timestamp || Math.floor(Date.now() / 1000),
                likeCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                commentCount: node.edge_media_to_comment?.count || 0,
            };
        }),
    };
}