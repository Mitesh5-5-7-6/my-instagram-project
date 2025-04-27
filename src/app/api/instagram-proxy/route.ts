// app/api/instagram-proxy/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// --- Type Definitions ---

interface RawUserNode {
    username: string;
    full_name: string;
    biography: string;
    profile_pic_url: string;
    profile_pic_url_hd?: string;
    edge_owner_to_timeline_media?: {
        count: number;
        edges: RawEdge[];
    };
    edge_followed_by?: { count: number };
    edge_follow?: { count: number };
}

interface RawEdge {
    node: {
        id: string;
        shortcode: string;
        thumbnail_src: string;
        thumbnail_resources?: { src: string }[];
        display_url: string;
        is_video: boolean;
        taken_at_timestamp: number;
        edge_liked_by?: { count: number };
        edge_media_preview_like?: { count: number };
        edge_media_to_comment?: { count: number };
        edge_media_to_caption?: {
            edges: Array<{ node: { text: string } }>;
        };
    };
}

interface GraphQLResponse {
    data: {
        user: RawUserNode;
    };
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

// --- In-Memory Cache ---

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { data: InstagramUserData; ts: number }>();

function getCachedData(key: string): InstagramUserData | null {
    const rec = cache.get(key);
    if (rec && Date.now() - rec.ts < CACHE_DURATION) {
        return rec.data;
    }
    cache.delete(key);
    return null;
}

// --- Fetch & Transform Logic ---

export async function GET(req: NextRequest) {
    const username = req.nextUrl.searchParams.get('username')?.trim();
    if (!username) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cacheKey = `ig-${username}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
        return NextResponse.json(cached);
    }

    const headers = {
        'User-Agent': req.headers.get('user-agent') || 'InstagramProxy/1.0',
        'Accept': '*/*',
        'x-ig-app-id': '936619743392459',
        ...(process.env.INSTAGRAM_COOKIE ? { Cookie: process.env.INSTAGRAM_COOKIE } : {}),
    };

    try {
        // Typed Axios call avoids any
        const resp = await axios.get<GraphQLResponse>(
            `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
            { headers }
        );
        const user = resp.data.data.user;

        // Transform RawUserNode → InstagramUserData
        const result: InstagramUserData = {
            username: user.username,
            fullName: user.full_name,
            biography: user.biography,
            profilePicture: user.profile_pic_url_hd || user.profile_pic_url,
            postsCount: user.edge_owner_to_timeline_media?.count || 0,
            followersCount: user.edge_followed_by?.count || 0,
            followingCount: user.edge_follow?.count || 0,
            posts: (user.edge_owner_to_timeline_media?.edges || []).map(edge => {
                const n = edge.node;
                return {
                    id: n.id,
                    shortcode: n.shortcode,
                    thumbnailUrl: n.thumbnail_src,
                    displayUrl: n.display_url,
                    isVideo: n.is_video,
                    caption: n.edge_media_to_caption?.edges[0]?.node?.text || '',
                    timestamp: n.taken_at_timestamp,
                    likeCount: n.edge_liked_by?.count || 0,
                    commentCount: n.edge_media_to_comment?.count || 0,
                };
            }),
        };

        cache.set(cacheKey, { data: result, ts: Date.now() });
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Instagram fetch error:', message);
        return NextResponse.json(
            { error: 'Failed to fetch Instagram data', message },
            { status: 500 }
        );
    }
}
