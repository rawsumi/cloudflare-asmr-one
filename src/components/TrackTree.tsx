import React, { useState } from 'react';
import { TrackItem, FlatTrack } from '../types/asmr';
import { formatBytes, formatDuration, getDownloadProxyUrl } from '../services/api';
import {
  Folder,
  FolderOpen,
  FileAudio,
  FileText,
  FileImage,
  File,
  Play,
  Download,
  Copy,
  Check,
  BookOpen,
} from 'lucide-react';

interface TrackTreeProps {
  tracks: TrackItem[];
  workId: number;
  workTitle?: string;
  onPlayTrack: (track: FlatTrack) => void;
  onReadScript: (title: string, textUrl: string) => void;
}

export const TrackTree: React.FC<TrackTreeProps> = ({
  tracks,
  workId,
  workTitle,
  onPlayTrack,
  onReadScript,
}) => {
  return (
    <div className="space-y-1 select-none">
      {tracks.map((item, index) => (
        <TreeNode
          key={`${item.title}_${index}`}
          item={item}
          workId={workId}
          workTitle={workTitle}
          onPlayTrack={onPlayTrack}
          onReadScript={onReadScript}
          currentPath={item.title}
          depth={0}
        />
      ))}
    </div>
  );
};

interface TreeNodeProps {
  item: TrackItem;
  workId: number;
  workTitle?: string;
  onPlayTrack: (track: FlatTrack) => void;
  onReadScript: (title: string, textUrl: string) => void;
  currentPath: string;
  depth: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  item,
  workId,
  workTitle,
  onPlayTrack,
  onReadScript,
  currentPath,
  depth,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const isFolder = item.type === 'folder';

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isFolder) {
    const childCount = item.children?.length || 0;
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${Math.max(8, depth * 20)}px` }}
          className="w-full flex items-center justify-between py-2 pr-3 rounded-lg hover:bg-slate-800 text-left transition cursor-pointer text-xs font-semibold text-slate-200"
        >
          <div className="flex items-center gap-2 truncate">
            {isOpen ? (
              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span className="truncate">{item.title}</span>
            <span className="text-[10px] text-slate-500 font-normal">({childCount} items)</span>
          </div>
          <span className="text-slate-500 text-[10px]">{isOpen ? '▼' : '▶'}</span>
        </button>

        {isOpen && item.children && (
          <div className="border-l border-slate-700/60 ml-3">
            {item.children.map((child, idx) => (
              <TreeNode
                key={`${child.title}_${idx}`}
                item={child}
                workId={workId}
                workTitle={workTitle}
                onPlayTrack={onPlayTrack}
                onReadScript={onReadScript}
                currentPath={`${currentPath}/${child.title}`}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Non-folder file node
  const fileUrl = item.mediaDownloadUrl || item.mediaStreamUrl || '';
  const downloadUrl = fileUrl ? getDownloadProxyUrl(fileUrl, item.title) : '';
  const isAudio = item.type === 'audio';
  const isText = item.type === 'text';
  const isImage = item.type === 'image';

  const flatTrack: FlatTrack = {
    id: item.hash || `${workId}_${currentPath}`,
    title: item.title,
    type: item.type,
    size: item.size,
    duration: item.duration,
    streamUrl: item.mediaStreamUrl || '',
    downloadUrl: item.mediaDownloadUrl || item.mediaStreamUrl || '',
    path: currentPath,
    workId,
    workTitle,
  };

  return (
    <div
      style={{ paddingLeft: `${Math.max(8, depth * 20)}px` }}
      className="group flex items-center justify-between py-2 pr-3 rounded-lg hover:bg-slate-800/70 transition text-xs text-slate-300"
    >
      {/* File Info */}
      <div className="flex items-center gap-2.5 truncate mr-2 min-w-0">
        {isAudio && <FileAudio className="w-4 h-4 text-blue-400 shrink-0" />}
        {isText && <FileText className="w-4 h-4 text-amber-400 shrink-0" />}
        {isImage && <FileImage className="w-4 h-4 text-emerald-400 shrink-0" />}
        {!isAudio && !isText && !isImage && <File className="w-4 h-4 text-slate-400 shrink-0" />}

        <span className="truncate font-medium text-slate-200" title={item.title}>
          {item.title}
        </span>

        {item.size ? (
          <span className="text-[11px] text-slate-500 shrink-0">
            {formatBytes(item.size)}
          </span>
        ) : null}

        {item.duration ? (
          <span className="text-[11px] text-indigo-400 font-mono shrink-0">
            {formatDuration(item.duration)}
          </span>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isAudio && (
          <button
            type="button"
            onClick={() => onPlayTrack(flatTrack)}
            className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-md border border-blue-500/30 transition cursor-pointer"
            title="Play in docked audio player"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
        )}

        {isText && fileUrl && (
          <button
            type="button"
            onClick={() => onReadScript(item.title, fileUrl)}
            className="p-1.5 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 rounded-md border border-amber-500/30 transition cursor-pointer"
            title="Read Drama Script"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={item.title}
            className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded-md border border-emerald-500/30 transition"
            title="Direct download to device memory (supports resume)"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}

        {fileUrl && (
          <button
            type="button"
            onClick={() => handleCopyUrl(fileUrl)}
            className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-md transition cursor-pointer"
            title="Copy Direct URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
};
