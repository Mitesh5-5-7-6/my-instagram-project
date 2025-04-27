// app/api/instagram-proxy/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';

type Post = {
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

type InstagramUserData = {
    username: string;
    fullName: string;
    biography: string;
    profilePicture: string;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    posts: Post[];
};

type CacheData = {
    data: InstagramUserData;
    timestamp: number;
};

// Simple in-memory cache
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheData>();

function getCachedData(key: string): InstagramUserData | null {
    if (cache.has(key)) {
        const { data, timestamp } = cache.get(key)!;
        if (Date.now() - timestamp < CACHE_DURATION) {
            return data;
        }
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

    const errors: string[] = [];

    try {
        // Method 1: GraphQL API
        try {
            if (isDebugMode) console.log(`Trying GraphQL API for ${username}`);

            const graphqlResponse = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
                headers: getInstagramHeaders(username),
            });

            if (graphqlResponse.data?.data?.user) {
                const userData = graphqlResponse.data.data.user;
                const processedData = processUserData(userData);

                cache.set(cacheKey, { data: processedData, timestamp: Date.now() });
                return NextResponse.json(processedData);
            }
        } catch (error) {
            const err = error as AxiosError;
            const message = `GraphQL API error: ${err.message}`;
            errors.push(message);
            if (isDebugMode) {
                console.log(message, { status: err.response?.status, data: err.response?.data });
            }
        }

        // Method 2: Alternative API
        try {
            if (isDebugMode) console.log(`Trying alternative API for ${username}`);

            const altResponse = await axios.get(`https://www.instagram.com/${username}/?__a=1&__d=dis`, {
                headers: getInstagramHeaders(username),
            });

            if (altResponse.data?.graphql?.user) {
                const userData = altResponse.data.graphql.user;
                const processedData = processUserData(userData);

                cache.set(cacheKey, { data: processedData, timestamp: Date.now() });
                return NextResponse.json(processedData);
            }
        } catch (error) {
            const err = error as AxiosError;
            const message = `Alternative API error: ${err.message}`;
            errors.push(message);
            if (isDebugMode) {
                console.log(message, { status: err.response?.status, data: err.response?.data });
            }
        }

        // Method 3: Scraping
        try {
            if (isDebugMode) console.log(`Trying HTML scraping for ${username}`);

            const response = await axios.get(`https://www.instagram.com/${username}/`, {
                headers: getInstagramHeaders(username),
            });

            const html = response.data;
            const jsonData = extractInstagramData(html, isDebugMode);

            if (jsonData) {
                cache.set(cacheKey, { data: jsonData, timestamp: Date.now() });
                return NextResponse.json(jsonData);
            } else {
                throw new Error('Could not extract user data from HTML');
            }
        } catch (error) {
            const err = error as Error;
            const message = `HTML scraping error: ${err.message}`;
            errors.push(message);
            if (isDebugMode) {
                console.log(message);
            }
        }

        // If all fail
        return NextResponse.json(
            {
                error: 'Failed to fetch Instagram data',
                username,
                errors,
                message: 'Instagram data extraction failed. The user might be private, not exist, or Instagram changed their API.',
            },
            { status: 500 }
        );
    } catch (error) {
        const err = error as Error;
        console.error('Error in Instagram proxy:', err);
        return NextResponse.json(
            {
                error: 'Instagram proxy error',
                message: err.message,
                username,
                errors: errors.length ? errors : [err.message],
            },
            { status: 500 }
        );
    }
}

// Utility Functions

function getInstagramHeaders(username: string): Record<string, string> {
    return {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
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
    };
}

function processUserData(userData: any): InstagramUserData {
    return {
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
                caption: node.edge_media_to_caption?.edges[0]?.node?.text || '',
                timestamp: node.taken_at_timestamp,
                likeCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                commentCount: node.edge_media_to_comment?.count || 0,
            };
        }),
    };
}

function extractInstagramData(html: string, isDebug = false): InstagramUserData | null {
    const $ = cheerio.load(html);
    const scriptTags = $('script[type="application/ld+json"]');

    for (let i = 0; i < scriptTags.length; i++) {
        const content = $(scriptTags[i]).html();
        if (content) {
            try {
                const json = JSON.parse(content);
                if (json['@type'] === 'Person') {
                    return {
                        username: json.alternateName.replace('@', ''),
                        fullName: json.name,
                        biography: json.description,
                        profilePicture: json.image,
                        postsCount: 0,
                        followersCount: 0,
                        followingCount: 0,
                        posts: [],
                    };
                }
            } catch (error) {
                if (isDebug) console.log('Error parsing JSON-LD:', (error as Error).message);
            }
        }
    }

    return null;
}
