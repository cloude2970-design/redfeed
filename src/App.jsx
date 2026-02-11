import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Search, Heart, MessageCircle, Share2, Volume2, VolumeX, Play, RotateCcw } from 'lucide-react';
import './index.css';

const DEFAULT_SUB = 'TikTokCringe';

const decodeHtml = (html) => {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
};

// Format numbers like 12.5k
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num;
}

const VideoSlide = ({ post, isActive, isMuted, toggleMute }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  const { title, author, subreddit_name_prefixed, ups, num_comments, permalink, media, preview } = post;
  
  const hlsUrl = media?.reddit_video?.hls_url;
  const fallbackUrl = media?.reddit_video?.fallback_url;
  const poster = preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&');

  // Initialize Video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported() && hlsUrl) {
      if (hlsRef.current) hlsRef.current.destroy();
      
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
           console.warn("HLS fatal error", data);
           // HLS.js will try to recover, or we fall back to src
        }
      });
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && hlsUrl) {
      // Native HLS (Safari)
      video.src = hlsUrl;
    } else {
      // Fallback (often silent)
      video.src = fallbackUrl;
    }

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [hlsUrl, fallbackUrl]);

  // Handle Play/Pause based on Active State
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      // Try to play
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(err => {
            // Auto-play policy blocked
            console.log("Autoplay blocked/failed", err);
            setIsPlaying(false);
          });
      }
    } else {
      video.pause();
      setIsPlaying(false);
      video.currentTime = 0; // Reset when scrolling away? TikTok doesn't, but it saves resources.
    }
  }, [isActive]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  if (hasError) return null;

  return (
    <div className="video-slide">
      <video
        ref={videoRef}
        className="video-player"
        loop
        muted={isMuted}
        playsInline
        poster={poster}
        onClick={togglePlay}
        onError={() => setHasError(true)}
      />
      
      {/* Play/Pause Icon Overlay (fades out) */}
      {!isPlaying && (
        <div className="play-indicator">
          <Play fill="white" size={48} style={{ opacity: 0.8 }} />
        </div>
      )}

      {/* Mute Button */}
      <div 
        className="mute-toggle" 
        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
      >
        {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
      </div>

      {/* Side Actions */}
      <div className="side-actions">
        <div className="action-btn">
          <Heart size={32} fill="white" className="action-icon" />
          <span className="action-text">{formatNumber(ups)}</span>
        </div>
        <div className="action-btn" onClick={() => window.open(`https://reddit.com${permalink}`, '_blank')}>
          <MessageCircle size={32} fill="white" className="action-icon" />
          <span className="action-text">{formatNumber(num_comments)}</span>
        </div>
        <div className="action-btn" onClick={() => {
            if (navigator.share) {
                navigator.share({ title, url: `https://reddit.com${permalink}` });
            } else {
                navigator.clipboard.writeText(`https://reddit.com${permalink}`);
                alert('Link copied!');
            }
        }}>
          <Share2 size={32} fill="white" className="action-icon" />
          <span className="action-text">Share</span>
        </div>
      </div>

      {/* Bottom Text Overlay */}
      <div className="overlay">
        <div className="overlay-content">
            <div className="author">
                @{author} • {subreddit_name_prefixed}
            </div>
            <div className="description">
                {decodeHtml(title)}
            </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [subreddit, setSubreddit] = useState(DEFAULT_SUB);
  const [searchInput, setSearchInput] = useState('');
  const [posts, setPosts] = useState([]);
  const [after, setAfter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  // Fetch logic
  const fetchPosts = async (reset = false, targetSub = subreddit, currentAfter = after) => {
    if (loading) return;
    setLoading(true);

    try {
      // If it looks like a subreddit name (no spaces), fetch sub. 
      // Else search.
      let url;
      if (targetSub.includes(' ')) {
        url = `https://www.reddit.com/search.json?q=${encodeURIComponent(targetSub)}&limit=10${reset ? '' : `&after=${currentAfter}`}`;
      } else {
        url = `https://www.reddit.com/r/${targetSub}/hot.json?limit=10${reset ? '' : `&after=${currentAfter}`}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response was not ok');
      
      const data = await res.json();
      const newPosts = data.data.children
        .map(child => child.data)
        .filter(post => 
            post.is_video && 
            post.media?.reddit_video && 
            !post.url.includes('youtube') && 
            !post.url.includes('youtu.be')
        );

      setPosts(prev => {
        // Dedup by ID
        const combined = reset ? newPosts : [...prev, ...newPosts];
        const unique = new Map();
        combined.forEach(p => unique.set(p.id, p));
        return Array.from(unique.values());
      });
      
      setAfter(data.data.after);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    setPosts([]);
    setAfter(null);
    setActiveIndex(0);
    fetchPosts(true, subreddit, null);
  }, [subreddit]);

  // Infinite Scroll & Active Index Detection
  const handleScroll = (e) => {
    const container = e.target;
    const index = Math.round(container.scrollTop / container.clientHeight);
    
    if (index !== activeIndex) {
      setActiveIndex(index);
    }

    // Trigger load more when close to end (2 items left)
    if (posts.length > 0 && posts.length - index < 3 && !loading && after) {
      fetchPosts(false, subreddit, after);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSubreddit(searchInput.trim());
      // Reset input to show what we are watching? Or clear? 
      // Let's keep it sync.
    }
  };

  return (
    <div className="feed-container" onScroll={handleScroll}>
      <div className="top-nav">
        <form onSubmit={handleSearchSubmit} className="search-pill">
            <Search size={16} />
            <input 
                type="text" 
                className="search-input"
                placeholder={subreddit}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={(e) => e.target.select()}
            />
        </form>
      </div>

      {posts.map((post, index) => (
        <VideoSlide 
            key={post.id} 
            post={post} 
            isActive={index === activeIndex}
            isMuted={isMuted}
            toggleMute={() => setIsMuted(!isMuted)}
        />
      ))}

      {loading && (
        <div className="video-slide" style={{ background: 'transparent', height: '100px' }}>
            <div className="spin"><RotateCcw size={32} color="#666" /></div>
        </div>
      )}

      {!loading && posts.length === 0 && (
          <div className="video-slide" style={{ flexDirection: 'column', gap: 20 }}>
            <p>No videos found.</p>
            <button onClick={() => setSubreddit(DEFAULT_SUB)} style={{ padding: '10px 20px', borderRadius: 99, border: 'none', background: 'white', color: 'black', fontWeight: 600 }}>
                Return to Trending
            </button>
          </div>
      )}
    </div>
  );
}

export default App;
