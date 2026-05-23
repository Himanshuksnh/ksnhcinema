import { useEffect, useMemo, useState, useRef } from 'react';
import {
  fetchTabData,
  fetchPlayInfo,
  fetchResourceQualities,
  searchSubjects,
  fetchFilteredList,
  fetchSeriesDetails,
  fetchAvailableDubs,
  fetchCommunityPostCount,
  fetchCommunityPosts,
  fetchResourceTitle,
  fetchSubtitles,
} from './api/gapi';

const TAB_OPTIONS = [
  { label: 'Explore', tabId: 0 },
  { label: 'Movies', tabId: 2 },
  { label: 'Series', tabId: 5 },
  { label: 'Anime', tabId: 8 },
  { label: 'Asian', tabId: 18 },
  { label: 'Western', tabId: 19 },
  { label: 'Indian', tabId: 20 },
  { label: 'Kids', tabId: 23 },
];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function getSectionItems(section) {
  const type = section?.type;
  if (type === 'BANNER') return [];
  const primary =
    type === 'RANKING'
      ? (Array.isArray(section?.rankings) ? section.rankings : [])
      : (Array.isArray(section?.subjects) ? section.subjects : []);

  const secondary =
    type === 'RANKING'
      ? (Array.isArray(section?.subjects) ? section.subjects : [])
      : (Array.isArray(section?.rankings) ? section.rankings : []);

  const source = primary.length > 0 ? primary : secondary;

  const normalized = source.map((entry) => {
    if (entry && typeof entry === 'object' && entry.subject && typeof entry.subject === 'object') {
      return {
        ...entry.subject,
        _sectionMeta: entry,
      };
    }
    return entry;
  });

  return normalized.filter((x) => {
    const hasId = x?.subjectId != null || x?.id != null;
    const hasTitle = Boolean(x?.title || x?.subjectTitle || x?.name);
    const hasVisual = Boolean(x?.cover?.url || x?.image);
    return hasId || hasTitle || hasVisual;
  });
}

function normalizeItem(raw) {
  const subject = raw?.subject && typeof raw.subject === 'object' ? raw.subject : null;
  const subjectId = raw?.subjectId ?? raw?.id ?? subject?.subjectId ?? subject?.id ?? '';
  const title = raw?.title ?? raw?.subjectTitle ?? raw?.name ?? subject?.title ?? subject?.name ?? 'Untitled Entry';
  const coverUrl =
    raw?.cover?.url ??
    raw?.image ??
    subject?.cover?.url ??
    subject?.image ??
    '';
  const genre = raw?.genre ?? subject?.genre ?? 'Media Stream';
  const subjectType = raw?.subjectType ?? subject?.subjectType ?? 0;
  return {
    ...raw,
    subjectId,
    title,
    genre,
    subjectType,
    cover: coverUrl ? { url: coverUrl } : raw?.cover,
    image: coverUrl || raw?.image || subject?.image || '',
  };
}

export default function App() {
  // Navigation View & State Settings
  const [sidebarView, setSidebarView] = useState('explore'); // explore, watchlist, analytics, settings
  const [activeTab, setActiveTab] = useState(TAB_OPTIONS[0]);
  const [tabDataMap, setTabDataMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  // Filtering / Sorting library state
  const [sortBy, setSortBy] = useState('trending'); // trending, alphabetical, genre

  // Persistent Theme Customizer
  const [theme, setTheme] = useState(() => localStorage.getItem('ksnh-theme') || 'purple');

  // Persistent Watchlist & Ratings
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ksnh-watchlist')) || [];
    } catch (_) {
      return [];
    }
  });

  const [reviewsMap, setReviewsMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ksnh-reviews')) || {};
    } catch (_) {
      return {};
    }
  });

  // Streaming / Download Portals Modal
  const [selected, setSelected] = useState(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [playInfo, setPlayInfo] = useState(null);
  const [qualities, setQualities] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [seasonsList, setSeasonsList] = useState([]);
  const [selectedSeasonIndex, setSelectedSeasonIndex] = useState(0);

  // Captions System
  const [captionsList, setCaptionsList] = useState([]);
  const [activeCaption, setActiveCaption] = useState(() => localStorage.getItem('ksnh-caption') || '');
  // Removed hlsReady/dashReady — using fetch-based proxy player instead

  // Live GAPI Parity Sync States
  const [dubsList, setDubsList] = useState([]);
  const [realComments, setRealComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(0);
  const [showDubsDialog, setShowDubsDialog] = useState(false);
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [loadingDubs, setLoadingDubs] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  // Failover Mirror CDN selector
  const [activeCDN, setActiveCDN] = useState('Primary');
  const [activeLanguage, setActiveLanguage] = useState('Original');

  // Search Results
  const [searching, setSearching] = useState(false);

  const [videoFit, setVideoFit] = useState('contain');
  const lastTapRef = useRef(0);

  const [searchResults, setSearchResults] = useState([]);
  const [fallbackItemsMap, setFallbackItemsMap] = useState({});

  // Ratings inputs
  const [currentRating, setCurrentRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  // Keyboard controls visual shortcut cheat sheet
  const [showCheatSheet, setShowCheatSheet] = useState(true);

  // Floating slide-in Toast alerts
  const [toast, setToast] = useState(null);

  // Custom premium video player UI states
  const [customPlaying, setCustomPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(() => Number(localStorage.getItem('ksnh-speed')) || 1.0);
  const [showControls, setShowControls] = useState(true);
  const [skipSplash, setSkipSplash] = useState(null);

  // Native player references
  const [isPlaying, setIsPlaying] = useState(false);

  // Apply body dynamic theme classes
  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('ksnh-theme', theme);
  }, [theme]);

  // Sync Watchlist & Reviews back to persistent storage
  useEffect(() => {
    localStorage.setItem('ksnh-watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('ksnh-reviews', JSON.stringify(reviewsMap));
  }, [reviewsMap]);

  // Sync Caption & Speed preferences
  useEffect(() => {
    localStorage.setItem('ksnh-caption', activeCaption);
  }, [activeCaption]);

  useEffect(() => {
    localStorage.setItem('ksnh-speed', playbackSpeed);
  }, [playbackSpeed]);

  // Toast notifier trigger
  const triggerToast = (msg) => {
    setToast(msg);
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  };

  // Fetch initial tab data
  useEffect(() => {
    let ignore = false;
    async function loadTab() {
      if (tabDataMap[activeTab.tabId]) return;
      setLoading(true);
      setError('');
      try {
        const data = await fetchTabData(activeTab.tabId);
        if (ignore) return;
        setTabDataMap((prev) => ({ ...prev, [activeTab.tabId]: data }));
      } catch (e) {
        if (!ignore) setError(e.message || 'Failed to load tab data');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadTab();
    return () => {
      ignore = true;
    };
  }, [activeTab, tabDataMap]);

  // Debounced search queries
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    let ignore = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const tabMap = {
          0: '',
          2: 'Movie',
          5: 'TV',
          8: 'TV',
          18: 'TV',
          19: 'TV',
          20: 'TV',
          23: '',
        };
        const tabId = tabMap[activeTab.tabId] ?? '';
        let results = await searchSubjects(term, 1, tabId, 20);
        if (results.length === 0 && tabId !== '') {
          results = await searchSubjects(term, 1, '', 20);
        }
        if (!ignore) setSearchResults(results);
      } catch (_) {
        if (!ignore) setSearchResults([]);
      } finally {
        if (!ignore) setSearching(false);
      }
    }, 350);

    return () => {
      ignore = true;
      clearTimeout(timer);
      setSearching(false);
    };
  }, [q, activeTab]);

  const sections = useMemo(() => {
    const data = tabDataMap[activeTab.tabId];
    return Array.isArray(data?.items) ? data.items : [];
  }, [tabDataMap, activeTab]);

  const tabCardsCount = useMemo(() => {
    return sections.reduce((acc, section) => acc + getSectionItems(section).length, 0);
  }, [sections]);

  // API Fallback list handler for other tabs (Asian, Kids, Western, Indian)
  useEffect(() => {
    let ignore = false;
    async function loadFallbackItems() {
      if (q.trim().length >= 2) return;
      if (tabCardsCount > 0) return;
      if (fallbackItemsMap[activeTab.tabId] !== undefined) return;
      try {
        const map = {
          18: '2', // Asian -> channelId '2'
          19: '2', // Western -> channelId '2'
          20: '2', // Indian -> channelId '2'
          23: '2', // Kids -> channelId '2'
        };
        const channelId = map[activeTab.tabId];
        if (!channelId) {
          if (!ignore) {
            setFallbackItemsMap((prev) => ({ ...prev, [activeTab.tabId]: [] }));
          }
          return;
        }

        console.log(`[API FALLBACK] Fetching filtered list directly for channelId: ${channelId} (Tab: ${activeTab.label})`);
        const items = await fetchFilteredList({ channelId, page: 1, perPage: 60 });
        console.log(`[API FALLBACK SUCCESS] Loaded ${items.length} cards for Tab: ${activeTab.label}`);

        if (!ignore) {
          setFallbackItemsMap((prev) => ({ ...prev, [activeTab.tabId]: items }));
        }
      } catch (err) {
        console.error(`[API FALLBACK ERROR] Failed to fetch cards for Tab: ${activeTab.label}`, err);
        if (!ignore) {
          setFallbackItemsMap((prev) => ({ ...prev, [activeTab.tabId]: [] }));
        }
      }
    }
    loadFallbackItems();
    return () => {
      ignore = true;
    };
  }, [activeTab, tabCardsCount, fallbackItemsMap, q]);

  // Compute Featured Highlight Billboard from top-trending items
  const heroItem = useMemo(() => {
    const exploreData = tabDataMap[0];
    const list = exploreData ? exploreData.items || [] : [];
    for (const sec of list) {
      const items = getSectionItems(sec);
      if (items.length > 0) return normalizeItem(items[0]);
    }
    return null;
  }, [tabDataMap]);

  // Mouse Spotlight Coordinates Tracker
  const handleMouseMove = (e) => {
    const cardEl = e.currentTarget;
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const mouseX = `${(x / rect.width) * 100}%`;
    const mouseY = `${(y / rect.height) * 100}%`;

    const rotateX = `${-((y - rect.height / 2) / (rect.height / 2)) * 12}deg`;
    const rotateY = `${((x - rect.width / 2) / (rect.width / 2)) * 12}deg`;

    cardEl.style.setProperty('--mouse-x', mouseX);
    cardEl.style.setProperty('--mouse-y', mouseY);
    cardEl.style.setProperty('--rotate-x', rotateX);
    cardEl.style.setProperty('--rotate-y', rotateY);
  };

  const handleMouseLeave = (e) => {
    const cardEl = e.currentTarget;
    if (!cardEl) return;
    cardEl.style.setProperty('--rotate-x', '0deg');
    cardEl.style.setProperty('--rotate-y', '0deg');
    cardEl.style.setProperty('--mouse-x', '50%');
    cardEl.style.setProperty('--mouse-y', '50%');
  };

  // Open Detailed Streaming HUD (Direct Landscape Cinematic Playback Mode)
  async function openDetails(item) {
    const norm = normalizeItem(item);
    setSelected(norm);
    setPlayInfo(null);
    setQualities([]);
    setSeasonsList([]);
    setSelectedSeasonIndex(0);
    setDetailLoading(true);

    const isMovie = Number(norm.subjectType || 0) === 1;

    if (isMovie) {
      setSeason(0);
      setEpisode(0);
      setIsPlaying(true); // Triggers useEffect to resolve and play stream instantly!
    } else {
      try {
        const list = await fetchSeriesDetails(norm.subjectId);
        setSeasonsList(list);
        if (list.length > 0) {
          setSeason(list[0].se || 1);
          const eps = list[0].episodeList || [];
          setEpisode(eps.length > 0 ? eps[0] : 1);
          setSelectedSeasonIndex(0);
        } else {
          setSeason(1);
          setEpisode(1);
        }
      } catch (e) {
        console.error('Failed to load series details', e);
        setSeason(1);
        setEpisode(1);
      } finally {
        setIsPlaying(true); // Triggers useEffect to resolve and play stream instantly!
      }
    }

    // Load available dubs and community comments count in background
    try {
      const dubs = await fetchAvailableDubs(norm.subjectId);
      setDubsList(dubs);

      // Auto-set the initial active language based on subjectId match
      const matchingDub = dubs.find((d) => String(d.subjectId) === String(norm.subjectId));
      if (matchingDub) {
        setActiveLanguage(matchingDub.lanName || matchingDub.languageName || 'Original');
      } else {
        const originalDub = dubs.find((d) => d.original === true);
        if (originalDub) {
          setActiveLanguage(originalDub.lanName || originalDub.languageName || 'Original');
        } else {
          setActiveLanguage('Original');
        }
      }

      const count = await fetchCommunityPostCount(norm.subjectId);
      setCommentsCount(count);
    } catch (e) {
      console.error('Background GAPI prefetch failed:', e);
      setActiveLanguage('Original');
    }
  }

  // Explicit dynamic playback loading (Polymorphic signature supporting se/ep and subjectId overrides)
  async function loadPlayback(subjectIdOrSe, se, ep) {
    let targetSubjectId = selected?.subjectId;
    let targetSe = subjectIdOrSe;
    let targetEp = se;

    if (typeof subjectIdOrSe === 'string') {
      targetSubjectId = subjectIdOrSe;
      targetSe = se;
      targetEp = ep;
    } else {
      targetSe = subjectIdOrSe;
      targetEp = se;
    }

    if (!targetSubjectId) return;
    setDetailLoading(true);
    try {
      // PRIMARY: Resource API — direct MP4, no DASH, no Cookie
      let ql = await fetchResourceQualities(targetSubjectId, targetSe, targetEp);
      let p = { videoUrl: '', qualityOptions: [], streamId: null };

      if (ql.length === 0) {
        // FALLBACK: play-info DASH stream
        p = await fetchPlayInfo(targetSubjectId, targetSe, targetEp);
        ql = p.qualityOptions || [];
      }

      const mainUrl = ql.length > 0 ? ql[0].url : p.videoUrl;
      const playData = { ...p, videoUrl: mainUrl };

      setPlayInfo(playData);
      setQualities(ql);
      setIsPlaying(true);
      triggerToast(targetSe > 0 ? `Streaming S${targetSe} Ep${targetEp}` : 'Streaming Movie...');
    } catch (e) {
      setPlayInfo({ error: e.message || 'Failed to load links' });
      setQualities([]);
      triggerToast('Playback failed');
    } finally {
      setDetailLoading(false);
    }
  }

  // Hot language/dub switching (natively switches subject context & re-loads page details)
  async function switchLanguage(dub) {
    setShowDubsDialog(false);
    setDetailLoading(true);
    try {
      const targetSubjectId = String(dub.subjectId);
      const languageName = dub.lanName || dub.languageName || 'Selected Language';
      triggerToast(`Switching to ${languageName}...`);

      // Fetch title
      let newTitle = selected.title;
      try {
        const apiTitle = await fetchResourceTitle(targetSubjectId);
        if (apiTitle) newTitle = apiTitle;
      } catch (err) { }

      const updatedSubject = {
        ...selected,
        subjectId: targetSubjectId,
        title: newTitle,
        name: newTitle,
      };

      setSelected(updatedSubject);
      setPlayInfo(null);
      setQualities([]);
      setSeasonsList([]);
      setSelectedSeasonIndex(0);
      setActiveLanguage(languageName);

      const isMovie = Number(updatedSubject.subjectType || 0) === 1;
      let targetSe = season;
      let targetEp = episode;

      if (isMovie) {
        targetSe = 0;
        targetEp = 0;
        setSeason(0);
        setEpisode(0);
      } else {
        const list = await fetchSeriesDetails(targetSubjectId);
        setSeasonsList(list);
        if (list.length > 0) {
          targetSe = list[0].se || 1;
          const eps = list[0].episodeList || [];
          targetEp = eps.length > 0 ? eps[0] : 1;
          setSeason(targetSe);
          setEpisode(targetEp);
          setSelectedSeasonIndex(0);
        } else {
          targetSe = 1;
          targetEp = 1;
          setSeason(1);
          setEpisode(1);
        }
      }

      // Directly fetch stream for new subjectId — don't rely on useEffect
      const ql = await fetchResourceQualities(targetSubjectId, targetSe, targetEp);
      let p = { videoUrl: '', qualityOptions: [], streamId: null };
      if (ql.length === 0) {
        p = await fetchPlayInfo(targetSubjectId, targetSe, targetEp);
      }
      const mainUrl = ql.length > 0 ? ql[0].url : p.videoUrl;

      setPlayInfo({ ...p, videoUrl: mainUrl });
      setQualities(ql);
      setIsPlaying(true);

      // Sync dubs and comments in background
      fetchAvailableDubs(targetSubjectId).then(setDubsList).catch(() => { });
      fetchCommunityPostCount(targetSubjectId).then(setCommentsCount).catch(() => { });

      triggerToast(`Now playing: ${languageName}`);
    } catch (e) {
      triggerToast('Language switch failed');
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }

  // Fetch and show live community posts/comments directly from GAPI
  async function loadComments() {
    if (!selected) return;
    setLoadingComments(true);
    setShowCommentsDialog(true);
    try {
      const posts = await fetchCommunityPosts(selected.subjectId, 0, 50);
      setRealComments(posts);
    } catch (e) {
      console.error('Failed to load community reviews:', e);
      triggerToast('Failed to load community reviews');
    } finally {
      setLoadingComments(false);
    }
  }

  // Auto-fetch Subtitles when playback changes
  useEffect(() => {
    if (!selected?.subjectId || !isPlaying) return;
    let ignore = false;

    const loadCaps = async () => {
      let sId = playInfo?.streamId;
      if (!sId) {
        try {
          const p = await fetchPlayInfo(selected.subjectId, Number(season), Number(episode));
          sId = p.streamId;
        } catch (e) {}
      }
      if (ignore || !sId) return;

      try {
        const rawCaps = await fetchSubtitles(selected.subjectId, sId, selected.detailPath || '');
        if (!ignore) {
          if (rawCaps.length > 0) {
            // Download, bypass CORS via proxy, and convert SRT to VTT blobs
            const processedCaps = await Promise.all(rawCaps.map(async (cap, idx) => {
              const langCode = cap.lan || cap.language || `lang_${idx}`;
              let blobUrl = cap.url;
              if (cap.url) {
                try {
                  const proxyUrl = `/cdn-proxy?url=${encodeURIComponent(cap.url)}`;
                  const res = await fetch(proxyUrl);
                  if (res.ok) {
                    let text = await res.text();
                    if (!text.trim().startsWith('WEBVTT')) {
                      text = "WEBVTT\n\n" + text.replace(/\r\n|\r|\n/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
                    }
                    const blob = new Blob([text], { type: 'text/vtt' });
                    blobUrl = URL.createObjectURL(blob);
                  }
                } catch (e) {}
              }
              return { ...cap, langCode, blobUrl };
            }));

            setCaptionsList(processedCaps);
            const eng = processedCaps.find(c => c.langCode.toLowerCase().includes('en') || (c.lanName || c.languageName || '').toLowerCase().includes('english'));
            setActiveCaption(eng ? eng.langCode : processedCaps[0].langCode);
          } else {
            setCaptionsList([]);
            setActiveCaption('');
          }
        }
      } catch (e) {}
    };

    loadCaps();
    return () => { ignore = true; };
  }, [selected?.subjectId, isPlaying, season, episode, playInfo?.streamId]);

  // Sync subtitle tracks mode with activeCaption state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    
    // Wait a brief moment to ensure React has rendered the <track> DOM elements
    const timer = setTimeout(() => {
      // Turn OFF ALL tracks first!
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = 'hidden';
      }

      // Now turn on the ONE matching track, prioritizing OUR injected tracks if possible
      if (activeCaption && activeCaption !== 'off') {
         let found = false;
         for (let i = 0; i < video.textTracks.length; i++) {
           const track = video.textTracks[i];
           const matches = track.language === activeCaption || track.label === activeCaption;
           if (matches && !found) {
              track.mode = 'showing';
              found = true;
           }
         }
         // Fallback if mismatch
         if (!found && video.textTracks.length > 0) {
            for (let i = 0; i < video.textTracks.length; i++) {
              if (video.textTracks[i].mode !== 'disabled') {
                 video.textTracks[i].mode = 'showing';
                 break;
              }
            }
         }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeCaption, captionsList]);

  // Auto update links when Season or Episode values change (ONLY when actively playing)
  useEffect(() => {
    if (!selected?.subjectId) return;
    if (!isPlaying) return;

    let ignore = false;
    async function updateLinks() {
      setDetailLoading(true);
      try {
        // PRIMARY: Resource API gives direct MP4 URLs — no DASH, no Cookie needed
        let ql = await fetchResourceQualities(selected.subjectId, Number(season), Number(episode));

        // FALLBACK: If resource API empty, use play-info (DASH)
        let p = { videoUrl: '', qualityOptions: [], streamId: null };
        if (ql.length === 0) {
          p = await fetchPlayInfo(selected.subjectId, Number(season), Number(episode));
          if (!ignore) ql = p.qualityOptions || [];
        }

        if (ignore) return;

        // Use highest quality URL as main video URL
        const mainUrl = ql.length > 0 ? ql[0].url : p.videoUrl;
        const playData = { ...p, videoUrl: mainUrl };

        setPlayInfo(playData);
        setQualities(ql);
        triggerToast(season > 0 ? `Playing: S${season} Ep${episode}` : 'Playing Movie...');
      } catch (e) {
        if (ignore) return;
        setPlayInfo({ error: e.message || 'Failed to load links' });
        setQualities([]);
        triggerToast('Stream refresh failed');
      } finally {
        if (!ignore) setDetailLoading(false);
      }
    }
    updateLinks();
    return () => { ignore = true; };
  }, [season, episode, isPlaying]);

  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Preload Hls.js + dash.js at app start — not on first episode click
  // This eliminates the library-load delay that causes initial buffering stutter
  useEffect(() => {
    if (!window.Hls) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
    if (!window.dashjs) {
      const script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.1/dist/dash.all.min.js';
      script2.async = true;
      document.body.appendChild(script2);
    }
  }, []);

  // ─── Flutter-exact Video Player Binding ──────────────────────────────────────
  // Mirrors _initializeVideo() in custom_video_player.dart:
  //   - Uses Cookie header for CloudFront signCookie (NOT URL params)
  //   - Uses Referer + Origin + User-Agent headers
  //   - Supports direct MP4, HLS (m3u8), DASH (mpd)
  // Browser limitation: fetch() can set headers but <video src> cannot.
  // Solution: for CDN streams with Cookie auth, we use a Blob URL approach
  // via fetch with credentials, then revoke after load.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playInfo?.videoUrl || !isPlaying) return;

    const streamUrl = playInfo.videoUrl;
    const streamHeaders = playInfo.videoHeaders || {};

    let hlsInstance = null;
    let blobUrl = null;

    // Reset UI state
    setCurrentTime(0);
    setDuration(0);
    setPlaybackSpeed(1.0);
    setCustomPlaying(false);

    console.log('[KSNH Player] Loading stream:', streamUrl.substring(0, 100));
    console.log('[KSNH Player] Headers:', Object.keys(streamHeaders));

    const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8') || streamUrl.includes('playlist');
    const isDash = streamUrl.includes('.mpd') || streamUrl.includes('/dash/') || streamUrl.includes('index.mpd');
    // Direct MP4 from resource API comes through /cdn-proxy — no DASH, no HLS
    const isDirectMp4 = !isHls && !isDash;

    async function loadStream() {
      if (isDirectMp4) {
        // Direct MP4 via proxy — simplest path, browser handles natively
        video.src = streamUrl;
        video.load();
        video.play().catch((e) => console.log('MP4 autoplay blocked:', e.message));
      } else if (isHls) {
        if (window.Hls && window.Hls.isSupported()) {
          hlsInstance = new window.Hls({
            enableWorker: true,
            maxBufferLength: 60,          // buffer 60s ahead (was 30s)
            maxMaxBufferLength: 120,       // allow up to 120s buffer
            maxBufferSize: 60 * 1000 * 1000, // 60MB buffer
            maxBufferHole: 0.5,           // tolerate 0.5s gaps before stalling
            lowLatencyMode: false,        // disable low-latency — we want smooth, not live
            backBufferLength: 30,         // keep 30s behind for seeking
            startLevel: -1,               // auto-select best quality on start
            abrEwmaDefaultEstimate: 5000000, // assume 5mbps initially — faster quality ramp
          });
          hlsInstance.loadSource(streamUrl);
          hlsInstance.attachMedia(video);
          hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => { });
          });
        } else {
          video.src = streamUrl;
          video.play().catch(() => { });
        }
      } else if (isDash) {
        if (!window.dashjs) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.1/dist/dash.all.min.js';
            s.onload = resolve; s.onerror = reject;
            document.body.appendChild(s);
          });
        }
        try {
          const dash = window.dashjs.MediaPlayer().create();
          const signCookie = playInfo.signCookie || '';
          dash.extend('RequestModifier', function () {
            return {
              modifyRequest: function (request) {
                const url = request.url || '';
                if (url.startsWith('http') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
                  const enc = encodeURIComponent(url);
                  const c = signCookie ? encodeURIComponent(signCookie) : '';
                  request.url = `/cdn-proxy?url=${enc}${c ? `&cookie=${c}` : ''}`;
                }
                return request;
              },
            };
          }, true);
          dash.initialize(video, streamUrl, true);
          video.play().catch(() => { });
          video._dashInstance = dash;
        } catch (e) {
          console.error('[DASH] Init failed:', e);
        }
      }
    }

    loadStream();

    // Media event listeners
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => { if (video.duration && !isNaN(video.duration)) setDuration(video.duration); };
    const onPlay = () => setCustomPlaying(true);
    const onPause = () => setCustomPlaying(false);
    const onVolumeChange = () => { setVolume(video.volume); setIsMuted(video.muted); };
    const onLoadedMetadata = () => { if (video.duration && !isNaN(video.duration)) setDuration(video.duration); };
    const onError = (e) => console.error('[Video] Error:', video.error?.message || e);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);

      if (hlsInstance) hlsInstance.destroy();
      if (video._dashInstance) {
        try { video._dashInstance.reset(); } catch (_) { }
        video._dashInstance = null;
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [playInfo?.videoUrl, isPlaying]);

  // Keyboard Shortcuts for Theater Player
  useEffect(() => {
    if (!selected || !isPlaying) return;

    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          break;
        case 'm':
          e.preventDefault();
          const newMute = !isMuted;
          setIsMuted(newMute);
          video.muted = newMute;
          break;
        case 'f':
          e.preventDefault();
          if (!document.fullscreenElement) {
            playerContainerRef.current?.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
          break;
        case 'arrowleft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'arrowright':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 100, video.currentTime + 10);
          break;
        case 'n': { // Next Episode
          e.preventDefault();
          if (seasonsList.length > 0) {
            const currentList = seasonsList[selectedSeasonIndex]?.episodeList || [];
            const idx = currentList.indexOf(Number(episode));
            if (idx !== -1 && idx < currentList.length - 1) {
              const nextEp = currentList[idx + 1];
              setEpisode(nextEp);
              loadPlayback(season, nextEp);
            }
          }
          break;
        }
        case 'p': { // Previous Episode
          e.preventDefault();
          if (seasonsList.length > 0) {
            const currentList = seasonsList[selectedSeasonIndex]?.episodeList || [];
            const idx = currentList.indexOf(Number(episode));
            if (idx > 0) {
              const prevEp = currentList[idx - 1];
              setEpisode(prevEp);
              loadPlayback(season, prevEp);
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, isPlaying, episode, season, selectedSeasonIndex, seasonsList, isMuted]);

  // Persistent Watchlist toggles
  const toggleWatchlist = (item) => {
    const isBookmarked = watchlist.some((x) => x.subjectId === item.subjectId);
    if (isBookmarked) {
      setWatchlist((prev) => prev.filter((x) => x.subjectId !== item.subjectId));
      triggerToast('Removed from Watchlist');
    } else {
      setWatchlist((prev) => [...prev, item]);
      triggerToast('Added to Watchlist!');
    }
  };

  // Star Ratings & reviews submit
  const submitReview = () => {
    if (!reviewText.trim()) return;
    const newReview = {
      author: 'User_' + Math.floor(Math.random() * 9000 + 1000),
      rating: currentRating,
      text: reviewText,
      timestamp: Date.now(),
    };
    const updated = {
      ...reviewsMap,
      [selected.subjectId]: [newReview, ...(reviewsMap[selected.subjectId] || [])],
    };
    setReviewsMap(updated);
    setReviewText('');
    triggerToast('Review submitted!');
  };

  // Premium custom keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore key events if typing in form inputs
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      const video = videoRef.current;
      if (!video || !isPlaying || !playInfo?.videoUrl) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (video.paused) {
            video.play().catch(() => { });
            triggerToast('▶ Play');
          } else {
            video.pause();
            triggerToast('⏸ Pause');
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          triggerToast('10s ⏩');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          triggerToast('⏪ -10s');
          break;
        case 'ArrowUp':
          e.preventDefault();
          const vUp = Math.min(1, video.volume + 0.05);
          video.volume = vUp;
          setVolume(vUp);
          setIsMuted(false);
          video.muted = false;
          triggerToast(`🔊 Vol ${Math.round(vUp * 100)}%`);
          break;
        case 'ArrowDown':
          e.preventDefault();
          const vDown = Math.max(0, video.volume - 0.05);
          video.volume = vDown;
          setVolume(vDown);
          video.muted = false;
          triggerToast(`🔉 Vol ${Math.round(vDown * 100)}%`);
          break;
        case 'KeyM':
          e.preventDefault();
          const nextMute = !video.muted;
          video.muted = nextMute;
          setIsMuted(nextMute);
          triggerToast(nextMute ? '🔇 Muted' : '🔊 Unmuted');
          break;
        case 'KeyF':
          e.preventDefault();
          const container = playerContainerRef.current;
          if (container) {
            if (!document.fullscreenElement) {
              container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
            } else {
              document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
          } else {
            // Exit theater mode
            setIsPlaying(false);
            setPlayInfo(null);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, playInfo]);

  // Helper to format playback seconds into HH:MM:SS or MM:SS
  const formatTime = (secs) => {
    if (isNaN(secs) || secs === Infinity) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // Auto-hide player controls during video playback mouse inactivity
  const handlePlayerMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    if (customPlaying) {
      handlePlayerMouseMove();
    }
  }, [customPlaying]);

  // Perform seek scrubbing on input timeline changes
  const handleSeekChange = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Number(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Double click visual skip visual overlay gesture (left/right)
  const handleDoubleClick = (e) => {
    const video = videoRef.current;
    const container = playerContainerRef.current;
    if (!video || !container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (clickX < width / 2) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      setSkipSplash('left');
      setTimeout(() => setSkipSplash(null), 500);
      triggerToast('⏪ -10s');
    } else {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      setSkipSplash('right');
      setTimeout(() => setSkipSplash(null), 500);
      triggerToast('10s ⏩');
    }
  };

  // Client-Side Library sorting
  const processedItemsList = useMemo(() => {
    let list = [];
    if (q.trim().length >= 2) {
      list = searchResults;
    } else if (tabCardsCount > 0) {
      list = sections.reduce((acc, sec) => [...acc, ...getSectionItems(sec)], []);
    } else {
      list = fallbackItemsMap[activeTab.tabId] || [];
    }

    const normalized = list.map(normalizeItem);

    if (sortBy === 'alphabetical') {
      return [...normalized].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'genre') {
      return [...normalized].sort((a, b) => a.genre.localeCompare(b.genre));
    }

    return normalized;
  }, [sections, fallbackItemsMap, activeTab, searchResults, q, sortBy, tabCardsCount]);

  return (
    <div className="v3-app-layout">
      {/* Background Animated Atmosphere */}
      <div className="v3-atmosphere-bg" />

      {/* Floating Alerts */}
      {toast && (
        <div className="v3-toast-layer">
          <div className="v3-toast-pill">
            <span className="v3-toast-icon">⚡</span>
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Navigation System: Bottom Nav (Mobile) & Side Rail (PC) */}
      <nav className="v3-navigation">
        <div className="v3-nav-brand">
          <div className="v3-nav-logo">KSNH</div>
        </div>

        <ul className="v3-nav-menu">
          <li
            className={`v3-nav-item ${sidebarView === 'explore' ? 'active' : ''}`}
            onClick={() => {
              setSidebarView('explore');
              setQ('');
            }}
          >
            <span className="v3-nav-icon">🌍</span>
            <span className="v3-nav-label">Explore</span>
          </li>
          <li
            className={`v3-nav-item ${sidebarView === 'watchlist' ? 'active' : ''}`}
            onClick={() => setSidebarView('watchlist')}
          >
            <span className="v3-nav-icon">🔖</span>
            <span className="v3-nav-label">Watchlist</span>
            {watchlist.length > 0 && <span className="v3-nav-badge">{watchlist.length}</span>}
          </li>
          <li
            className={`v3-nav-item ${sidebarView === 'settings' ? 'active' : ''}`}
            onClick={() => setSidebarView('settings')}
          >
            <span className="v3-nav-icon">🎨</span>
            <span className="v3-nav-label">Theme</span>
          </li>
        </ul>
      </nav>

      {/* Main App Stage */}
      <main className="v3-main-stage">
        {/* Dynamic Top Header */}
        <header className="v3-top-header">
          <div className="v3-header-titles">
            <h2>{sidebarView === 'explore' ? activeTab.label : sidebarView.toUpperCase()}</h2>
            <p>Premium Cinematic Experience</p>
          </div>
          <div className="v3-header-actions">
            <span className="v3-premium-pill">PRO ACCESS</span>
          </div>
        </header>

        {/* View: Settings */}
        {sidebarView === 'settings' && (
          <section className="v3-settings-container">
            <div className="v3-settings-section">
              <h3>🎨 Theme Customization</h3>
              <p>
                Choose your aesthetic glow wrapper to instantly repaint components and interactions.
              </p>
              <div className="v3-theme-grid">
                {[
                  { name: 'Cosmic Indigo', id: 'purple', color: '#6366f1' },
                  { name: 'Rose Scarlet', id: 'scarlet', color: '#e11d48' },
                  { name: 'Ocean Cyan', id: 'cyan', color: '#0284c7' },
                  { name: 'Amber Gold', id: 'gold', color: '#d97706' },
                  { name: 'Emerald', id: 'emerald', color: '#059669' },
                  { name: 'Neon Violet', id: 'neon', color: '#a855f7' },
                ].map((th) => (
                  <div
                    key={th.id}
                    className={`v3-theme-card ${theme === th.id ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(th.id);
                      triggerToast(`Switched to ${th.name}!`);
                    }}
                  >
                    <div className="v3-theme-color" style={{ backgroundColor: th.color }} />
                    <span>{th.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="v3-settings-section">
              <h3>💡 Theater Shortcuts</h3>
              <p>
                Use these hotkeys inside the cinematic player to control media instantly without your mouse:
              </p>
              <ul className="v3-help-list">
                <li><kbd className="v3-kbd">Space</kbd> - Play / Pause stream</li>
                <li><kbd className="v3-kbd">M</kbd> - Toggle audio mute</li>
                <li><kbd className="v3-kbd">F</kbd> - Toggle Fullscreen</li>
                <li><kbd className="v3-kbd">Arrows</kbd> - Seek 10s backward / forward</li>
                <li><kbd className="v3-kbd">N</kbd> / <kbd className="v3-kbd">P</kbd> - Next / Previous Episode</li>
              </ul>
            </div>
          </section>
        )}


        {/* View: Explore Dashboard */}
        {sidebarView === 'explore' && (
          <>
            {/* Featured Hero Billboard on Tab 0 (Explore) */}
            {activeTab.tabId === 0 && heroItem && q.trim().length === 0 && (
              <section className="v3-hero-billboard">
                <div
                  className="v3-hero-backdrop"
                  style={{ backgroundImage: `url(${heroItem.cover?.url || heroItem.image || 'https://placehold.co/1200x400'})` }}
                />
                <div className="v3-hero-overlay">
                  <span className="v3-hero-tag">🌟 Spotlight</span>
                  <h2 className="v3-hero-title">{heroItem.title}</h2>
                  <div className="v3-hero-meta">
                    {heroItem.imdbRatingValue && <span>⭐ {heroItem.imdbRatingValue}</span>}
                    <span>🍿 {heroItem.genre}</span>
                    {heroItem.releaseDate && <span>📅 {heroItem.releaseDate.substring(0, 4)}</span>}
                  </div>
                  <p className="v3-hero-desc">
                    High-definition streaming via secure cloud mirrors with seamless playback integration.
                  </p>
                  <div className="v3-hero-actions">
                    <button className="v3-btn-primary" onClick={() => openDetails(heroItem)}>
                      ▶ Play Now
                    </button>
                    <button
                      className="v3-btn-secondary"
                      onClick={() => toggleWatchlist(heroItem)}
                    >
                      {watchlist.some((x) => x.subjectId === heroItem.subjectId) ? '✓ Saved' : '+ Watchlist'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Filter Controls */}
            <section className="v3-filter-controls">
              <div className="v3-tabs-scroll">
                <div className="v3-tabs">
                  {TAB_OPTIONS.map((tab) => (
                    <button
                      key={tab.tabId}
                      className={tab.tabId === activeTab.tabId ? 'v3-tab active' : 'v3-tab'}
                      onClick={() => {
                        setActiveTab(tab);
                        setQ('');
                        setSearchResults([]);
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="v3-search-sort">
                <select
                  className="v3-sorter"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="trending">🔥 Trending</option>
                  <option value="alphabetical">🔤 A-Z</option>
                  <option value="genre">🍿 Genre</option>
                </select>

                <div className="v3-search-box">
                  <span className="v3-search-icon">🔍</span>
                  <input
                    className="v3-search-input"
                    placeholder="Search..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {q.length > 0 && (
                    <button className="v3-search-clear" onClick={() => setQ('')}>×</button>
                  )}
                </div>
              </div>
            </section>

            {/* Content Media Grid */}
            {loading && (
              <section className="v3-media-grid">
                {Array.from({ length: 12 }).map((_, i) => (
                  <article className="v3-card v3-skeleton-card" key={`skel-${i}`}>
                    <div className="v3-card-img-wrap skeleton-shimmer"></div>
                  </article>
                ))}
              </section>
            )}
            
            {error && (
              <div className="v3-empty-state">
                <span className="v3-empty-icon">⚠️</span>
                <h3>Oops, an error occurred</h3>
                <p>{error}</p>
              </div>
            )}
            
            {searching && (
              <section className="v3-media-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <article className="v3-card v3-skeleton-card" key={`skel-s-${i}`}>
                    <div className="v3-card-img-wrap skeleton-shimmer"></div>
                  </article>
                ))}
              </section>
            )}

            {!loading && !error && !searching && (
              <>
                <h3 className="v3-section-title">
                  {q.trim().length >= 2 ? `Search: "${q}"` : `${activeTab.label}`}
                </h3>
                {processedItemsList.length === 0 ? (
                  <div className="v3-empty-state">
                    <span className="v3-empty-icon">📭</span>
                    <h3>Nothing Found</h3>
                    <button className="v3-btn-secondary" onClick={() => setQ('')} style={{ marginTop: '16px' }}>Clear Search</button>
                  </div>
                ) : (
                  <section className="v3-media-grid">
                    {processedItemsList.map((item, idx) => {
                      const isBookmarked = watchlist.some((x) => x.subjectId === item.subjectId);
                      return (
                        <article
                          className="v3-card"
                          key={String(item.subjectId || item.id || item.title)}
                          style={{ animationDelay: `${Math.min(idx * 0.04, 0.6)}s` }}
                          onMouseMove={handleMouseMove}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => openDetails(item)}
                        >
                          <div className="v3-card-img-wrap">
                            <img
                              src={item.cover?.url || item.image || 'https://placehold.co/300x450?text=No+Image'}
                              alt={item.title}
                              loading="lazy"
                            />
                            <div className="v3-card-top-actions">
                              <span className="v3-card-rating">{item.imdbRatingValue ? `⭐ ${item.imdbRatingValue}` : '⭐ HD'}</span>
                              <button
                                className={`v3-card-bookmark ${isBookmarked ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleWatchlist(item);
                                }}
                              >
                                {isBookmarked ? '✓' : '+'}
                              </button>
                            </div>
                            <div className="v3-card-play-overlay">
                              <div className="v3-play-circle">▶</div>
                            </div>
                          </div>
                          <div className="v3-card-content">
                            <h4>{item.title}</h4>
                            <p>{item.genre}</p>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                )}
              </>
            )}
          </>
        )}

        {/* View: Persistent Watchlist Drawer */}
        {sidebarView === 'watchlist' && (
          <section>
            <h3 className="v3-section-title">🔖 Watchlist ({watchlist.length})</h3>
            {watchlist.length === 0 ? (
              <div className="v3-empty-state">
                <span className="v3-empty-icon">📭</span>
                <h3>Watchlist is Empty</h3>
                <p>Browse the Explore tab and save your favorites.</p>
              </div>
            ) : (
              <section className="v3-media-grid">
                {watchlist.map((item) => (
                  <article
                    className="v3-card"
                    key={String(item.subjectId || item.title)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => openDetails(item)}
                  >
                    <div className="v3-card-img-wrap">
                      <img
                        src={item.cover?.url || item.image || 'https://placehold.co/300x450?text=No+Image'}
                        alt={item.title}
                      />
                      <div className="v3-card-top-actions">
                        <button
                          className="v3-card-bookmark active"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWatchlist(item);
                          }}
                        >
                          ✓
                        </button>
                      </div>
                      <div className="v3-card-play-overlay">
                        <div className="v3-play-circle">▶</div>
                      </div>
                    </div>
                    <div className="v3-card-content">
                      <h4>{item.title}</h4>
                      <p>{item.genre}</p>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </section>
        )}
      </main>

      {/* Premium Cinematic Landscape Theater Player Overlay */}
      {selected && (
        <div className="theater-overlay-wrap" onClick={() => {
          setSelected(null);
          setIsPlaying(false);
          setPlayInfo(null);
        }}>
        <div className="theater-container" onClick={(e) => e.stopPropagation()}>
            <button className="theater-close-btn" onClick={() => {
              setSelected(null);
              setIsPlaying(false);
              setPlayInfo(null);
            }}>×</button>

            <div className="theater-main-content">
              {/* Left Column: Landscape 16:9 Custom Premium Video Player */}
              <div
                ref={playerContainerRef}
                className="theater-video-wrapper custom-player-container"
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  background: '#000',
                  borderRadius: '16px',
                  overflow: 'hidden'
                }}
                onMouseMove={handlePlayerMouseMove}
                onMouseLeave={() => { if (customPlaying) setShowControls(false); }}
              >
                {/* Always-Mounted Video Element (NO default browser controls!) */}
                <video
                  ref={videoRef}
                  id="ksnh-native-player"
                  autoPlay
                  onDoubleClick={handleDoubleClick}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: videoFit,
                    cursor: 'pointer',
                    display: (playInfo?.error || !playInfo?.videoUrl) ? 'none' : 'block'
                  }}
                  onClick={(e) => {
                    const now = Date.now();
                    const timeDiff = now - (lastTapRef.current || 0);
                    const video = videoRef.current;
                    if (!video) return;

                    if (timeDiff > 0 && timeDiff < 350) {
                      handleDoubleClick(e);
                      lastTapRef.current = 0;
                      setShowControls(false);
                      if (video.paused) video.play().catch(() => { });
                      else video.pause();
                    } else {
                      lastTapRef.current = now;
                      if (video.paused) video.play().catch(() => { });
                      else video.pause();
                    }
                  }}
                >
                  {captionsList.map((cap, idx) => (
                    <track
                      key={cap.blobUrl || `${playInfo?.streamId}-${idx}-${cap.langCode}`}
                      kind="subtitles"
                      srcLang={cap.langCode}
                      label={cap.lanName || cap.languageName || cap.langCode.toUpperCase()}
                      src={cap.blobUrl || cap.url}
                    />
                  ))}
                </video>

                {/* Removed Double-Click visual overlay as requested */}                {/* Loader Overlay */}
                {detailLoading && (
                  <div className="theater-loading-state" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', zIndex: 10 }}>
                    <div className="state-spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.05)', borderTopColor: 'var(--theme-bright)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '13px', letterSpacing: '0.5px' }}>Loading stream...</p>
                  </div>
                )}

                {/* Error Overlay */}
                {(playInfo?.error || playInfo?.codecError) && !detailLoading && (
                  <div className="theater-error-state" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.97)', zIndex: 10, padding: '30px', textAlign: 'center', gap: '16px' }}>
                    {playInfo?.codecError ? (
                      <>
                        <div style={{ fontSize: '48px' }}>🎬</div>
                        <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>H.265 Codec Required</h3>
                        <p style={{ color: '#aaa', fontSize: '13px', maxWidth: '400px', lineHeight: 1.6 }}>
                          Yeh stream <strong style={{ color: 'var(--theme-bright)' }}>H.265/HEVC</strong> format mein hai jo aapke browser mein support nahi hai.
                        </p>
                        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px 20px', maxWidth: '420px' }}>
                          <p style={{ color: '#fff', fontSize: '13px', margin: '0 0 10px', fontWeight: 'bold' }}>Fix karne ke 2 tarike:</p>
                          <p style={{ color: '#ccc', fontSize: '12px', margin: '0 0 8px', lineHeight: 1.7 }}>
                            <strong style={{ color: 'var(--theme-bright)' }}>Option 1 (Recommended):</strong><br />
                            Microsoft Store se <strong>"HEVC Video Extensions"</strong> install karo (free).<br />
                            <span style={{ opacity: 0.7 }}>Start → Microsoft Store → search "HEVC Video Extensions"</span>
                          </p>
                          <p style={{ color: '#ccc', fontSize: '12px', margin: 0, lineHeight: 1.7 }}>
                            <strong style={{ color: 'var(--theme-bright)' }}>Option 2:</strong><br />
                            VLC ya MPV player mein download karke dekho.
                          </p>
                        </div>
                        <button
                          onClick={() => window.open('ms-windows-store://pdp/?ProductId=9n4wgh0z6vhq', '_blank')}
                          style={{ background: 'var(--theme-bright)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px' }}
                        >
                          Open Microsoft Store →
                        </button>
                      </>
                    ) : (
                      <p className="state error">{playInfo.error}</p>
                    )}
                  </div>
                )}

                {/* Custom Cinematic HUD Overlay */}
                {playInfo?.videoUrl && !playInfo.error && (
                  <div className={`custom-player-hud ${showControls ? 'visible' : 'hidden'}`} style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.7) 100%)',
                    zIndex: 8,
                    transition: 'opacity 0.3s ease, visibility 0.3s',
                    opacity: showControls ? 1 : 0,
                    visibility: showControls ? 'visible' : 'hidden',
                    pointerEvents: 'none'
                  }}>
                    {/* HUD Top Title Bar */}
                    <div className="hud-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
                      <span className="hud-title" style={{ fontWeight: 'bold', color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        {selected.title} {season > 0 ? `- S${season} Ep${episode}` : ''}
                      </span>
                      <span className="hud-badge" style={{ background: 'var(--theme-bright)', color: '#000', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                        🎙️ {activeLanguage.toUpperCase()} ({playbackSpeed}x)
                      </span>
                    </div>

                    {/* HUD Center big Play/Pause visual feedback */}
                    <div className="hud-center-play" style={{
                      alignSelf: 'center',
                      pointerEvents: 'auto',
                      cursor: 'pointer'
                    }} onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      if (video.paused) video.play().catch(() => { });
                      else video.pause();
                    }}>
                      <div className="hud-big-btn">
                        {customPlaying ? '⏸' : '▶'}
                      </div>
                    </div>

                    {/* HUD Bottom seekbar and dashboard metrics */}
                    <div className="hud-bottom-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'auto' }}>
                      {/* Timeline seek progress bar track */}
                      <div className="hud-seekbar-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#fff', fontFamily: 'monospace', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{formatTime(currentTime)}</span>
                        <input
                          type="range"
                          min="0"
                          max={duration || 100}
                          value={currentTime}
                          onChange={handleSeekChange}
                          className="hud-seekbar"
                          style={{
                            flex: 1,
                            height: '4px',
                            borderRadius: '2px',
                            background: 'rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            outline: 'none',
                            accentColor: 'var(--theme-bright)'
                          }}
                        />
                        <span style={{ fontSize: '11px', color: '#fff', fontFamily: 'monospace', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{formatTime(duration)}</span>
                      </div>

                      {/* HUD controls toolbar */}
                      <div className="hud-actions-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Playback media controls */}
                        <div className="hud-bottom-actions">
                          <button onClick={() => {
                            const video = videoRef.current;
                            if (!video) return;
                            if (video.paused) video.play().catch(() => { });
                            else video.pause();
                          }} className="hud-control-btn play-btn">
                            {customPlaying ? '⏸' : '▶'}
                          </button>

                          {/* Episode Prev (Series Only) */}
                          {seasonsList.length > 0 && (
                            <button onClick={() => {
                              const currentList = seasonsList[selectedSeasonIndex]?.episodeList || [];
                              const idx = currentList.indexOf(Number(episode));
                              if (idx > 0) {
                                const prevEp = currentList[idx - 1];
                                setEpisode(prevEp);
                                loadPlayback(season, prevEp);
                              }
                            }} className="hud-control-btn" title="Previous Episode" style={{ opacity: (seasonsList[selectedSeasonIndex]?.episodeList || []).indexOf(Number(episode)) > 0 ? 1 : 0.4, pointerEvents: (seasonsList[selectedSeasonIndex]?.episodeList || []).indexOf(Number(episode)) > 0 ? 'auto' : 'none' }}>
                              ⏮
                            </button>
                          )}

                          {/* Quick Skips */}
                          <button onClick={() => {
                            if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                          }} className="hud-control-btn" title="Rewind 10s">⏪</button>
                          <button onClick={() => {
                            if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
                          }} className="hud-control-btn" title="Fast Forward 10s">⏩</button>

                          {/* Episode Next (Series Only) */}
                          {seasonsList.length > 0 && (
                            <button onClick={() => {
                              const currentList = seasonsList[selectedSeasonIndex]?.episodeList || [];
                              const idx = currentList.indexOf(Number(episode));
                              if (idx !== -1 && idx < currentList.length - 1) {
                                const nextEp = currentList[idx + 1];
                                setEpisode(nextEp);
                                loadPlayback(season, nextEp);
                              }
                            }} className="hud-control-btn" title="Next Episode" style={{ opacity: ((seasonsList[selectedSeasonIndex]?.episodeList || []).indexOf(Number(episode)) < (seasonsList[selectedSeasonIndex]?.episodeList?.length || 0) - 1) ? 1 : 0.4, pointerEvents: ((seasonsList[selectedSeasonIndex]?.episodeList || []).indexOf(Number(episode)) < (seasonsList[selectedSeasonIndex]?.episodeList?.length || 0) - 1) ? 'auto' : 'none' }}>
                              ⏭
                            </button>
                          )}

                          {/* Precise Custom volume bar */}
                          <div className="hud-volume-control">
                            <button onClick={() => {
                              const video = videoRef.current;
                              if (!video) return;
                              const muteState = !isMuted;
                              setIsMuted(muteState);
                              video.muted = muteState;
                            }} className="hud-control-btn">
                              {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={isMuted ? 0 : volume}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setVolume(val);
                                setIsMuted(false);
                                if (videoRef.current) {
                                  videoRef.current.volume = val;
                                  videoRef.current.muted = false;
                                }
                              }}
                              style={{ width: '60px', height: '3px', accentColor: 'var(--theme-bright)' }}
                            />
                          </div>
                        </div>

                        {/* Speeds and screens controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {/* Captions Unified Dropdown */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="hud-setting-label">💬 CC:</span>
                            <select
                              className="hud-premium-select"
                              value={activeCaption || 'off'}
                              onChange={(e) => {
                                const targetLang = e.target.value;
                                setActiveCaption(targetLang === 'off' ? '' : targetLang);
                                triggerToast(targetLang === 'off' ? 'Captions Off' : `Caption: ${e.target.options[e.target.selectedIndex].text}`);
                              }}
                            >
                              <option value="off">Off</option>
                              {captionsList.map((cap, idx) => (
                                <option key={idx} value={cap.langCode}>
                                  {cap.lanName || cap.languageName || cap.langCode.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="hud-setting-label">SPD:</span>
                            <select
                              value={playbackSpeed}
                              onChange={(e) => {
                                const spd = Number(e.target.value);
                                setPlaybackSpeed(spd);
                                if (videoRef.current) videoRef.current.playbackRate = spd;
                              }}
                              className="hud-premium-select"
                            >
                              <option value="0.5">0.5x</option>
                              <option value="1.0">1.0x Normal</option>
                              <option value="1.25">1.25x</option>
                              <option value="1.5">1.5x Fast</option>
                              <option value="2.0">2.0x</option>
                            </select>
                          </div>

                          {/* PiP Button */}
                          <button onClick={() => {
                            const video = videoRef.current;
                            if (!video) return;
                            if (document.pictureInPictureElement) {
                              document.exitPictureInPicture().catch(() => { });
                            } else if (video.requestPictureInPicture) {
                              video.requestPictureInPicture().catch(() => { });
                            }
                          }} className="hud-control-btn hud-pip-btn" title="Picture in Picture">
                            🔳
                          </button>

                          {/* Fit/Fill Toggle */}
                          <button onClick={() => {
                            setVideoFit(prev => prev === 'contain' ? 'cover' : 'contain');
                            triggerToast(videoFit === 'contain' ? 'Fit: Zoom (Fill)' : 'Fit: Normal');
                          }} className="hud-control-btn" title="Adjust Screen Size">
                            {videoFit === 'contain' ? '🔲' : '🔳'}
                          </button>

                          {/* Fullscreen handler button */}
                          <button onClick={() => {
                            const container = playerContainerRef.current;
                            if (!container) return;
                            if (!document.fullscreenElement) {
                              container.requestFullscreen().then(() => {
                                setIsFullscreen(true);
                              }).catch((err) => {
                                console.error('Error entering fullscreen:', err);
                              });
                            } else {
                              document.exitFullscreen().then(() => {
                                setIsFullscreen(false);
                              });
                            }
                          }} className="hud-control-btn" title="Fullscreen">
                            {isFullscreen ? '⏹' : '📺'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Landscape Stream Sidebar & Controls */}
              <div className="theater-sidebar">
                {/* Title + Badges - Single compact header */}
                <div className="theater-meta">
                  <h2 className="sidebar-title">{selected.title}</h2>
                  <div className="theater-meta-badges">
                    <span className="badge-premium">PREMIUM</span>
                    <span className="badge-lang">🎙️ {activeLanguage.toUpperCase()}</span>
                    {selected.genre && (() => {
                      const genres = selected.genre.split(',').map(g => g.trim());
                      const display = genres.slice(0, 2);
                      const extra = genres.length - display.length;
                      return (
                        <>
                          {display.map((g, i) => (
                            <span key={i} className="badge-genre">{g}</span>
                          ))}
                          {extra > 0 && (
                            <span className="badge-genre badge-more" title={genres.join(', ')}>{`+${extra}`}</span>
                          )}
                        </>
                      );
                    })()}
                    {selected.releaseDate && (
                      <span className="badge-genre">{selected.releaseDate.substring(0, 4)}</span>
                    )}
                    {selected.imdbRatingValue && (
                      <span className="badge-imdb">⭐ {selected.imdbRatingValue}</span>
                    )}
                  </div>
                </div>

                {/* Compact Controls Row: Audio + Quality side by side */}
                <div className="sidebar-controls-row">
                  {dubsList.length > 0 && (
                    <div className="sidebar-control-item">
                      <label>🌐 Audio</label>
                      <select
                        className="sidebar-select"
                        value={selected.subjectId}
                        onChange={(e) => {
                          const targetDub = dubsList.find((d) => String(d.subjectId) === String(e.target.value));
                          if (targetDub) switchLanguage(targetDub);
                        }}
                      >
                        {dubsList.map((dub, idx) => (
                          <option key={idx} value={dub.subjectId}>
                            {dub.lanName || dub.languageName || (dub.original ? 'Original' : `Dub ${idx + 1}`)} {dub.lanCode ? `(${dub.lanCode.toUpperCase()})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {qualities.length > 0 && (
                    <div className="sidebar-control-item">
                      <label>⚙️ Quality</label>
                      <select
                        className="sidebar-select"
                        value={playInfo?.videoUrl || ''}
                        onChange={(e) => {
                          const targetUrl = e.target.value;
                          setPlayInfo((prev) => ({
                            ...prev,
                            videoUrl: targetUrl,
                          }));
                          triggerToast(`Switching playback quality...`);
                        }}
                      >
                        {qualities.map((qItem, idx) => (
                          <option key={idx} value={qItem.url}>
                            {qItem.label} {qItem.size > 0 ? `(${formatBytes(qItem.size)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Download chips - inline compact row */}
                {qualities.length > 0 && (
                  <div className="sidebar-downloads-row">
                    <span className="sidebar-row-label">📥 Download</span>
                    <div className="sidebar-dl-chips">
                      {qualities.map((qItem, idx) => (
                        <a
                          key={`dl-${idx}`}
                          href={qItem.url}
                          download={`${selected.title.replace(/[\\/:*?"<>|]/g, '')} - ${qItem.label}.mp4`}
                          className="sidebar-dl-btn"
                        >
                          ⬇ {qItem.label} {qItem.size > 0 ? `(${formatBytes(qItem.size)})` : ''}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Season Picker (if series) */}
                {seasonsList.length > 0 && (
                  <div className="sidebar-control-item sidebar-season-picker">
                    <label>📺 Season</label>
                    <select
                      className="sidebar-select"
                      value={selectedSeasonIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setSelectedSeasonIndex(idx);
                        const sNum = seasonsList[idx].se || 1;
                        setSeason(sNum);
                        const eps = seasonsList[idx].episodeList || [];
                        const initialEp = eps.length > 0 ? eps[0] : 1;
                        setEpisode(initialEp);
                        loadPlayback(sNum, initialEp);
                      }}
                    >
                      {seasonsList.map((s, idx) => (
                        <option key={idx} value={idx}>
                          S{s.se || (idx + 1)} · {s.episodeList?.length || 0} Ep
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Episodes Grid */}
                {seasonsList.length > 0 && (
                  <div className="sidebar-episodes-grid-wrapper">
                    <label>Episodes</label>
                    <div className="sidebar-episodes-grid">
                      {(seasonsList[selectedSeasonIndex]?.episodeList || []).map((epNum) => (
                        <button
                          key={epNum}
                          className={`sidebar-ep-btn ${Number(episode) === epNum ? 'active' : ''}`}
                          onClick={() => {
                            setEpisode(epNum);
                            loadPlayback(season, epNum);
                          }}
                        >
                          {epNum}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions - Horizontal row */}
                <div className="sidebar-actions-row">
                  <button
                    className={`sidebar-action-btn ${watchlist.some((x) => x.subjectId === selected.subjectId) ? 'active' : ''}`}
                    onClick={() => toggleWatchlist(selected)}
                  >
                    {watchlist.some((x) => x.subjectId === selected.subjectId) ? '♥ Saved' : '+ Wishlist'}
                  </button>
                  <button
                    className="sidebar-action-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin + `?subjectId=${selected.subjectId}`);
                      triggerToast('Share link copied!');
                    }}
                  >
                    📤 Share
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
