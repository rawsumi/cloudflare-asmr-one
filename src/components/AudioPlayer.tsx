import React, { useRef, useState, useEffect } from 'react';
import { FlatTrack } from '../types/asmr';
import { formatDuration, getDownloadProxyUrl } from '../services/api';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Download,
  ListMusic,
  X,
  Music2,
  Radio,
} from 'lucide-react';

interface AudioPlayerProps {
  currentTrack: FlatTrack | null;
  playlist: FlatTrack[];
  onTrackChange: (track: FlatTrack) => void;
  onClosePlayer: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentTrack,
  playlist,
  onTrackChange,
  onClosePlayer,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Play track when currentTrack changes
  useEffect(() => {
    if (!currentTrack || !audioRef.current) return;

    setCurrentTime(0);
    setIsBuffering(true);
    const audio = audioRef.current;
    audio.src = currentTrack.streamUrl || currentTrack.downloadUrl;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch((e) => {
          console.warn('Auto-play was blocked or stream failed:', e);
          setIsPlaying(false);
          setIsBuffering(false);
        });
    }
  }, [currentTrack]);

  // Handle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleSkipTime = (seconds: number) => {
    if (!audioRef.current) return;
    const newTime = Math.min(Math.max(audioRef.current.currentTime + seconds, 0), duration || 999999);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleNextTrack = () => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex !== -1 && currentIndex < playlist.length - 1) {
      onTrackChange(playlist[currentIndex + 1]);
    } else if (playlist.length > 0) {
      onTrackChange(playlist[0]); // loop back
    }
  };

  const handlePrevTrack = () => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      onTrackChange(playlist[currentIndex - 1]);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.85;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  if (!currentTrack) return null;

  const downloadUrl = getDownloadProxyUrl(
    currentTrack.downloadUrl || currentTrack.streamUrl,
    currentTrack.title
  );

  return (
    <>
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={handleNextTrack}
        onError={(e) => {
          console.error('Audio stream playback error', e);
          setIsBuffering(false);
          setIsPlaying(false);
        }}
      />

      {/* Playlist Drawer */}
      {isQueueOpen && (
        <div className="fixed bottom-24 right-4 sm:right-8 z-40 w-80 sm:w-96 max-h-96 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5">
          <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-xs font-bold text-white">
            <div className="flex items-center gap-1.5">
              <ListMusic className="w-4 h-4 text-red-400" />
              <span>Playlist Queue ({playlist.length} tracks)</span>
            </div>
            <button
              onClick={() => setIsQueueOpen(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {playlist.map((track, idx) => {
              const isCurrent = track.id === currentTrack.id;
              return (
                <button
                  key={`${track.id}_${idx}`}
                  onClick={() => onTrackChange(track)}
                  className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                    isCurrent
                      ? 'bg-red-600/20 text-red-300 font-bold border border-red-500/30'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-slate-500 w-4">{idx + 1}</span>
                    <span className="truncate">{track.title}</span>
                  </div>
                  {track.duration && (
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {formatDuration(track.duration)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky Bottom Dock Player */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 py-2 sm:py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col gap-1.5">
          {/* Timeline slider */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span className="w-10 text-right">{formatDuration(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || currentTrack.duration || 100}
              step="1"
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
            <span className="w-10">{formatDuration(duration || currentTrack.duration)}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Track Info */}
            <div className="flex items-center gap-3 min-w-0 max-w-[35%] sm:max-w-[30%]">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-indigo-700 flex items-center justify-center text-white shrink-0 shadow-md">
                <Music2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate" title={currentTrack.title}>
                  {currentTrack.title}
                </h4>
                <p className="text-[11px] text-slate-400 truncate" title={currentTrack.workTitle || ''}>
                  {currentTrack.workTitle || `Work #${currentTrack.workId}`}
                </p>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={handlePrevTrack}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title="Previous Track"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleSkipTime(-10)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer hidden sm:block"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-950/40 hover:scale-105 active:scale-95 transition cursor-pointer shrink-0"
              >
                {isBuffering ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5 fill-current" />
                )}
              </button>

              <button
                onClick={() => handleSkipTime(10)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer hidden sm:block"
                title="Forward 10 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              <button
                onClick={handleNextTrack}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title="Next Track"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Volume and Extra Actions */}
            <div className="flex items-center gap-2">
              {/* Direct Track Download */}
              <a
                href={downloadUrl}
                download={currentTrack.title}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition hidden sm:flex items-center gap-1 text-xs"
                title="Download this audio track"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Save</span>
              </a>

              {/* Volume */}
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>

              {/* Queue Button */}
              {playlist.length > 0 && (
                <button
                  onClick={() => setIsQueueOpen(!isQueueOpen)}
                  className={`p-2 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs ${
                    isQueueOpen
                      ? 'bg-red-600/20 text-red-300 border border-red-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="View track playlist queue"
                >
                  <ListMusic className="w-4 h-4" />
                  <span className="hidden sm:inline">Queue ({playlist.length})</span>
                </button>
              )}

              {/* Close audio player */}
              <button
                onClick={onClosePlayer}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title="Close player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
