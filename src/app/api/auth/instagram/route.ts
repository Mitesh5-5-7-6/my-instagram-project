// src/app/api/auth/instagram/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    const {
        INSTAGRAM_APP_ID,
        INSTAGRAM_APP_SECRET,
        INSTAGRAM_REDIRECT_URI,
    } = process.env;

    try {
        const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', null, {
            params: {
                client_id: INSTAGRAM_APP_ID,
                client_secret: INSTAGRAM_APP_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: INSTAGRAM_REDIRECT_URI,
                code,
            },
        });

        const { access_token } = tokenRes.data;

        const response = NextResponse.redirect('/');
        response.cookies.set('ig_token', access_token, {
            httpOnly: true,
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return response;
    } catch (error: any) {
        console.error('Token exchange error', error.response?.data || error.message);
        return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
    }
}
