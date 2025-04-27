import { useState, useEffect } from 'react';
import Image from 'next/image';

type InstagramFeedProps = {
    username: string;
    postCount?: number;
    debug?: boolean;
};

type InstagramPost = {
    id: string;
    shortcode: string;
    thumbnailUrl?: string;
    displayUrl: string;
    caption?: string;
    isVideo?: boolean;
    likeCount?: number;
    commentCount?: number;
};

type InstagramProfileData = {
    username: string;
    fullName?: string;
    biography?: string;
    profilePicture?: string;
    postsCount?: number;
    followersCount?: number;
    followingCount?: number;
};

const InstagramFeed = ({ username, postCount = 6, debug = false }: InstagramFeedProps) => {
    const [posts, setPosts] = useState<InstagramPost[]>([]);
    const [profileData, setProfileData] = useState<InstagramProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [errorDetails, setErrorDetails] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                setErrorDetails(null);

                const response = await fetch(`/api/instagram-proxy?username=${username}${debug ? '&debug=true' : ''}`);

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `Failed with status: ${response.status}`);
                }

                const data = await response.json();

                if (!data.username) {
                    throw new Error('Received invalid data from Instagram');
                }

                setProfileData({
                    username: data.username,
                    fullName: data.fullName,
                    biography: data.biography,
                    profilePicture: data.profilePicture,
                    postsCount: data.postsCount,
                    followersCount: data.followersCount,
                    followingCount: data.followingCount,
                });

                setPosts(data.posts && Array.isArray(data.posts) ? data.posts.slice(0, postCount) : []);
            } catch (err) {
                const error = err as Error;
                setError('Failed to load Instagram feed. Please try again later.');
                setErrorDetails(error.message);
            } finally {
                setLoading(false);
            }
        };

        if (username) {
            fetchData();
        }
    }, [username, postCount, debug]);

    if (loading) {
        return (
            <div className="instagram-feed-loading">
                <div className="spinner"></div>
                <p>Loading Instagram feed...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="instagram-feed-error">
                <p>{error}</p>
                {debug && errorDetails && (
                    <details>
                        <summary>Debug Details</summary>
                        <pre>{errorDetails}</pre>
                    </details>
                )}
            </div>
        );
    }

    console.log(profileData)

    return (
        <div className="instagram-feed">
            {profileData && (
                <div className="instagram-profile">
                    <div className="profile-image">
                        {profileData.profilePicture && (
                            <Image
                                src={profileData.profilePicture}
                                alt={`${profileData.username}'s profile`}
                                width={100}
                                height={100}
                                className="rounded-full"
                            />
                        )}
                    </div>
                    <div className="profile-info">
                        <h3 className="profile-username">{profileData.username}</h3>
                        {profileData.fullName && <p className="profile-name">{profileData.fullName}</p>}
                        {profileData.biography && <p className="profile-bio">{profileData.biography}</p>}
                        <div className="profile-stats">
                            <div className="stat">
                                <span className="stat-value">{profileData.postsCount}</span>
                                <span className="stat-label">posts</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{profileData.followersCount}</span>
                                <span className="stat-label">followers</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{profileData.followingCount}</span>
                                <span className="stat-label">following</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="instagram-posts-grid">
                {posts.map(post => (
                    <a
                        key={post.id}
                        href={`https://www.instagram.com/p/${post.shortcode}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="instagram-post"
                    >
                        <div className="post-image-container">
                            <Image
                                src={post.thumbnailUrl || post.displayUrl}
                                alt={post.caption?.substring(0, 40) || "Instagram post"}
                                width={300}
                                height={300}
                                className="post-image"
                                objectFit="cover"
                            />
                            {post.isVideo && (
                                <div className="video-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24px" height="24px">
                                        <path d="M0 0h24v24H0V0z" fill="none" />
                                        <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <div className="post-overlay">
                            <div className="post-stats">
                                <div className="likes">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="16px" height="16px">
                                        <path d="M0 0h24v24H0V0z" fill="none" />
                                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                    </svg>
                                    <span>{post.likeCount}</span>
                                </div>
                                <div className="comments">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="16px" height="16px">
                                        <path d="M0 0h24v24H0V0z" fill="none" />
                                        <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM17 11h-4v4h-2v-4H7V9h4V5h2v4h4v2z" />
                                    </svg>
                                    <span>{post.commentCount}</span>
                                </div>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
};

export default InstagramFeed;
