import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Search, Heart, MessageCircle, Share2, Volume2, VolumeX, Play, RotateCcw, AlertCircle, X } from 'lucide-react';
import './index.css';

const DEFAULT_SUB = 'TikTokCringe';

const decodeHtml = (html) => {
  if (!html) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
};

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
  
  const hlsUrl = media?.reddit_video?.hls_url?.replace(/&amp;/g, '&');
  const fallbackUrl = media?.reddit_video?.fallback_url?.replace(/&amp;/g, '&');
  const poster = preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Detect iOS (Safari/Chrome on iOS use WebKit)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const canPlayHLSNatively = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    
    console.log("Device:", { isIOS, canPlayHLSNatively, hlsUrl: !!hlsUrl, fallbackUrl: !!fallbackUrl });

    if (isIOS && canPlayHLSNatively && hlsUrl) {
      // iOS Safari has native HLS support - use it directly
      video.src = hlsUrl;
      console.log("iOS: Using native HLS:", hlsUrl);
    } else if (fallbackUrl) {
      // Desktop/Android: use MP4 fallback
      video.src = fallbackUrl;
      console.log("Using MP4 fallback:", fallbackUrl);
    } else if (hlsUrl) {
      // No fallback, try HLS.js
      if (Hls.isSupported()) {
        if (hlsRef.current) hlsRef.current.destroy();
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error("HLS fatal error:", data);
            setHasError(true);
          }
        });
        hlsRef.current = hls;
      } else if (canPlayHLSNatively) {
        video.src = hlsUrl;
      }
    }

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [hlsUrl, fallbackUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      // Mobile browsers require muted for autoplay
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            // Restore mute state after autoplay starts
            video.muted = isMuted;
          })
          .catch((err) => {
            console.log("Autoplay blocked:", err);
            setIsPlaying(false);
          });
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive, isMuted]);

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

  if (hasError) return (
    <div className="video-slide" style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
        <AlertCircle size={48} color="#666" />
        <p style={{color: '#666', marginTop: 10}}>Video failed to load</p>
    </div>
  );

  return (
    <div className="video-slide">
      <video
        ref={videoRef}
        className="video-player"
        loop
        muted={isMuted}
        autoPlay={isActive}
        playsInline
        webkit-playsinline="true"
        x5-playsinline="true"
        x5-video-player-type="h5"
        preload="metadata"
        poster={poster}
        onClick={togglePlay}
        onError={(e) => {
          console.error("Video error:", e.target.error);
          setHasError(true);
        }}
        onLoadedData={() => console.log("Video loaded:", fallbackUrl)}
      />
      {!isPlaying && (
        <div className="play-indicator" onClick={togglePlay}>
          <Play fill="white" size={48} style={{ opacity: 0.8 }} />
        </div>
      )}
      <div className="mute-toggle" onClick={(e) => { e.stopPropagation(); toggleMute(); }}>
        {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
      </div>
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
            if (navigator.share) navigator.share({ title, url: `https://reddit.com${permalink}` });
            else navigator.clipboard.writeText(`https://reddit.com${permalink}`);
        }}>
          <Share2 size={32} fill="white" className="action-icon" />
          <span className="action-text">Share</span>
        </div>
      </div>
      <div className="overlay">
        <div className="overlay-content">
            <div className="author">@{author} • {subreddit_name_prefixed}</div>
            <div className="description">{decodeHtml(title)}</div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [subreddit, setSubreddit] = useState(DEFAULT_SUB);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [posts, setPosts] = useState([]);
  const [after, setAfter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef(null);

  const fetchPosts = async (reset = false, targetSub = subreddit, currentAfter = after) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Clean up subreddit name (remove r/ prefix if user typed it)
      let cleanSub = targetSub.trim();
      if (cleanSub.toLowerCase().startsWith('r/')) {
          cleanSub = cleanSub.substring(2);
      }

      let redditUrl;
      // Heuristic: if spaces, it's a search term, else subreddit
      if (cleanSub.includes(' ')) {
        redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(cleanSub)}&limit=10${reset ? '' : `&after=${currentAfter}`}`;
      } else {
        redditUrl = `https://www.reddit.com/r/${cleanSub}/hot.json?limit=10${reset ? '' : `&after=${currentAfter}`}`;
      }

      const endpoints = [
          // Primary: Our own Cloudflare Worker (most reliable)
          { url: `https://redfeed-proxy.cjb2970.workers.dev/?url=${encodeURIComponent(redditUrl)}`, type: 'direct', name: 'CF-Worker' },
          // Fallbacks (public proxies, often blocked by Reddit)
          { url: `https://api.allorigins.win/get?url=${encodeURIComponent(redditUrl)}`, type: 'wrapper', name: 'AllOrigins' },
          { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(redditUrl)}`, type: 'direct', name: 'CodeTabs' },
      ];

      let data = null;
      let lastErr = null;

      for (const endpoint of endpoints) {
        try {
            console.log(`Trying proxy: ${endpoint.name}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const res = await fetch(endpoint.url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!res.ok) throw new Error(`Proxy status ${res.status}`);
            
            const text = await res.text();
            
            // Check if Reddit returned HTML instead of JSON (blocked/rate-limited)
            if (text.includes('<!doctype html>') || text.includes('<html') || text.includes('theme-beta') || text.includes('Blocked')) {
                throw new Error(`Reddit blocked ${endpoint.name} (returned HTML)`);
            }
            
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                // If parsing fails, it's HTML/text error
                throw new Error(`Invalid JSON from ${endpoint.name}: ${text.substring(0, 50)}...`);
            }

            // Check for proxy error responses
            if (json.error) {
                throw new Error(`Proxy error: ${json.error}`);
            }

            if (endpoint.type === 'wrapper') {
                if (!json.contents) throw new Error("Empty wrapper contents");
                // Check if wrapped content is also HTML
                if (json.contents.includes('<!doctype html>') || json.contents.includes('<html') || json.contents.includes('Blocked')) {
                    throw new Error(`Reddit blocked ${endpoint.name} (returned HTML in wrapper)`);
                }
                data = JSON.parse(json.contents);
            } else {
                data = json;
            }

            if (data && data.data && data.data.children) {
                console.log(`Success via ${endpoint.name}`);
                break; // Success!
            } else {
                throw new Error(`Invalid Reddit response structure`);
            }
        } catch (e) {
            console.warn(`Failed ${endpoint.name}:`, e.message);
            lastErr = e;
        }
      }

      if (!data) {
        const errMsg = lastErr?.message || "All proxies failed";
        if (errMsg.includes('blocked') || errMsg.includes('HTML')) {
            throw new Error("Reddit is blocking proxy requests. Try again in a few minutes, or try a different subreddit.");
        }
        throw new Error(errMsg);
      }

      const newPosts = data.data.children
        .map(child => child.data)
        .filter(post => 
            post.is_video && 
            post.media?.reddit_video && 
            !post.url.includes('youtube')
        );

      setPosts(prev => {
        const combined = reset ? newPosts : [...prev, ...newPosts];
        const unique = new Map();
        combined.forEach(p => unique.set(p.id, p));
        return Array.from(unique.values());
      });
      setAfter(data.data.after);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Autocomplete logic - Keeping this as requested
  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length > 1) {
      debounceRef.current = setTimeout(async () => {
        try {
            const url = `https://www.reddit.com/api/search_reddit_names.json?query=${encodeURIComponent(value)}`;
            // Try multiple proxies for autocomplete
            const proxyEndpoints = [
                { url: `https://redfeed-proxy.cjb2970.workers.dev/?url=${encodeURIComponent(url)}`, type: 'direct' },
                { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'wrapper' },
            ];
            
            let names = null;
            for (const endpoint of proxyEndpoints) {
                try {
                    const res = await fetch(endpoint.url);
                    const text = await res.text();
                    if (text.includes('<html') || text.includes('Blocked')) continue;
                    
                    let json = JSON.parse(text);
                    let data = endpoint.type === 'wrapper' ? JSON.parse(json.contents) : json;
                    
                    if (data && data.names) {
                        names = data.names;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (names) {
                setSuggestions(names);
                setShowSuggestions(true);
            }
        } catch (err) {
            console.error("Autocomplete error", err);
        }
      }, 300);
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
    }
  };

  const selectSuggestion = (name) => {
    setSubreddit(name);
    setSearchInput(name);
    setShowSuggestions(false);
    setSuggestions([]);
    fetchPosts(true, name, null);
  };

  useEffect(() => {
    setPosts([]);
    setAfter(null);
    setActiveIndex(0);
    fetchPosts(true, subreddit, null);
  }, [subreddit]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = (e) => {
    const container = e.target;
    const index = Math.round(container.scrollTop / container.clientHeight);
    if (index !== activeIndex) setActiveIndex(index);
    if (posts.length > 0 && posts.length - index < 3 && !loading && after) {
      fetchPosts(false, subreddit, after);
    }
  };

  return (
    <div className="feed-container" onScroll={handleScroll}>
      <div className="top-nav">
        <div className="search-container">
            <div className="search-pill">
                <Search size={16} />
                <input 
                    type="text" 
                    className="search-input"
                    placeholder={`r/${subreddit}`}
                    value={searchInput}
                    onChange={handleInputChange}
                    onFocus={() => { if(suggestions.length > 0) setShowSuggestions(true); }}
                />
                {searchInput && (
                    <X size={14} style={{cursor:'pointer'}} onClick={() => {
                        setSearchInput('');
                        setSuggestions([]);
                        setShowSuggestions(false);
                    }}/>
                )}
            </div>
            
            {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-dropdown">
                    <div className="suggestion-item" onClick={() => selectSuggestion(searchInput)}>
                        <span className="sub-name">Search "{searchInput}"</span>
                        <span className="type-label">Keyword</span>
                    </div>
                    {suggestions.map((name) => (
                        <div key={name} className="suggestion-item" onClick={() => selectSuggestion(name)}>
                            <span className="sub-name">r/{name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
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

      {!loading && !error && posts.length === 0 && (
          <div className="video-slide" style={{ flexDirection: 'column', gap: 20 }}>
            <p>No videos found.</p>
            <button onClick={() => selectSuggestion(DEFAULT_SUB)} style={{ padding: '10px 20px', borderRadius: 99, border: 'none', background: 'white', color: 'black', fontWeight: 600 }}>
                Return to Trending
            </button>
          </div>
      )}
      
      {error && (
        <div className="video-slide" style={{ flexDirection: 'column', gap: 20 }}>
            <AlertCircle size={48} color="#ff4500" />
            <p style={{textAlign: 'center', padding: 20}}>
                Error loading videos.<br/>
                <span style={{fontSize: '0.8em', color: '#666'}}>{error}</span>
            </p>
            <button onClick={() => fetchPosts(true)} style={{ padding: '10px 20px', borderRadius: 99, border: 'none', background: 'white', color: 'black', fontWeight: 600 }}>
                Retry
            </button>
        </div>
      )}
    </div>
  );
}

export default App;