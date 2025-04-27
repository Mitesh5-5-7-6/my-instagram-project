import { cookies } from 'next/headers';
import axios from 'axios';

async function getInstagramMedia(token: string) {
  try {
    const { data } = await axios.get('https://graph.instagram.com/me/media', {
      params: {
        fields: 'id,caption,media_url,thumbnail_url,permalink,timestamp',
        access_token: token,
      },
    });
    return data.data;
  } catch (error) {
    console.error('Error fetching Instagram media:', error);
    return [];
  }
}

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ig_token')?.value;

  if (!token) {
    return (
      <div>
        <p>No Instagram token found. Please <a href="/api/auth/instagram">login with Instagram</a>.</p>
      </div>
    );
  }

  const media = await getInstagramMedia(token);

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* {media.map((item) => (
        <a key={item.id} href={item.permalink} target="_blank" rel="noopener noreferrer">
          <img src={item.thumbnail_url || item.media_url} alt={item.caption || 'Instagram media'} />
        </a>
      ))} */}
    </div>
  );
}
