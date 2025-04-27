// app/api/instagram-proxy/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// 10-minute in-memory cache
const CACHE_DURATION = 10 * 60 * 1000;
const cache = new Map<string, { data: InstagramUserData; ts: number }>();

/** Instagram profile + posts shape */
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

// Remove Edge runtime; use Node.js default
// export const config = { runtime: 'edge' };

function getCached<T>(key: string): T | null {
    const rec = cache.get(key);
    if (rec && Date.now() - rec.ts < CACHE_DURATION) return rec.data as unknown as T;
    cache.delete(key);
    return null;
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const username = url.searchParams.get('username')?.trim();
    if (!username) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Serve cached if present
    const cacheKey = `ig-${username}`;
    const cached = getCached<InstagramUserData>(cacheKey);
    if (cached) {
        return NextResponse.json(cached);
    }

    // Build headers for GraphQL endpoint
    const headers: Record<string, string> = {
        'User-Agent': req.headers.get('user-agent') || 'InstagramProxy/1.0',
        'Accept': '*/*',
        'x-ig-app-id': '936619743392459',
    };
    // Optionally include real session cookie
    const cookie = process.env.INSTAGRAM_COOKIE;
    if (cookie) headers['Cookie'] = cookie;

    // Fetch profile via Instagram’s i.instagram.com endpoint
    try {
        const resp = await axios.get<{ data: { user: any } }>(
            `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
            { headers }
        );
        const user = resp.data.data.user;
        const result: InstagramUserData = {
            username: user.username,
            fullName: user.full_name,
            biography: user.biography,
            profilePicture: user.profile_pic_url_hd || user.profile_pic_url,
            postsCount: user.edge_owner_to_timeline_media?.count || 0,
            followersCount: user.edge_followed_by?.count || 0,
            followingCount: user.edge_follow?.count || 0,
            posts: (user.edge_owner_to_timeline_media?.edges || []).map((edge: any) => {
                const n = edge.node;
                return {
                    id: n.id,
                    shortcode: n.shortcode,
                    thumbnailUrl: n.thumbnail_src || '',
                    displayUrl: n.display_url || '',
                    isVideo: n.is_video,
                    caption: n.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                    timestamp: n.taken_at_timestamp,
                    likeCount: n.edge_liked_by?.count || 0,
                    commentCount: n.edge_media_to_comment?.count || 0,
                };
            }),
        };

        // Cache and respond
        cache.set(cacheKey, { data: result, ts: Date.now() });
        return NextResponse.json(result);
    } catch (e: any) {
        console.error('Instagram fetch error:', e.message);
        return NextResponse.json(
            { error: 'Failed to fetch Instagram data', message: e.message },
            { status: 500 }
        );
    }
}
