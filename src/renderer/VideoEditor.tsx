import React, { useRef, useState, useEffect, useCallback } from "react";
import ccIcon from "./icon/CC.png";
import textIcon from "./icon/T.png";
import videoIcon from "./icon/Video.png";
import audioIcon from "./icon/Audio.png";

export type TransitionType = "dissolve"|"fade_black"|"fade_white"|"wipe_left"|"wipe_right"|"push_left"|"push_right"|"zoom_in"|"zoom_out"|"spin"|"flash"|"glitch";
export interface TransitionClip {
  id: string;
  afterClipId: string;
  type: TransitionType;
  durationSec: number;
}
export interface ClipEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  vignette?: number;
  filmGrain?: number;
  lut?: string;
}
export interface ElementClip {
  id: string;
  type: "rect"|"circle"|"line"|"arrow"|"star"|"heart"|"emoji";
  emoji?: string;
  startSec: number;
  durationSec: number;
  x: number; y: number;
  width: number; height: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  rotation: number;
  opacity: number;
  track: 3;
}
export interface TimelineClip {
  id: string; path: string; label: string; durationSec: number; startSec: number;
  trimStart: number; trimEnd: number; track: number; color: string;
  speed?: number;
  clipVolume?: number;
  fadeIn?: number;
  fadeOut?: number;
  effects?: ClipEffects;
}
export interface TextClip {
 id: string; startSec: number; durationSec: number; track: 2; label: string;
 fontFamily: string; fontSize: number; color: string; bold: boolean; italic: boolean;
 underline: boolean; x: number; y: number; width: number; height: number; textStyle?: string;
 subtitle?: boolean; source?: "whisper";
}
export interface ListClip {
 id: string; startSec: number; durationSec: number;
 items: { id: string; text: string; revealSec: number }[];
 fontFamily: string; fontSize: number; textStyle: string;
 x: number; y: number; width: number; gap: number;
}
export interface VideoEditorProps {
 clips?: { path: string; label: string }[];
 savedTimeline?: TimelineClip[];
 savedTextClips?: TextClip[];
 onExport?: (clips: TimelineClip[], textClips: TextClip[]) => void;
 onClose?: (currentClips: TimelineClip[], textClips: TextClip[]) => void;
}

const CLIP_COLORS = ["#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#f97316","#84cc16"];
let _idCounter = 0;
const uid = () => `clip_${++_idCounter}_${Date.now()}`;
const fmt = (sec: number): string => {
 const m = Math.floor(sec/60).toString().padStart(2,"0");
 const s = Math.floor(sec%60).toString().padStart(2,"0");
 const fr = Math.floor((sec%1)*30).toString().padStart(2,"0");
 return `${m}:${s}:${fr}`;
};
const TEXT_STYLES: { id: string; label: string; wrapStyle: React.CSSProperties; textStyle: React.CSSProperties }[] = [
 { id:"plain", label:"Plain", wrapStyle:{}, textStyle:{ color:"#ffffff" } },
 { id:"outline", label:"Outline", wrapStyle:{}, textStyle:{ color:"#ffffff", textShadow:"2px 2px 0 #000,-2px 2px 0 #000,2px -2px 0 #000,-2px -2px 0 #000" } },
 { id:"dropshadow", label:"Drop shadow", wrapStyle:{}, textStyle:{ color:"#ffffff", textShadow:"3px 3px 6px rgba(0,0,0,0.9)" } },
 { id:"blackbox", label:"Black box", wrapStyle:{ background:"#000", borderRadius:4, padding:"2px 10px" }, textStyle:{ color:"#ffffff" } },
 { id:"whitebox", label:"White box", wrapStyle:{ background:"#ffffff", borderRadius:4, padding:"2px 10px" }, textStyle:{ color:"#000000" } },
 { id:"semitrans", label:"Semi-transparent", wrapStyle:{ background:"rgba(0,0,0,0.55)", borderRadius:4, padding:"2px 10px" }, textStyle:{ color:"#ffffff" } },
 { id:"yellowoutline", label:"Yellow outline", wrapStyle:{}, textStyle:{ color:"#facc15", textShadow:"2px 2px 0 #000,-2px 2px 0 #000,2px -2px 0 #000,-2px -2px 0 #000" } },
 { id:"bordered", label:"Bordered", wrapStyle:{ border:"2px solid #ffffff", borderRadius:3, padding:"2px 10px" }, textStyle:{ color:"#ffffff" } },
 { id:"redbanner", label:"Red banner", wrapStyle:{ background:"#ef4444", borderRadius:4, padding:"2px 10px" }, textStyle:{ color:"#ffffff" } },
 { id:"bluebanner", label:"Blue banner", wrapStyle:{ background:"#3b82f6", borderRadius:4, padding:"2px 10px" }, textStyle:{ color:"#ffffff" } },
 { id:"golditalic", label:"Gold italic", wrapStyle:{}, textStyle:{ color:"#fbbf24", fontStyle:"italic" } },
 { id:"pill", label:"Pill", wrapStyle:{ background:"rgba(0,0,0,0.55)", borderRadius:20, padding:"2px 14px" }, textStyle:{ color:"#ffffff" } },
];

const DEFAULT_FONT_OPTIONS = [
  "Arial",
  "Georgia",
  "Impact",
  "Trebuchet MS",
  "Arial Black",
  "Verdana",
  "Courier New",
  "Montserrat",
  "Poppins",
  "Oswald",
  "Anton",
  "Bebas Neue",
];
type SidePanel = "media"|"text"|"audio"|"transitions"|"effects"|"elements";
const NAV_ITEMS: { id: SidePanel; icon: string; label: string }[] = [
 { id:"media", icon:"⬆", label:"Import" }, { id:"audio", icon:"♪", label:"Audio" },
 { id:"text", icon:"T", label:"Text" }, { id:"transitions", icon:"⟷", label:"Transitions" },
 { id:"effects", icon:"✦", label:"Effects" }, { id:"elements", icon:"⊞", label:"Elements" },
];

export const VideoEditor: React.FC<VideoEditorProps> = ({ clips: initialClips=[], savedTimeline, savedTextClips, onExport, onClose }) => {
 const [activePanel, setActivePanel] = useState<SidePanel>("media");
 const [previewWidth, setPreviewWidth] = useState(380);
 const [showTrackMenu, setShowTrackMenu] = useState(false);
 const [extraTracks, setExtraTracks] = useState<{ id: number; label: string; type: "video"|"audio" }[]>([]);
 const [binClips, setBinClips] = useState<{ path: string; label: string; color: string; hasAudio?: boolean; durationSec?: number|null }[]>(
  () => initialClips.map((c,i) => ({ ...c, color: CLIP_COLORS[i%CLIP_COLORS.length] }))
 );
 const [tool, setTool] = useState<"select"|"razor"|"hand"|"zoom">("select");
 const [playing, setPlaying] = useState(false);
 const [currentTime, setCurrentTime] = useState(0);
 const [volume, setVolume] = useState(80);
 const [zoom, setZoom] = useState(80);
 const [snap, setSnap] = useState(true);
 const [selectedId, setSelectedId] = useState<string|null>(null);
 const [history, setHistory] = useState<TimelineClip[][]>([]);
 const [dropTarget, setDropTarget] = useState<number|null>(null);
 const [contextMenu, setContextMenu] = useState<{ x:number; y:number; clipId:string }|null>(null);
 const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
 const [renamingId, setRenamingId] = useState<string|null>(null);
 const [renameValue, setRenameValue] = useState("");
 const [unlinkedIds, setUnlinkedIds] = useState<Set<string>>(new Set());
 const [textClips, setTextClips] = useState<TextClip[]>(savedTextClips ?? []);
 const [selectedTextId, setSelectedTextId] = useState<string|null>(null);
 const [bulkTextSelection, setBulkTextSelection] = useState<null | "all_subtitles" | "all_text">(null);
 const [listClips, setListClips] = useState<ListClip[]>([]);
 const [selectedListId, setSelectedListId] = useState<string|null>(null);
 const [transitions, setTransitions] = useState<TransitionClip[]>([]);
 const [selectedTransitionId, setSelectedTransitionId] = useState<string|null>(null);
 const [elements, setElements] = useState<ElementClip[]>([]);
 const [selectedElementId, setSelectedElementId] = useState<string|null>(null);
 const [mediaSearch, setMediaSearch] = useState("");
 const [exportTitle, setExportTitle] = useState("My project");

 // Local export dialog state (editor-owned export)
 const [exportOpen, setExportOpen] = useState(false);
 const [exporting, setExporting] = useState(false);
 const [exportFolder, setExportFolder] = useState<string | null>(null);
 const [exportResolution, setExportResolution] = useState("1080x1920");
 const [exportCodec, setExportCodec] = useState("H.264");
 const [exportFps, setExportFps] = useState("29.97");
 const [exportSampleRate, setExportSampleRate] = useState("44100");
 const [exportAudioChannels, setExportAudioChannels] = useState<"stereo" | "mono">("stereo");
 const [exportQuality, setExportQuality] = useState<"draft" | "good" | "high">("good");
 const [exportAdvancedOpen, setExportAdvancedOpen] = useState(false);
 // Audio panel state
const [whisperLang, setWhisperLang] = useState("auto");
const [whisperRunning, setWhisperRunning] = useState(false);
const [whisperStatus, setWhisperStatus] = useState("");
const [maxSubtitleWords, setMaxSubtitleWords] = useState(10); // 1-30 words per subtitle
const [ttsText, setTtsText] = useState("");
const [ttsVoice, setTtsVoice] = useState("Ryan");
const [ttsInstruct, setTtsInstruct] = useState("");
const [ttsRunning, setTtsRunning] = useState(false);
const [ttsStatus, setTtsStatus] = useState("");
const [audioOverlay, setAudioOverlay] = useState<null | "subtitles" | "tts">(null);
 const TEXT_CATEGORIES = ["Featured","Abstract","Basic","Education and work","Family and kids","Gaming and tech","Health and fitness","Hobbies and art","Holidays and events","Magic and mystery","Nature and travel","Opening","Speech bubbles","Vlogging and style"];
 const [textCategory, setTextCategory] = useState("Featured");
 const [fontOptions, setFontOptions] = useState<string[]>(DEFAULT_FONT_OPTIONS);
 const [clips, setClips] = useState<TimelineClip[]>(() => savedTimeline?.length ? savedTimeline : []);

 const videoRef = useRef<HTMLVideoElement>(null);
 const audioRef = useRef<HTMLAudioElement>(null);
 const tlRef = useRef<HTMLDivElement>(null);
 const rafRef = useRef<number>(0);
 const dragRef = useRef<{ id:string; startX:number; startSec:number }|null>(null);
 const isDraggingClip = useRef(false);
 const trimRef = useRef<{ id:string; edge:"start"|"end"; startX:number; origTS:number; origTE:number; origDur:number; origStart:number }|null>(null);
 const binDragData = useRef<{ path:string; label:string; color:string; hasAudio?: boolean; durationSec?: number|null }|null>(null);

 useEffect(() => {
  const styleId = "avm-local-fonts";
  if (document.getElementById(styleId)) return;
  const toFileUrl = (p: string) => `file:///${p.replace(/\\/g, "/")}`;
  const base = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Tools\\Fonts";
  const css = `
@font-face { font-family: "Montserrat"; src: url("${toFileUrl(`${base}\\Montserrat-Regular.ttf`)}") format("truetype"); font-display: swap; }
@font-face { font-family: "Poppins"; src: url("${toFileUrl(`${base}\\Poppins-Regular.ttf`)}") format("truetype"); font-display: swap; }
@font-face { font-family: "Oswald"; src: url("${toFileUrl(`${base}\\Oswald-Regular.ttf`)}") format("truetype"); font-display: swap; }
@font-face { font-family: "Anton"; src: url("${toFileUrl(`${base}\\Anton-Regular.ttf`)}") format("truetype"); font-display: swap; }
@font-face { font-family: "Bebas Neue"; src: url("${toFileUrl(`${base}\\BebasNeue-Regular.ttf`)}") format("truetype"); font-display: swap; }
`;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
 }, []);

 useEffect(() => {
  const api = (window as any).api;
  if (!api?.listLocalFonts) return;
  api.listLocalFonts()
    .then((names: string[]) => {
      if (!Array.isArray(names) || !names.length) return;
      const merged = Array.from(new Set([...DEFAULT_FONT_OPTIONS, ...names])).sort((a,b)=>a.localeCompare(b));
      setFontOptions(merged);
    })
    .catch(() => {});
 }, []);

 const totalDuration = clips.length ? Math.max(...clips.map(c => c.startSec+c.durationSec-c.trimStart-c.trimEnd)) : 30;
 const selected = clips.find(c => c.id===selectedId) ?? null;
 const activeTextClips = textClips.filter(c => currentTime>=c.startSec && currentTime<c.startSec+c.durationSec);
 const activeListClips = listClips.filter(c => currentTime>=c.startSec && currentTime<c.startSec+c.durationSec);
 const isBulkSelectedText = (tc: TextClip) =>
  bulkTextSelection === "all_subtitles" ? !!tc.subtitle : bulkTextSelection === "all_text" ? !tc.subtitle : false;

 const pushHistory = useCallback((snapshot: TimelineClip[]) => { setHistory(h => [...h.slice(-30), snapshot]); }, []);
 const undo = useCallback(() => { setHistory(h => { if(!h.length) return h; setClips(h[h.length-1]); return h.slice(0,-1); }); }, []);

 const clipsRef = useRef(clips); const playingRef = useRef(playing);
 const currentTimeRef = useRef(currentTime); const totalDurRef = useRef(totalDuration);
 const lastScrubTime = useRef<number>(-1);
 useEffect(() => { clipsRef.current=clips; }, [clips]);
 useEffect(() => { playingRef.current=playing; }, [playing]);
 useEffect(() => { currentTimeRef.current=currentTime; }, [currentTime]);
 useEffect(() => { totalDurRef.current=totalDuration; }, [totalDuration]);

 const clipAtTime = (t:number) => clipsRef.current.filter(c=>c.track===0).find(c=>t>=c.startSec&&t<c.startSec+c.durationSec-c.trimStart-c.trimEnd)??null;
 const clipAtTimeOnTrack = (t:number,track:number) => clipsRef.current.filter(c=>c.track===track).find(c=>t>=c.startSec&&t<c.startSec+c.durationSec-c.trimStart-c.trimEnd)??null;

 const syncVideoToTime = useCallback((t:number) => {
  const vid=videoRef.current; if(!vid||isDraggingClip.current) return;
  const clip=clipAtTime(t);
  if(!clip){vid.pause();vid.removeAttribute("src");vid.load();return;}
  const url=`file:///${clip.path.replace(/\\/g,"/")}`;
  const offset=Math.max(0,t-clip.startSec+clip.trimStart);
  if(vid.src!==url){vid.pause();vid.src=url;vid.load();vid.addEventListener("loadedmetadata",()=>{if((vid as any).fastSeek)(vid as any).fastSeek(offset);else vid.currentTime=offset;},{once:true});}
  else{if((vid as any).fastSeek)(vid as any).fastSeek(offset);else vid.currentTime=offset;}
 },[]);

 const audioLoadingRef = useRef(false);

const syncAudioToTime = useCallback((t: number) => {
  const aud = audioRef.current;
  if (!aud || isDraggingClip.current) return;

  const clip = clipAtTimeOnTrack(t, 1);

  // 1. If no clip, just clear the source and stop. 
  // Don't just pause, or it might get stuck on an old frame.
  if (!clip) {
    if (aud.src !== "") aud.src = ""; 
    return;
  }

  const url = `file:///${clip.path.replace(/\\/g, "/")}`;
  const offset = Math.max(0, t - clip.startSec + clip.trimStart);

  // 2. ONLY update the source if it's a different file
  if (aud.src !== url) {
    if (audioLoadingRef.current) return;
    audioLoadingRef.current = true;
    aud.src = url;
    aud.load();

    const onReady = () => {
      audioLoadingRef.current = false;
      aud.currentTime = offset;
      aud.volume = volume / 100;
      // Important: If we are 'playing', start the new source immediately
      if (playingRef.current) aud.play().catch(() => {}); 
      aud.removeEventListener("canplay", onReady);
    };
    aud.addEventListener("canplay", onReady);
  } else {
    // 3. CRITICAL SYNC FIX: 
    // Only 'jump' the audio time if it drifts by more than 0.1 seconds.
    // If we set it every frame, the audio will NEVER play sound!
    if (Math.abs(aud.currentTime - offset) > 0.1) {
      aud.currentTime = offset;
    }
  }
}, [volume]);

 const tick = useCallback(() => {
  if(isDraggingClip.current){rafRef.current=requestAnimationFrame(tick);return;}
  const vid=videoRef.current;const t=currentTimeRef.current;const clip=clipAtTime(t);

  // Keep audio track 1 aligned with the playhead during playback
  syncAudioToTime(t);

  if(clip&&vid&&!vid.paused){
   const tlTime=clip.startSec+(vid.currentTime-clip.trimStart);
   if(Math.abs(tlTime-currentTimeRef.current)>0.001){currentTimeRef.current=tlTime;setCurrentTime(tlTime);}
   const clipEnd=clip.startSec+clip.durationSec-clip.trimStart-clip.trimEnd;
   if(tlTime>=clipEnd-0.05){
    const nextClip=clipsRef.current.filter(c=>c.track===0&&c.startSec>clip.startSec).sort((a,b)=>a.startSec-b.startSec)[0];
    if(nextClip){syncVideoToTime(nextClip.startSec);currentTimeRef.current=nextClip.startSec;setCurrentTime(nextClip.startSec);if(playingRef.current)vid.play().catch(()=>{});}
    else{vid.pause();setPlaying(false);setCurrentTime(0);currentTimeRef.current=0;return;}
   }
  } else if (!clip && playingRef.current) {
   // No video clip under the playhead. If there is audio, let audio drive time.
   const aud = audioRef.current;
   const audioClip = clipAtTimeOnTrack(currentTimeRef.current, 1);

   if (aud && audioClip && !aud.paused) {
    // Map audio local time back to global timeline time
    const tlTime = audioClip.startSec + (aud.currentTime - audioClip.trimStart);
    currentTimeRef.current = tlTime;
    setCurrentTime(tlTime);
   } else {
    // No media driving the clock; stop at timeline end
    if (currentTimeRef.current >= totalDurRef.current) {
     setPlaying(false);
     setCurrentTime(0);
     currentTimeRef.current = 0;
     return;
    }
   }
  }
  rafRef.current=requestAnimationFrame(tick);
 },[syncVideoToTime,syncAudioToTime]);

 useEffect(() => {
  const vid = videoRef.current;
  const aud = audioRef.current;

  if (playing) {
    console.log("All Clips:", clips); 
    console.log("Audio Clips on Track 1:", clips.filter(c => c.track === 1));
    syncVideoToTime(currentTimeRef.current);
    syncAudioToTime(currentTimeRef.current);

    if (vid) vid.play().catch(() => {});

    // --- AUDIO FIX START ---
    if (aud) {
      aud.muted = false;             // 1. Ensure it's not muted
      aud.volume = volume / 100;     // 2. Set the volume (0.0 to 1.0)
      aud.play().catch(err => {
        console.error("Audio failed:", err);
      });
    }
    // --- AUDIO FIX END ---

    rafRef.current = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(rafRef.current);
    if (vid) vid.pause();
    if (aud) aud.pause();
  }
  return () => cancelAnimationFrame(rafRef.current);
 }, [playing, tick, syncVideoToTime, syncAudioToTime, volume]); // Added 'volume' to dependency array

 useEffect(()=>{if(audioRef.current)audioRef.current.volume=volume/100;},[volume]);

 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
 if(e.key===" "){
  const tag=(document.activeElement as HTMLElement)?.tagName;
  const isTyping=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
  if(isTyping) return;
  e.preventDefault();setPlaying(p=>!p);
 }
   if((e.ctrlKey||e.metaKey)&&e.key==="z")undo();
      if(e.key==="Delete"||e.key==="Backspace"){
    const tag=(document.activeElement as HTMLElement)?.tagName;
    const isTyping=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
    if(isTyping) return;
    if(selectedId){setClips(prev=>{pushHistory(prev);return prev.filter(c=>c.id!==selectedId);});setSelectedId(null);}
    else if(selectedTextId){setTextClips(prev=>prev.filter(c=>c.id!==selectedTextId));setSelectedTextId(null);}
    else if(selectedListId){setListClips(prev=>prev.filter(c=>c.id!==selectedListId));setSelectedListId(null);}
    else if(selectedElementId){setElements(prev=>prev.filter(e=>e.id!==selectedElementId));setSelectedElementId(null);}
    else if(selectedTransitionId){setTransitions(prev=>prev.filter(t=>t.id!==selectedTransitionId));setSelectedTransitionId(null);}
    }
  };
  window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
 },[selectedId,selectedTextId,selectedListId,selectedElementId,selectedTransitionId,undo,pushHistory]);

 const onClipMouseDown=(e:React.MouseEvent,id:string)=>{
  if(tool!=="select")return;e.preventDefault();e.stopPropagation();setSelectedId(id);
  const clip=clips.find(c=>c.id===id)!;
  const partner=unlinkedIds.has(clip.id)?null:clips.find(c=>c.id!==id&&c.path===clip.path&&Math.abs(c.startSec-clip.startSec)<0.01&&c.track!==clip.track)??null;
  dragRef.current={id,startX:e.clientX,startSec:clip.startSec};isDraggingClip.current=true;
  const clipEl=document.getElementById(`clip-${id}`);const partnerEl=partner?document.getElementById(`clip-${partner.id}`):null;
  let finalSec=clip.startSec;
  const onMove=(ev:MouseEvent)=>{
   if(!dragRef.current)return;
   const dSec=(ev.clientX-dragRef.current.startX)/zoom;let ns=Math.max(0,dragRef.current.startSec+dSec);
   const clipDur=clip.durationSec-clip.trimStart-clip.trimEnd;const origStart=dragRef.current.startSec;
   const trackClips=clipsRef.current.filter(c=>c.track===clip.track&&c.id!==clip.id);
   const prevClip=trackClips.filter(c=>(c.startSec+c.durationSec-c.trimStart-c.trimEnd)<=origStart+0.0001).sort((a,b)=>(b.startSec+b.durationSec-b.trimStart-b.trimEnd)-(a.startSec+a.durationSec-a.trimStart-a.trimEnd))[0];
   const nextClip=trackClips.filter(c=>c.startSec>=origStart+clipDur-0.0001).sort((a,b)=>a.startSec-b.startSec)[0];
   let minSec=prevClip?prevClip.startSec+prevClip.durationSec-prevClip.trimStart-prevClip.trimEnd:0;
   let maxSec=nextClip?nextClip.startSec-clipDur:totalDurRef.current-clipDur;
   if(partner){
    const partnerDur=partner.durationSec-partner.trimStart-partner.trimEnd;
    const pTrackClips=clipsRef.current.filter(c=>c.track===partner.track&&c.id!==partner.id&&c.id!==clip.id);
    const pPrev=pTrackClips.filter(c=>(c.startSec+c.durationSec-c.trimStart-c.trimEnd)<=origStart+0.0001).sort((a,b)=>(b.startSec+b.durationSec-b.trimStart-b.trimEnd)-(a.startSec+a.durationSec-a.trimStart-a.trimEnd))[0];
    const pNext=pTrackClips.filter(c=>c.startSec>=origStart+partnerDur-0.0001).sort((a,b)=>a.startSec-b.startSec)[0];
    minSec=Math.max(minSec,pPrev?pPrev.startSec+pPrev.durationSec-pPrev.trimStart-pPrev.trimEnd:0);
    maxSec=Math.min(maxSec,pNext?pNext.startSec-partnerDur:totalDurRef.current-partnerDur);
   }
   ns=Math.max(minSec,Math.min(maxSec,ns));if(snap)ns=Math.round(ns*4)/4;ns=Math.max(minSec,Math.min(maxSec,ns));finalSec=ns;
   if(clipEl)clipEl.style.left=`${finalSec*zoom}px`;if(partnerEl)partnerEl.style.left=`${finalSec*zoom}px`;
  };
  const onUp=()=>{
   isDraggingClip.current=false;dragRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);
   pushHistory(clips);
   setClips(prev=>{
    let updated=prev.map(c=>{if(c.id===id)return{...c,startSec:finalSec};if(partner&&c.id===partner.id)return{...c,startSec:finalSec};return c;});
    const draggedClip=updated.find(c=>c.id===id);if(!draggedClip)return updated;
    const oppositeTrack=draggedClip.track===0?1:0;
    const mergeTarget=updated.find(c=>{if(c.track!==oppositeTrack)return false;if(Math.abs(c.startSec-finalSec)>=0.5)return false;return!updated.some(o=>o.id!==c.id&&o.track!==c.track&&Math.abs(o.startSec-c.startSec)<0.01);});
    if(!unlinkedIds.has(draggedClip.id)&&mergeTarget)updated=updated.map(c=>c.id===draggedClip.id?{...c,startSec:mergeTarget.startSec}:c);
    return updated;
   });
   syncVideoToTime(currentTimeRef.current);syncAudioToTime(currentTimeRef.current);
  };
  window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
 };

 const onTrimMouseDown=(e:React.MouseEvent,id:string,edge:"start"|"end")=>{
  e.preventDefault();e.stopPropagation();
  const clip=clips.find(c=>c.id===id)!;
  trimRef.current={id,edge,startX:e.clientX,origTS:clip.trimStart,origTE:clip.trimEnd,origDur:clip.durationSec,origStart:clip.startSec};
  const onMove=(ev:MouseEvent)=>{
   if(!trimRef.current)return;
   const{id:tid,edge:te,startX,origTS,origTE,origDur,origStart}=trimRef.current;const dx=(ev.clientX-startX)/zoom;
   setClips(prev=>prev.map(c=>{if(c.id!==tid)return c;if(te==="start"){const ts=Math.max(0,Math.min(origTS+dx,origDur-origTE-0.5));return{...c,trimStart:ts,startSec:origStart+(ts-origTS)};}else{const te2=Math.max(0,Math.min(origTE-dx,origDur-origTS-0.5));return{...c,trimEnd:te2};}}));
  };
  const onUp=()=>{pushHistory(clips);trimRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
 };

 const razorCut=(id:string,atSec:number)=>{
  const clip=clipsRef.current.find(c=>c.id===id);if(!clip)return;
  const rel=atSec-clip.startSec+clip.trimStart;
  if(rel<=clip.trimStart||rel>=clip.durationSec-clip.trimEnd)return;
  const leftId=uid();const rightId=uid();
  const audioPartner=clipsRef.current.find(c=>c.path===clip.path&&c.startSec===clip.startSec&&c.track!==clip.track&&c.durationSec===clip.durationSec&&c.trimStart===clip.trimStart&&c.trimEnd===clip.trimEnd);
  setClips(prev=>{pushHistory(prev);return[...prev.filter(c=>c.id!==id),{...clip,id:leftId,trimEnd:clip.durationSec-rel},{...clip,id:rightId,startSec:clip.startSec+(rel-clip.trimStart),trimStart:rel}];});
  setUnlinkedIds(prev=>{const next=new Set(prev);next.add(leftId);next.add(rightId);if(audioPartner)next.add(audioPartner.id);return next;});
 };

 const findPartner=(clip:TimelineClip):TimelineClip|null=>clips.find(c=>c.path===clip.path&&c.startSec===clip.startSec&&c.track!==clip.track&&c.durationSec===clip.durationSec&&c.trimStart===clip.trimStart&&c.trimEnd===clip.trimEnd)??null;
 const handleUnlink=(clipId:string)=>{
  const clip=clips.find(c=>c.id===clipId);if(!clip)return;
  const partner=findPartner(clip);const newClipId=uid();const newPartnerId=partner?uid():null;
  setClips(prev=>prev.map(c=>{if(c.id===clipId)return{...c,id:newClipId};if(partner&&c.id===partner.id)return{...c,id:newPartnerId!};return c;}));
  setUnlinkedIds(prev=>{const next=new Set(prev);next.add(newClipId);if(newPartnerId)next.add(newPartnerId);return next;});
  const toHighlight=new Set<string>([newClipId]);if(newPartnerId)toHighlight.add(newPartnerId);
  setHighlightIds(toHighlight);setTimeout(()=>setHighlightIds(new Set()),1200);setContextMenu(null);
 };
 const handleDeleteFromMenu=(clipId:string)=>{setClips(prev=>{pushHistory(prev);return prev.filter(c=>c.id!==clipId);});setContextMenu(null);};
 const handleRenameStart=(clipId:string)=>{const clip=clips.find(c=>c.id===clipId);if(!clip)return;setRenamingId(clipId);setRenameValue(clip.label);setContextMenu(null);};
 const handleRenameCommit=()=>{if(!renamingId)return;setClips(prev=>prev.map(c=>c.id===renamingId?{...c,label:renameValue}:c));setRenamingId(null);};
 const handleRazorFromMenu=(clipId:string)=>{const clip=clips.find(c=>c.id===clipId);if(!clip||!contextMenu||!tlRef.current)return;const rect=tlRef.current.getBoundingClientRect();razorCut(clipId,Math.max(0,(contextMenu.x-rect.left+tlRef.current.scrollLeft)/zoom));setContextMenu(null);};

 const scrubRef=useRef(false);
 useEffect(()=>{
  const close=()=>{setContextMenu(null);setShowTrackMenu(false);};
  window.addEventListener("mousedown",close);return()=>window.removeEventListener("mousedown",close);
 },[]);

 const getTimeFromEvent=(clientX:number):number=>{const tl=tlRef.current;if(!tl)return 0;const rect=tl.getBoundingClientRect();return Math.max(0,Math.min((clientX-rect.left+tl.scrollLeft)/zoom,totalDuration));};
 const seekPendingRef=useRef(false);const pendingOffsetRef=useRef<{url:string;offset:number}|null>(null);
 const flushSeek=useCallback((vid:HTMLVideoElement)=>{
  const next=pendingOffsetRef.current;if(!next)return;
  pendingOffsetRef.current=null;seekPendingRef.current=true;vid.currentTime=next.offset;
  if("requestVideoFrameCallback" in vid){(vid as any).requestVideoFrameCallback(()=>{seekPendingRef.current=false;if(pendingOffsetRef.current)flushSeek(vid);});}
  else{(vid as HTMLVideoElement).addEventListener("seeked",()=>{seekPendingRef.current=false;if(pendingOffsetRef.current)flushSeek(vid);},{once:true});}
 },[]);

 const applyScrub=useCallback((t:number)=>{
  if(Math.abs(t-lastScrubTime.current)<0.016)return;
  lastScrubTime.current=t;currentTimeRef.current=t;setCurrentTime(t);
  const vid=videoRef.current;const clip=clipAtTime(t);
  if(!clip||!vid){if(vid){vid.pause();vid.removeAttribute("src");vid.load();}return;}
  const url=`file:///${clip.path.replace(/\\/g,"/")}`;
  const offset=Math.max(0,t-clip.startSec+clip.trimStart);
  if(vid.src!==url){vid.pause();vid.src=url;vid.load();vid.addEventListener("loadedmetadata",()=>{vid.currentTime=offset;},{once:true});return;}
  pendingOffsetRef.current={url,offset};if(!seekPendingRef.current)flushSeek(vid);syncAudioToTime(t);
 },[syncAudioToTime,flushSeek]);

 const onTimelineMouseDown=(e:React.MouseEvent)=>{
  if(e.button!==0)return;if(tool!=="select"&&tool!=="hand")return;
  const wasPlaying=playingRef.current;if(wasPlaying){setPlaying(false);cancelAnimationFrame(rafRef.current);}
  scrubRef.current=true;applyScrub(getTimeFromEvent(e.clientX));
  const onMove=(ev:MouseEvent)=>{if(scrubRef.current)applyScrub(getTimeFromEvent(ev.clientX));};
  const onUp=()=>{scrubRef.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);if(wasPlaying)setPlaying(true);};
  window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
 };

 const onClipClick=(e:React.MouseEvent,id:string)=>{if(tool!=="razor")return;e.stopPropagation();const rect=tlRef.current!.getBoundingClientRect();razorCut(id,(e.clientX-rect.left+(tlRef.current?.scrollLeft??0))/zoom);};

 const renderRuler=()=>{
  const step=zoom>=120?1:zoom>=60?2:zoom>=30?5:10;const ticks:React.ReactNode[]=[];
  for(let s=0;s<=totalDuration+step;s+=step){
   ticks.push(<div key={s} style={{position:"absolute",left:s*zoom,top:0,height:"100%",display:"flex",flexDirection:"column",alignItems:"flex-start"}}><div style={{width:1,height:8,background:"#2d3748"}}/><span style={{fontSize:9,color:"#4a5568",fontFamily:"monospace",marginLeft:3,userSelect:"none"}}>{fmt(s)}</span></div>);
  }
  return ticks;
 };

 const handleAddClips=async()=>{
  const api=(window as any).api;if(!api?.pickFolderAndListVideos)return;
  const result=await api.pickFolderAndListVideos();if(!result?.files)return;
  const newBinClips=(result.files as any[]).map((f,i)=>({
    path:f.path as string,
    label:(f.path as string).split(/[\\/]/).pop()??f.path,
    color:CLIP_COLORS[(binClips.length+i)%CLIP_COLORS.length],
    hasAudio:!!f.hasAudio,
    durationSec:typeof f.durationSec==="number"?f.durationSec:10,
  }));
  setBinClips(prev=>{const existingPaths=new Set(prev.map(c=>c.path));return[...prev,...newBinClips.filter(c=>!existingPaths.has(c.path))];});
 };

 const onBinDragStart=(e:React.DragEvent,clip:{path:string;label:string;color:string;hasAudio?:boolean;durationSec?:number|null})=>{
  binDragData.current=clip;e.dataTransfer.effectAllowed="copy";e.dataTransfer.setData("text/plain",JSON.stringify(clip));
  const ghost=document.createElement("div");ghost.style.cssText="position:fixed;top:-200px;left:-200px;width:140px;height:32px;background:#1d4ed8;color:#fff;font-size:11px;border-radius:6px;border:1px solid #3b82f6;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:99999;";ghost.textContent=clip.label;document.body.appendChild(ghost);e.dataTransfer.setDragImage(ghost,70,16);setTimeout(()=>{if(ghost.parentNode)ghost.parentNode.removeChild(ghost);},100);
 };

 const onTrackDragEnter=(e:React.DragEvent,trackId:number)=>{e.preventDefault();setDropTarget(trackId);};
 const onTrackDragOver=(e:React.DragEvent)=>{e.preventDefault();e.dataTransfer.dropEffect="copy";};
 const onTrackDragLeave=(e:React.DragEvent)=>{const related=e.relatedTarget as Node|null;if(related&&(e.currentTarget as Node).contains(related))return;setDropTarget(null);};

 const onTrackDrop=(e:React.DragEvent,trackId:number)=>{
  e.preventDefault();e.stopPropagation();setDropTarget(null);
  let clipData=binDragData.current;
  if(!clipData){try{clipData=JSON.parse(e.dataTransfer.getData("text/plain"));}catch{return;}}
  if(!clipData||!tlRef.current)return;
  const rect=tlRef.current.getBoundingClientRect();
  let startSec=Math.max(0,(e.clientX-rect.left+tlRef.current.scrollLeft)/zoom);
  if(snap)startSec=Math.round(startSec*4)/4;
  pushHistory(clips);
  if(trackId===0){
   const existingVideo=clips.filter(c=>c.track===0);
   if(existingVideo.length){const lastEnd=Math.max(...existingVideo.map(c=>c.startSec+c.durationSec-c.trimStart-c.trimEnd));if(startSec<lastEnd)startSec=lastEnd;}
   const baseDur = typeof clipData.durationSec === "number" && clipData.durationSec > 0 ? clipData.durationSec : 10;
   const videoClip:TimelineClip={id:uid(),path:clipData.path,label:clipData.label,durationSec:baseDur,startSec,trimStart:0,trimEnd:0,track:0,color:clipData.color};
   const newClips:TimelineClip[] = [videoClip];
   if (clipData.hasAudio) {
     const audioClip:TimelineClip={id:uid(),path:clipData.path,label:`${clipData.label} [audio]`,durationSec:baseDur,startSec,trimStart:0,trimEnd:0,track:1,color:clipData.color};
     newClips.push(audioClip);
   }
   setClips(prev=>[...prev,...newClips]);setSelectedId(videoClip.id);
  } else {
   const baseDur = typeof clipData.durationSec === "number" && clipData.durationSec > 0 ? clipData.durationSec : 10;
   const singleClip:TimelineClip={id:uid(),path:clipData.path,label:clipData.label,durationSec:baseDur,startSec,trimStart:0,trimEnd:0,track:trackId,color:clipData.color};
   setClips(prev=>[...prev,singleClip]);setSelectedId(singleClip.id);
  }
  binDragData.current=null;
 };

 const deleteSelected=()=>{
  if(!selectedId)return;
  setClips(prev=>{
    pushHistory(prev);
    const next = prev.filter(c=>c.id!==selectedId);
    // If we just deleted an audio clip on track 1, stop the audio element if nothing remains under the playhead.
    const deleted = prev.find(c=>c.id===selectedId);
    if (deleted && deleted.track===1 && audioRef.current) {
      const stillHasAudioHere = next.some(c=>c.track===1 && currentTimeRef.current>=c.startSec && currentTimeRef.current<c.startSec+c.durationSec-c.trimStart-c.trimEnd);
      if (!stillHasAudioHere) audioRef.current.pause();
    }
    return next;
  });
  setSelectedId(null);
 };


 const addTrack=(type:"video"|"audio"|"text")=>{
  setShowTrackMenu(false);
  if(type==="text"){
   const id=uid();
   setTextClips(prev=>[...prev,{id,startSec:0,durationSec:5,track:2,label:"New text",fontFamily:"Georgia",fontSize:36,color:"#ffffff",bold:false,italic:false,underline:false,x:50,y:50,width:40,height:20,textStyle:"plain"}]);
   setSelectedTextId(id);
  } else {
   setExtraTracks(prev=>{
    const usedIds=new Set([0,1,...prev.map(t=>t.id)]);let newId=2;while(usedIds.has(newId))newId++;
    const sameTypeCount=prev.filter(t=>t.type===type).length;
    const label=type==="video"?`Video ${sameTypeCount+2}`:`Audio ${sameTypeCount+2}`;
    return[...prev,{id:newId,label,type}];
   });
  }
 };

 const updateText=(id:string,patch:Partial<TextClip>)=>{
  setTextClips(prev=>{
    // In bulk mode, style/layout edits apply to all targeted clips.
    // Label typing remains single-clip to avoid unintentionally replacing every subtitle text.
    if (bulkTextSelection && !(Object.keys(patch).length === 1 && "label" in patch)) {
      const applyTo = (c: TextClip) =>
        bulkTextSelection === "all_subtitles" ? !!c.subtitle : !c.subtitle;
      return prev.map(c=>applyTo(c)?{...c,...patch}:c);
    }
    return prev.map(c=>c.id===id?{...c,...patch}:c);
  });
 };
 const updateList=(id:string,patch:Partial<ListClip>)=>{setListClips(prev=>prev.map(c=>c.id===id?{...c,...patch}:c));};

 const addListClip=()=>{
  const id=uid();
  const dur=totalDuration;
  const count=5;
  const spacing=dur/count;
  const items=Array.from({length:count},(_,i)=>({id:uid(),text:`Item ${i+1}`,revealSec:Math.round(i*spacing*4)/4}));
  const newList:ListClip={id,startSec:0,durationSec:dur,items,fontFamily:"Impact",fontSize:32,textStyle:"yellowoutline",x:15,y:20,width:40,gap:16};
  setListClips(prev=>[...prev,newList]);setSelectedListId(id);setSelectedTextId(null);setSelectedId(null);
 };

 const handleWhisperGenerate = async () => {
  const videoClip = clips.find(c => c.track === 0);
  if (!videoClip) return;
  setWhisperRunning(true);
  setWhisperStatus("Running Whisper — this may take a minute...");
  try {
    const api = (window as any).api;
    const result = await api.whisperTranscribe({
      videoPath: videoClip.path,
      language: whisperLang === "auto" ? undefined : whisperLang,
    });
    const segments: {
      start: number;
      end: number;
      text: string;
      words?: { start: number; end: number; word: string }[];
    }[] = result.segments;
    if (!segments.length) {
      setWhisperStatus("No speech detected.");
      return;
    }

    const maxWords = Math.max(1, Math.min(30, maxSubtitleWords || 10));
    const newTextClips: TextClip[] = [];
    let lastEnd = 0; // ensure subtitles never overlap in time

    for (const seg of segments) {
      const timedWords = (seg.words || [])
        .filter(w => typeof w.start === "number" && typeof w.end === "number" && (w.word || "").trim().length > 0)
        .map(w => ({ ...w, word: (w.word || "").trim() }));

      // Preferred path: use word timestamps for accurate sync
      if (timedWords.length > 0) {
        for (let i = 0; i < timedWords.length; i += maxWords) {
          const chunkWords = timedWords.slice(i, i + maxWords);
          if (!chunkWords.length) continue;

          let chunkStart = chunkWords[0].start;
          let chunkEnd = chunkWords[chunkWords.length - 1].end;

          if (chunkStart < lastEnd) chunkStart = lastEnd;
          if (chunkEnd <= chunkStart + 0.02) continue;

          const rawText = chunkWords.map(w => w.word).join(" ");
          const cleanLabel = rawText.replace(/^[\s,!.?&#]+|[\s,!.?&#]+$/g, "");
          const visibleDur = Math.max(0.3, chunkEnd - chunkStart);

          lastEnd = chunkEnd;

          newTextClips.push({
            id: uid(),
            startSec: chunkStart,
            durationSec: visibleDur,
            track: 2,
            label: cleanLabel || rawText,
            fontFamily: "Arial",
            fontSize: 28,
            color: "#ffffff",
            bold: false,
            italic: false,
            underline: false,
            x: 50,
            y: 82,
            width: 80,
            height: 15,
            textStyle: "plain",
            subtitle: true,
            source: "whisper",
          });
        }
        continue;
      }

      // Fallback path when word timings are unavailable
      const words = (seg.text || "").split(/\s+/).filter(Boolean);
      if (!words.length) continue;

      const totalDur = Math.max(0.5, seg.end - seg.start);
      const chunks: string[][] = [];
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords));
      }

      const perChunkDur = totalDur / chunks.length || totalDur;

      chunks.forEach((chunk, idx) => {
        let chunkStart = seg.start + idx * perChunkDur;
        let chunkEnd = idx === chunks.length - 1 ? seg.end : seg.start + (idx + 1) * perChunkDur;

        if (chunkStart < lastEnd) chunkStart = lastEnd;
        if (chunkEnd <= chunkStart + 0.02) return;

        const rawText = chunk.join(" ");
        const cleanLabel = rawText.replace(/^[\s,!.?&#]+|[\s,!.?&#]+$/g, "");
        const visibleDur = Math.max(0.3, chunkEnd - chunkStart);

        lastEnd = chunkEnd;

        newTextClips.push({
          id: uid(),
          startSec: chunkStart,
          durationSec: visibleDur,
          track: 2,
          label: cleanLabel || rawText,
          fontFamily: "Arial",
          fontSize: 28,
          color: "#ffffff",
          bold: false,
          italic: false,
          underline: false,
          x: 50,
          y: 82,
          width: 80,
          height: 15,
          textStyle: "plain",
          subtitle: true,
          source: "whisper",
        });
      });
    }

    if (!newTextClips.length) {
      setWhisperStatus("No usable subtitle chunks generated.");
      return;
    }

    // Replace previous auto-subtitles on each generation
    setTextClips(prev => [
      ...prev.filter(c => !(c.subtitle || c.source === "whisper")),
      ...newTextClips,
    ]);
    setWhisperStatus(`✓ Created ${newTextClips.length} subtitle clips.`);
  } catch (err: any) {
    setWhisperStatus(`Error: ${err.message || String(err)}`);
  } finally {
    setWhisperRunning(false);
  }
};

const handleQwenTts = async () => {
  if (!ttsText.trim()) return;
  setTtsRunning(true);
  setTtsStatus("Generating with Qwen3-TTS...");
  try {
    const api = (window as any).api;
    const result = await api.qwenTts({
      text: ttsText.trim(),
      voice: ttsVoice,
      instruct: ttsInstruct.trim() || undefined,
    });

    const outputPath: string = result.outputPath;
    const durationSec: number | null = typeof result.durationSec === "number" && result.durationSec > 0
      ? result.durationSec
      : null;
    const label = outputPath.split(/[\\/]/).pop() ?? "tts-output.wav";

    // 1) Add to media bin for reuse
    setBinClips(prev => [...prev, {
      path: outputPath,
      label,
      color: "#8b5cf6",
      durationSec: durationSec ?? undefined,
      hasAudio: true,
    }]);

    // 2) Auto-attach as an audio clip on track 1 at timeline start
    setClips(prev => {
      const baseDur = durationSec && durationSec > 0 ? durationSec : 10;
      const startSec = 0; // attach at beginning of timeline
      const audioClip: TimelineClip = {
        id: uid(),
        path: outputPath,
        label,
        durationSec: baseDur,
        startSec,
        trimStart: 0,
        trimEnd: 0,
        track: 1,
        color: "#8b5cf6",
      };
      return [...prev, audioClip];
    });

    setTtsStatus("✓ Voice generated and added to Audio 1 track.");
    setActivePanel("audio");
  } catch (err: any) {
    setTtsStatus(`Error: ${err.message || String(err)}`);
  } finally {
    setTtsRunning(false);
  }
};


 const onTextClipMouseDown=(e:React.MouseEvent,id:string)=>{
  if(tool!=="select")return;e.preventDefault();e.stopPropagation();setSelectedTextId(id);setBulkTextSelection(null);setSelectedId(null);setSelectedListId(null);
  const clip=textClips.find(c=>c.id===id)!;const startX=e.clientX;const origStart=clip.startSec;const el=document.getElementById(`tclip-${id}`);let finalSec=origStart;
  const onMove=(ev:MouseEvent)=>{finalSec=Math.max(0,origStart+(ev.clientX-startX)/zoom);if(el)el.style.left=`${finalSec*zoom}px`;};
  const onUp=()=>{setTextClips(prev=>prev.map(c=>c.id===id?{...c,startSec:finalSec}:c));window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
 };

 const onListClipMouseDown=(e:React.MouseEvent,id:string)=>{
  if(tool!=="select")return;e.preventDefault();e.stopPropagation();setSelectedListId(id);setSelectedTextId(null);setSelectedId(null);
  const clip=listClips.find(c=>c.id===id)!;const startX=e.clientX;const origStart=clip.startSec;const el=document.getElementById(`lclip-${id}`);let finalSec=origStart;
  const onMove=(ev:MouseEvent)=>{finalSec=Math.max(0,origStart+(ev.clientX-startX)/zoom);if(el)el.style.left=`${finalSec*zoom}px`;};
  const onUp=()=>{setListClips(prev=>prev.map(c=>c.id===id?{...c,startSec:finalSec}:c));window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
 };

 const tlWidth=Math.max(totalDuration*zoom+300,1200);

 return (
  <div style={{display:"flex",flexDirection:"column",height:"100vh",width:"100%",background:"#111214",color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif",overflow:"hidden",userSelect:"none"}}>
   <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

    {/* Icon nav */}
    <div style={{width:56,background:"#1a1b1f",borderRight:"1px solid #26282e",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:6,gap:1,flexShrink:0}}>
     {NAV_ITEMS.map(item=>(
      <button key={item.id} onClick={()=>setActivePanel(item.id)} title={item.label} style={{width:48,minHeight:50,borderRadius:7,border:"none",cursor:"pointer",background:activePanel===item.id?"#23252c":"transparent",color:activePanel===item.id?"#e2e8f0":"#6b7280",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,transition:"all 0.1s"}}
       onMouseEnter={e=>{if(activePanel!==item.id)(e.currentTarget.style.background="#1e2027");}} onMouseLeave={e=>{if(activePanel!==item.id)(e.currentTarget.style.background="transparent");}}>
       <span style={{fontSize:item.id==="text"?18:16,fontWeight:item.id==="text"?700:400,lineHeight:1}}>{item.icon}</span>
       <span style={{fontSize:9,fontWeight:500,letterSpacing:"0.02em"}}>{item.label}</span>
      </button>
     ))}
    </div>

    {/* Category sidebar */}
    {(activePanel==="text"||activePanel==="transitions"||activePanel==="effects"||activePanel==="elements")&&(
     <div style={{width:160,background:"#161719",borderRight:"1px solid #26282e",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>
      <div style={{padding:"14px 14px 10px",fontSize:16,fontWeight:600,color:"#e2e8f0",flexShrink:0}}>{{text:"Titles",transitions:"Transitions",effects:"Effects",elements:"Elements"}[activePanel as string]}</div>
      {activePanel==="text"&&(<>
       {[{label:"Recent",count:textClips.length+listClips.length},{label:"Favorites",count:0}].map(row=>(
        <div key={row.label} onClick={()=>setTextCategory(row.label)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",cursor:"pointer",background:textCategory===row.label?"#23252c":"transparent",borderRadius:6,margin:"0 4px"}}
         onMouseEnter={e=>{if(textCategory!==row.label)(e.currentTarget.style.background="#1e2027");}} onMouseLeave={e=>{if(textCategory!==row.label)(e.currentTarget.style.background="transparent");}}>
         <span style={{fontSize:13,color:textCategory===row.label?"#e2e8f0":"#9ca3af"}}>{row.label}</span>
         <span style={{fontSize:11,color:"#6b7280",background:"#26282e",borderRadius:10,padding:"1px 7px"}}>{row.count}</span>
        </div>
       ))}
       <div style={{padding:"10px 14px 4px",fontSize:10,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em"}}>CATEGORIES</div>
       {TEXT_CATEGORIES.map(cat=>(
        <div key={cat} onClick={()=>setTextCategory(cat)} style={{padding:"7px 14px",cursor:"pointer",fontSize:13,color:textCategory===cat?"#e2e8f0":"#9ca3af",background:textCategory===cat?"#23252c":"transparent",borderRadius:6,margin:"0 4px"}}
         onMouseEnter={e=>{if(textCategory!==cat)(e.currentTarget.style.background="#1e2027");}} onMouseLeave={e=>{if(textCategory!==cat)(e.currentTarget.style.background="transparent");}}>{cat}</div>
       ))}
      </>)}
      {activePanel==="transitions"&&(
        <>
          {[{id:"all",label:"All"},{id:"dissolves",label:"Dissolves"},{id:"wipes",label:"Wipes"},{id:"motion",label:"Motion"},{id:"creative",label:"Creative"}].map(cat=>(
            <div key={cat.id} style={{padding:"7px 14px",cursor:"pointer",fontSize:13,color:"#9ca3af",borderRadius:6,margin:"0 4px"}}
             onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#1e2027"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>{cat.label}</div>
          ))}
        </>
      )}
      {activePanel==="effects"&&(
        <>
          {[{id:"presets",label:"Presets"},{id:"adjust",label:"Adjust"}].map(cat=>(
            <div key={cat.id} style={{padding:"7px 14px",cursor:"pointer",fontSize:13,color:"#9ca3af",borderRadius:6,margin:"0 4px"}}
             onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#1e2027"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>{cat.label}</div>
          ))}
        </>
      )}
      {activePanel==="elements"&&(
        <>
          {[{id:"shapes",label:"Shapes"},{id:"emojis",label:"Emojis"},{id:"overlays",label:"Overlays"}].map(cat=>(
            <div key={cat.id} style={{padding:"7px 14px",cursor:"pointer",fontSize:13,color:"#9ca3af",borderRadius:6,margin:"0 4px"}}
             onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#1e2027"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>{cat.label}</div>
          ))}
        </>
      )}
     </div>
    )}

    {/* Content area */}
    <div style={{flex:1,background:"#0d0e11",display:"flex",flexDirection:"column",overflow:"hidden"}}>
     {activePanel==="media"&&(
      <div style={{height:40,background:"#111214",borderBottom:"1px solid #26282e",display:"flex",alignItems:"center",padding:"0 16px",gap:4,flexShrink:0}}>
       {["File import","Project files","Sample videos","Backgrounds"].map((tab,i)=>(
        <button key={tab} style={{background:"transparent",border:"none",borderBottom:i===0?"2px solid #3b82f6":"2px solid transparent",color:i===0?"#e2e8f0":"#6b7280",padding:"0 12px",height:"100%",fontSize:13,cursor:"pointer"}}
         onMouseEnter={e=>{if(i!==0)(e.currentTarget.style.color="#9ca3af");}} onMouseLeave={e=>{if(i!==0)(e.currentTarget.style.color="#6b7280");}}>{tab}</button>
       ))}
      </div>
     )}
     {activePanel==="media"&&(
      <div style={{flex:1,display:"flex",padding:16,overflow:"hidden"}}>
       <div style={{flex:1,height:"100%",border:"1.5px dashed #26282e",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,overflow:"hidden"}}
        onDragOver={e=>{e.preventDefault();(e.currentTarget as HTMLDivElement).style.borderColor="#3b82f6";}}
        onDragLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#26282e";}}
        onDrop={e=>{e.preventDefault();(e.currentTarget as HTMLDivElement).style.borderColor="#26282e";}}>
        {binClips.length===0?(<><div style={{fontSize:13,color:"#4b5563"}}>Drag files or folders here</div><button onClick={handleAddClips} style={{background:"#2563eb",border:"none",color:"#fff",padding:"9px 24px",borderRadius:20,fontSize:13,fontWeight:600,cursor:"pointer"}}>Add Files</button></>):(
         <div style={{width:"100%",height:"100%",overflowY:"auto",padding:16,display:"flex",flexWrap:"wrap",gap:12,alignContent:"flex-start"}}>
          {binClips.map(clip=>(
           <div key={clip.path} draggable onDragStart={e=>onBinDragStart(e,clip)} style={{width:140,display:"flex",flexDirection:"column",gap:6,cursor:"grab"}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.opacity="0.8"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.opacity="1"}>
            <div style={{width:140,height:90,background:clip.color+"22",border:`1px solid ${clip.color}44`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🎬</div>
            <span style={{fontSize:11,color:"#9ca3af",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clip.label}</span>
           </div>
          ))}
          <div onClick={handleAddClips} style={{width:140,height:90,border:"1.5px dashed #374151",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",color:"#4b5563",fontSize:11}}
           onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#3b82f6";(e.currentTarget as HTMLDivElement).style.color="#3b82f6";}}
           onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#374151";(e.currentTarget as HTMLDivElement).style.color="#4b5563";}}>
           <span style={{fontSize:22}}>+</span><span>Add more</span>
          </div>
         </div>
        )}
       </div>
      </div>
     )}

     {activePanel==="text"&&(
      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
       <div style={{padding:"10px 16px 8px",borderBottom:"1px solid #26282e",flexShrink:0,display:"flex",gap:8,alignItems:"center"}}>
        <div style={{flex:1,background:"#1a1b1f",border:"1px solid #26282e",borderRadius:7,display:"flex",alignItems:"center",gap:6,padding:"6px 10px"}}><span style={{color:"#6b7280",fontSize:13}}>🔍</span><input placeholder="Search" style={{background:"transparent",border:"none",outline:"none",color:"#e2e8f0",fontSize:12,flex:1}}/></div>
        <div style={{background:"#1a1b1f",border:"1px solid #26282e",borderRadius:7,padding:"6px 12px",fontSize:11,color:"#9ca3af",cursor:"pointer"}}>Free ▾</div>
       </div>
       <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
         <button onClick={()=>{const id=uid();const clip:TextClip={id,startSec:currentTime,durationSec:5,track:2,label:"New text",fontFamily:"Georgia",fontSize:36,color:"#ffffff",bold:false,italic:false,underline:false,x:50,y:50,width:40,height:20,textStyle:"plain"};setTextClips(prev=>[...prev,clip]);setSelectedTextId(id);setBulkTextSelection(null);setSelectedListId(null);setSelectedId(null);}}
          style={{flex:1,background:"#1e3a5f",border:"1px solid #2563eb",color:"#93c5fd",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>+ Add Text</button>
         <button onClick={addListClip} style={{flex:1,background:"#1a2e1a",border:"1px solid #22c55e",color:"#86efac",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>+ Add List</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button
            onClick={()=>{
              const first = textClips.find(c=>c.subtitle);
              if (!first) return;
              setSelectedTextId(first.id);
              setBulkTextSelection("all_subtitles");
              setSelectedListId(null);
              setSelectedId(null);
            }}
            style={{flex:1,background:bulkTextSelection==="all_subtitles"?"#164e63":"#111827",border:"1px solid #22d3ee",color:"#67e8f9",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}
          >Select all subtitles</button>
          <button
            onClick={()=>{
              const first = textClips.find(c=>!c.subtitle);
              if (!first) return;
              setSelectedTextId(first.id);
              setBulkTextSelection("all_text");
              setSelectedListId(null);
              setSelectedId(null);
            }}
            style={{flex:1,background:bulkTextSelection==="all_text"?"#2e1065":"#111827",border:"1px solid #7c3aed",color:"#c4b5fd",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}
          >Select all text</button>
        </div>

        {(textClips.length>0||listClips.length>0)&&(
         <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:16}}>
          {textClips.map(tc=>(
           <div key={tc.id} onClick={()=>{setSelectedTextId(tc.id);setBulkTextSelection(null);setSelectedListId(null);setSelectedId(null);}} style={{width:130,cursor:"pointer",display:"flex",flexDirection:"column",gap:5}}>
            <div style={{width:130,height:82,background:(selectedTextId===tc.id||isBulkSelectedText(tc))?"#2e1065":"#1a1b1f",border:`1.5px solid ${(selectedTextId===tc.id||isBulkSelectedText(tc))?"#7c3aed":"#26282e"}`,boxShadow:isBulkSelectedText(tc)?"0 0 0 1px #a78bfa inset":"none",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
             <span style={{fontFamily:tc.fontFamily,fontSize:Math.min(tc.fontSize*0.4,20),color:tc.color,fontWeight:tc.bold?700:400,fontStyle:tc.italic?"italic":"normal",textAlign:"center",padding:"0 8px",wordBreak:"break-word"}}>{tc.label}</span>
            </div>
            <span style={{fontSize:10,color:"#9ca3af",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tc.label}</span>
           </div>
          ))}
          {listClips.map(lc=>(
           <div key={lc.id} onClick={()=>{setSelectedListId(lc.id);setSelectedTextId(null);setSelectedId(null);}} style={{width:130,cursor:"pointer",display:"flex",flexDirection:"column",gap:5}}>
            <div style={{width:130,height:82,background:selectedListId===lc.id?"#0d2e0d":"#1a1b1f",border:`1.5px solid ${selectedListId===lc.id?"#22c55e":"#26282e"}`,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"flex-start",justifyContent:"center",overflow:"hidden",padding:"4px 8px",gap:2}}>
             {lc.items.slice(0,3).map((item,i)=>(<span key={item.id} style={{fontSize:9,color:"#facc15",fontFamily:lc.fontFamily,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{i+1}. {item.text}</span>))}
             {lc.items.length>3&&<span style={{fontSize:9,color:"#6b7280"}}>+{lc.items.length-3} more</span>}
            </div>
            <span style={{fontSize:10,color:"#86efac",textAlign:"center"}}>List ({lc.items.length} items)</span>
           </div>
          ))}
         </div>
        )}
        {textClips.length===0&&listClips.length===0&&(<div style={{color:"#374151",fontSize:12,textAlign:"center",padding:"40px 0"}}>No text or lists yet</div>)}

        {/* Text settings */}
        {selectedTextId&&(()=>{const tc=textClips.find(c=>c.id===selectedTextId);if(!tc)return null;return(
         <div style={{background:"#1a1b1f",border:"1px solid #26282e",borderRadius:10,padding:14,marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontSize:11,fontWeight:600,color:"#7c3aed",letterSpacing:"0.07em"}}>TEXT SETTINGS</div>
          <div>
            <div style={{fontSize:9,color:"#6b7280",marginBottom:4}}>STYLE PRESET</div>
            <select
              value={tc.textStyle ?? "plain"}
              onChange={e=>updateText(tc.id,{textStyle:e.target.value})}
              style={{width:"100%",background:"#111214",color:"#e2e8f0",border:"1px solid #374151",borderRadius:6,padding:"6px 8px",fontSize:11}}
            >
              {TEXT_STYLES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <textarea value={tc.label} rows={2} onChange={e=>updateText(tc.id,{label:e.target.value})} style={{background:"#111214",border:"1px solid #374151",borderRadius:6,color:"#e2e8f0",padding:"7px 9px",fontSize:12,resize:"vertical",fontFamily:"inherit"}}/>
          <div style={{display:"flex",gap:8}}>
           <select value={tc.fontFamily} onChange={e=>updateText(tc.id,{fontFamily:e.target.value})} style={{flex:1,background:"#111214",color:"#e2e8f0",border:"1px solid #374151",borderRadius:6,padding:"5px 8px",fontSize:11}}>
            {fontOptions.map(f=><option key={f} value={f}>{f}</option>)}
           </select>
           <div style={{display:"flex",alignItems:"center",gap:5,background:"#111214",border:"1px solid #374151",borderRadius:6,padding:"0 8px"}}>
            <input type="range" min={10} max={120} value={tc.fontSize} onChange={e=>updateText(tc.id,{fontSize:+e.target.value})} style={{width:60,accentColor:"#7c3aed"}}/>
            <span style={{fontSize:10,color:"#a78bfa",minWidth:22}}>{tc.fontSize}</span>
           </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
           {([{key:"bold",l:"B",s:{fontWeight:700}},{key:"italic",l:"I",s:{fontStyle:"italic" as const}},{key:"underline",l:"U",s:{textDecoration:"underline" as const}}] as {key:keyof TextClip;l:string;s:React.CSSProperties}[]).map(({key,l,s})=>(
            <button key={key} onClick={()=>updateText(tc.id,{[key]:!tc[key]} as Partial<TextClip>)} style={{...s,width:34,height:34,borderRadius:6,fontSize:13,background:tc[key]?"#4c1d95":"#111214",border:`1px solid ${tc[key]?"#7c3aed":"#374151"}`,color:"#e2e8f0",cursor:"pointer"}}>{l}</button>
           ))}
           <div style={{flex:1}}/>
           <input type="color" value={tc.color} onChange={e=>updateText(tc.id,{color:e.target.value})} style={{width:34,height:34,borderRadius:6,border:"1px solid #374151",cursor:"pointer",background:"none"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
           {["width","height","durationSec"].map(key=>(
            <div key={key} style={{flex:1}}>
             <div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>{key==="durationSec"?"Dur":key==="width"?"W%":"H%"}</div>
             <input type="number" min={key==="durationSec"?0.5:5} step={key==="durationSec"?0.5:1} max={100} value={key==="durationSec"?tc.durationSec:Math.round((tc as any)[key])} onChange={e=>updateText(tc.id,{[key]:+e.target.value} as any)} style={{width:"100%",background:"#111214",border:"1px solid #374151",borderRadius:6,color:"#e2e8f0",padding:"5px 6px",fontSize:11}}/>
            </div>
           ))}
          </div>
          <button onClick={()=>{setTextClips(prev=>prev.filter(c=>c.id!==tc.id));setSelectedTextId(null);}} style={{background:"#1a0808",border:"1px solid #450a0a",color:"#ef4444",borderRadius:6,padding:7,fontSize:11,cursor:"pointer"}}>🗑 Delete</button>
         </div>
        );})()}

        {/* List settings */}
        {selectedListId&&(()=>{const lc=listClips.find(c=>c.id===selectedListId);if(!lc)return null;return(
         <div style={{background:"#1a1b1f",border:"1px solid #26282e",borderRadius:10,padding:14,marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontSize:11,fontWeight:600,color:"#22c55e",letterSpacing:"0.07em"}}>LIST SETTINGS</div>
          <div>
            <div style={{fontSize:9,color:"#6b7280",marginBottom:4}}>STYLE PRESET</div>
            <select
              value={lc.textStyle}
              onChange={e=>updateList(lc.id,{textStyle:e.target.value})}
              style={{width:"100%",background:"#111214",color:"#e2e8f0",border:"1px solid #374151",borderRadius:6,padding:"6px 8px",fontSize:11}}
            >
              {TEXT_STYLES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8}}>
           <select value={lc.fontFamily} onChange={e=>updateList(lc.id,{fontFamily:e.target.value})} style={{flex:1,background:"#111214",color:"#e2e8f0",border:"1px solid #374151",borderRadius:6,padding:"5px 8px",fontSize:11}}>
            {fontOptions.map(f=><option key={f} value={f}>{f}</option>)}
           </select>
           <div style={{display:"flex",alignItems:"center",gap:5,background:"#111214",border:"1px solid #374151",borderRadius:6,padding:"0 8px"}}>
            <input type="range" min={14} max={80} value={lc.fontSize} onChange={e=>updateList(lc.id,{fontSize:+e.target.value})} style={{width:60,accentColor:"#22c55e"}}/>
            <span style={{fontSize:10,color:"#86efac",minWidth:22}}>{lc.fontSize}</span>
           </div>
          </div>
          {/* Spacing control */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
           <span style={{fontSize:11,color:"#6b7280",flexShrink:0}}>Spacing</span>
           <input type="range" min={0} max={120} step={1} value={lc.gap} onChange={e=>updateList(lc.id,{gap:+e.target.value})} style={{flex:1,accentColor:"#22c55e"}}/>
           <input type="number" min={0} max={120} step={1} value={lc.gap} onChange={e=>updateList(lc.id,{gap:+e.target.value})} style={{width:52,background:"#111214",border:"1px solid #374151",borderRadius:6,color:"#22d3ee",padding:"5px 6px",fontSize:11}}/>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
           <span style={{fontSize:11,color:"#6b7280",flexShrink:0}}>Duration (s)</span>
           <input type="number" min={1} step={0.5} value={lc.durationSec} onChange={e=>updateList(lc.id,{durationSec:+e.target.value})} style={{width:70,background:"#111214",border:"1px solid #374151",borderRadius:6,color:"#e2e8f0",padding:"5px 6px",fontSize:11}}/>
          </div>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:2}}>ITEMS — set reveal time for each</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
           {lc.items.map((item,idx)=>(
            <div key={item.id} style={{display:"flex",gap:6,alignItems:"center"}}>
             <span style={{fontSize:11,color:"#86efac",flexShrink:0,minWidth:18}}>{idx+1}.</span>
             <input value={item.text} onChange={e=>{const newItems=lc.items.map(it=>it.id===item.id?{...it,text:e.target.value}:it);updateList(lc.id,{items:newItems});}} style={{flex:1,background:"#111214",border:"1px solid #374151",borderRadius:5,color:"#e2e8f0",padding:"4px 7px",fontSize:11}}/>
             <input type="number" min={0} step={0.5} value={item.revealSec} onChange={e=>{const newItems=lc.items.map(it=>it.id===item.id?{...it,revealSec:+e.target.value}:it);updateList(lc.id,{items:newItems});}} style={{width:52,background:"#111214",border:"1px solid #374151",borderRadius:5,color:"#22d3ee",padding:"4px 5px",fontSize:11}} title="Reveal at (seconds)"/>
             <button onClick={()=>{if(lc.items.length<=1)return;updateList(lc.id,{items:lc.items.filter(it=>it.id!==item.id)});}} style={{background:"transparent",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,lineHeight:1,padding:"0 2px"}}>×</button>
            </div>
           ))}
          </div>
          <button onClick={()=>{const lastReveal=lc.items.length?lc.items[lc.items.length-1].revealSec+2:lc.startSec;updateList(lc.id,{items:[...lc.items,{id:uid(),text:"New item",revealSec:lastReveal}]});}} style={{background:"#0d2e0d",border:"1px solid #22c55e",color:"#86efac",borderRadius:6,padding:"6px",fontSize:11,cursor:"pointer"}}>+ Add item</button>
          <button onClick={()=>{setListClips(prev=>prev.filter(c=>c.id!==lc.id));setSelectedListId(null);}} style={{background:"#1a0808",border:"1px solid #450a0a",color:"#ef4444",borderRadius:6,padding:7,fontSize:11,cursor:"pointer"}}>🗑 Delete list</button>
         </div>
        );})()}
       </div>
      </div>
     )}

     {activePanel==="transitions"&&(
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
       <div style={{padding:"10px 16px 8px",borderBottom:"1px solid #26282e",flexShrink:0,fontSize:12,color:"#6b7280"}}>Click or drag a transition onto the timeline between two clips</div>
       <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexWrap:"wrap",gap:12,alignContent:"flex-start"}}>
        {([
          {type:"dissolve",label:"Dissolve",color:"#6366f1",css:{background:"linear-gradient(90deg,#6366f120,#6366f180,#6366f120)",animation:"none"}},
          {type:"fade_black",label:"Fade Black",color:"#000",css:{background:"linear-gradient(90deg,transparent,#000,transparent)"}},
          {type:"fade_white",label:"Fade White",color:"#fff",css:{background:"linear-gradient(90deg,transparent,#fff,transparent)"}},
          {type:"wipe_left",label:"Wipe Left",color:"#3b82f6",css:{background:"linear-gradient(270deg,#3b82f640,#3b82f6,#3b82f640)"}},
          {type:"wipe_right",label:"Wipe Right",color:"#06b6d4",css:{background:"linear-gradient(90deg,#06b6d440,#06b6d4,#06b6d440)"}},
          {type:"push_left",label:"Push Left",color:"#8b5cf6",css:{background:"linear-gradient(270deg,#8b5cf640,#8b5cf6,#8b5cf640)"}},
          {type:"push_right",label:"Push Right",color:"#a78bfa",css:{background:"linear-gradient(90deg,#a78bfa40,#a78bfa,#a78bfa40)"}},
          {type:"zoom_in",label:"Zoom In",color:"#10b981",css:{background:"radial-gradient(circle,#10b98180,transparent)"}},
          {type:"zoom_out",label:"Zoom Out",color:"#34d399",css:{background:"radial-gradient(circle at center,transparent,#34d39980)"}},
          {type:"spin",label:"Spin",color:"#f59e0b",css:{background:"conic-gradient(from 0deg,#f59e0b40,#f59e0b,#f59e0b40)"}},
          {type:"flash",label:"Flash",color:"#fbbf24",css:{background:"linear-gradient(90deg,#fbbf2400,#fbbf24,#fbbf2400)"}},
          {type:"glitch",label:"Glitch",color:"#ef4444",css:{background:"linear-gradient(90deg,#ef444440,#22d3ee80,#ef444480,#22d3ee40)"}},
        ] as {type:TransitionType;label:string;color:string;css:React.CSSProperties}[]).map(tr=>(
          <div key={tr.type}
           onClick={()=>{
            if(!selectedId)return;
            const id=uid();
            setTransitions(prev=>[...prev,{id,afterClipId:selectedId,type:tr.type,durationSec:0.5}]);
           }}
           style={{width:120,height:80,background:"#1a1b1f",border:"1px solid #26282e",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",gap:4,overflow:"hidden",position:"relative"}}
           onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=tr.color;(e.currentTarget as HTMLDivElement).style.boxShadow=`0 0 8px ${tr.color}44`;}}
           onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#26282e";(e.currentTarget as HTMLDivElement).style.boxShadow="none";}}>
           <div style={{position:"absolute",inset:0,...tr.css,opacity:0.7}}/>
           <span style={{fontSize:10,fontWeight:600,color:"#e2e8f0",zIndex:1,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{tr.label}</span>
          </div>
        ))}
       </div>
       {transitions.length>0&&(
        <div style={{padding:"8px 16px",borderTop:"1px solid #26282e",background:"#111214",flexShrink:0}}>
         <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>Applied transitions ({transitions.length})</div>
         {transitions.map(tr=>(
          <div key={tr.id} onClick={()=>{setSelectedTransitionId(tr.id);}} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:5,background:selectedTransitionId===tr.id?"#23252c":"transparent",cursor:"pointer",marginBottom:2}}>
           <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",flexShrink:0}}/>
           <span style={{fontSize:11,color:"#9ca3af",flex:1}}>{tr.type.replace(/_/g," ")} → clip {tr.afterClipId.slice(-4)}</span>
           {selectedTransitionId===tr.id&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
             <span style={{fontSize:10,color:"#6b7280"}}>dur:</span>
             <input type="range" min={0.1} max={2} step={0.1} value={tr.durationSec} onChange={e=>setTransitions(prev=>prev.map(t=>t.id===tr.id?{...t,durationSec:+e.target.value}:t))} style={{width:60,accentColor:"#6366f1"}}/>
             <span style={{fontSize:10,color:"#9ca3af",minWidth:24}}>{tr.durationSec}s</span>
             <button onClick={e=>{e.stopPropagation();setTransitions(prev=>prev.filter(t=>t.id!==tr.id));setSelectedTransitionId(null);}} style={{background:"#2d1a1a",border:"1px solid #450a0a",color:"#ef4444",borderRadius:4,padding:"2px 6px",fontSize:10,cursor:"pointer"}}>✕</button>
            </div>
           )}
          </div>
         ))}
        </div>
       )}
      </div>
     )}
     {activePanel==="effects"&&(()=>{
      const selClip=clips.find(c=>c.id===selectedId)??null;
      const fx=selClip?.effects??{};
      const updateFx=(patch:Partial<ClipEffects>)=>{
        if(!selClip)return;
        setClips(prev=>prev.map(c=>c.id===selClip.id?{...c,effects:{...c.effects,...patch}}:c));
      };
      const LUT_PRESETS=[
        {id:"original",label:"Original",icon:"○",vals:{brightness:0,contrast:0,saturation:0,blur:0,vignette:0,filmGrain:0,lut:undefined}},
        {id:"cinematic",label:"Cinematic",icon:"🎬",vals:{brightness:-5,contrast:15,saturation:-20}},
        {id:"vintage",label:"Vintage",icon:"📷",vals:{brightness:10,contrast:5,saturation:-40}},
        {id:"cool",label:"Cool",icon:"❄",vals:{saturation:-10,brightness:0}},
        {id:"warm",label:"Warm",icon:"🌅",vals:{saturation:10,brightness:5}},
        {id:"vivid",label:"Vivid",icon:"🌈",vals:{saturation:40,contrast:20}},
        {id:"bw",label:"B&W",icon:"◐",vals:{saturation:-100}},
        {id:"faded",label:"Faded",icon:"☁",vals:{contrast:-20,brightness:10}},
        {id:"dramatic",label:"Dramatic",icon:"⚡",vals:{contrast:30,saturation:-10}},
      ];
      return(
       <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"10px 16px 8px",borderBottom:"1px solid #26282e",flexShrink:0,fontSize:12,color:selClip?"#9ca3af":"#6b7280"}}>
         {selClip?`Editing: ${selClip.label}`:"Select a clip on the timeline to apply effects"}
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
         <div style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",marginBottom:10}}>PRESETS</div>
         <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
          {LUT_PRESETS.map(p=>(
           <button key={p.id} onClick={()=>{if(selClip)setClips(prev=>prev.map(c=>c.id===selClip.id?{...c,effects:{...c.effects,...p.vals}}:c));}}
            style={{background:"#1a1b1f",border:`1px solid ${fx.lut===p.id?"#6366f1":"#26282e"}`,borderRadius:8,padding:"8px 12px",cursor:selClip?"pointer":"default",color:selClip?"#e2e8f0":"#4b5563",fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:64,opacity:selClip?1:0.5}}
            onMouseEnter={e=>{if(selClip)(e.currentTarget as HTMLButtonElement).style.borderColor="#6366f1";}}
            onMouseLeave={e=>{if(selClip)(e.currentTarget as HTMLButtonElement).style.borderColor=fx.lut===p.id?"#6366f1":"#26282e";}}>
            <span style={{fontSize:18}}>{p.icon}</span>
            <span>{p.label}</span>
           </button>
          ))}
         </div>
         <div style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",marginBottom:10}}>ADJUST</div>
         {[
          {key:"brightness",label:"Brightness",min:-100,max:100,def:0},
          {key:"contrast",label:"Contrast",min:-100,max:100,def:0},
          {key:"saturation",label:"Saturation",min:-100,max:100,def:0},
          {key:"blur",label:"Blur",min:0,max:20,def:0},
          {key:"vignette",label:"Vignette",min:0,max:100,def:0},
          {key:"filmGrain",label:"Film Grain",min:0,max:100,def:0},
         ].map(sl=>(
          <div key={sl.key} style={{marginBottom:12}}>
           <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:"#9ca3af"}}>{sl.label}</span>
            <span style={{fontSize:11,color:"#6366f1",minWidth:32,textAlign:"right"}}>{(fx as any)[sl.key]??sl.def}</span>
           </div>
           <input type="range" min={sl.min} max={sl.max} value={(fx as any)[sl.key]??sl.def}
            onChange={e=>updateFx({[sl.key]:+e.target.value})}
            disabled={!selClip}
            style={{width:"100%",accentColor:"#6366f1",cursor:selClip?"pointer":"default"}}/>
          </div>
         ))}
         {selClip&&Object.values(fx).some(v=>v!==undefined&&v!==0&&v!=="")&&(
          <button onClick={()=>setClips(prev=>prev.map(c=>c.id===selClip.id?{...c,effects:{}}:c))}
           style={{background:"#1a0808",border:"1px solid #450a0a",color:"#ef4444",borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer",marginTop:4}}>
           Reset all effects
          </button>
         )}
        </div>
       </div>
      );
     })()}
     {activePanel==="elements"&&(
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
       <div style={{padding:"10px 16px 8px",borderBottom:"1px solid #26282e",flexShrink:0,fontSize:12,color:"#6b7280"}}>Click to add element at playhead position</div>
       <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
        <div style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",marginBottom:10}}>SHAPES</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:18}}>
         {([
           {type:"rect",label:"Rectangle",svg:<rect x="8" y="12" width="48" height="32" rx="2" fill="none" stroke="#6366f1" strokeWidth="3"/>},
           {type:"circle",label:"Circle",svg:<circle cx="32" cy="28" r="20" fill="none" stroke="#6366f1" strokeWidth="3"/>},
           {type:"line",label:"Line",svg:<line x1="8" y1="28" x2="56" y2="28" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"/>},
           {type:"arrow",label:"Arrow",svg:<><line x1="8" y1="28" x2="52" y2="28" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"/><polygon points="52,20 64,28 52,36" fill="#6366f1"/></>},
           {type:"star",label:"Star",svg:<polygon points="32,8 36,20 49,20 39,28 43,40 32,33 21,40 25,28 15,20 28,20" fill="none" stroke="#6366f1" strokeWidth="2"/>},
           {type:"heart",label:"Heart",svg:<path d="M32 44C32 44 12 30 12 18a10 10 0 0 1 20 0 10 10 0 0 1 20 0c0 12-20 26-20 26z" fill="none" stroke="#6366f1" strokeWidth="3"/>},
         ] as {type:"rect"|"circle"|"line"|"arrow"|"star"|"heart";label:string;svg:React.ReactNode}[]).map(shape=>(
          <div key={shape.type} onClick={()=>{
            const id=uid();
            setElements(prev=>[...prev,{id,type:shape.type,startSec:currentTime,durationSec:5,x:40,y:40,width:20,height:15,color:"#6366f1",strokeColor:"#6366f1",strokeWidth:2,rotation:0,opacity:100,track:3}]);
            setSelectedElementId(id);setSelectedId(null);setSelectedTextId(null);
          }}
          style={{width:72,height:64,background:"#1a1b1f",border:"1px solid #26282e",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",gap:3}}
          onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#6366f1";}} onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#26282e";}}>
          <svg width="64" height="44" viewBox="0 0 64 56">{shape.svg}</svg>
          <span style={{fontSize:9,color:"#9ca3af"}}>{shape.label}</span>
         </div>
         ))}
        </div>
        <div style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",marginBottom:10}}>EMOJIS</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18}}>
         {"🔥⭐💯❤️🎉🙌💪🎯🏆✨🚀💥🎊🌟😂😍🤩🥳💎🔑🎵🎶🌈🦋🐉👑🌙☀️❄️🌊".split("").map((emoji,i)=>(
          <button key={i} onClick={()=>{
            const id=uid();
            setElements(prev=>[...prev,{id,type:"emoji",emoji,startSec:currentTime,durationSec:5,x:40,y:40,width:10,height:10,color:"#fff",strokeColor:"#000",strokeWidth:0,rotation:0,opacity:100,track:3}]);
            setSelectedElementId(id);setSelectedId(null);setSelectedTextId(null);
          }}
          style={{width:40,height:40,background:"#1a1b1f",border:"1px solid #26282e",borderRadius:6,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
          onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#f59e0b";}} onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#26282e";}}>
           {emoji}
          </button>
         ))}
        </div>
       </div>
       {selectedElementId&&(()=>{
        const el=elements.find(e=>e.id===selectedElementId);
        if(!el)return null;
        return(
         <div style={{padding:"12px 16px",borderTop:"1px solid #26282e",background:"#111214",flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:600,color:"#6b7280",marginBottom:8}}>ELEMENT PROPERTIES</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
           <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <span style={{fontSize:10,color:"#6b7280"}}>Fill</span>
            <input type="color" value={el.color} onChange={e=>setElements(prev=>prev.map(el2=>el2.id===el.id?{...el2,color:e.target.value}:el2))} style={{width:32,height:24,border:"none",background:"none",cursor:"pointer"}}/>
           </div>
           <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <span style={{fontSize:10,color:"#6b7280"}}>Stroke</span>
            <input type="color" value={el.strokeColor} onChange={e=>setElements(prev=>prev.map(el2=>el2.id===el.id?{...el2,strokeColor:e.target.value}:el2))} style={{width:32,height:24,border:"none",background:"none",cursor:"pointer"}}/>
           </div>
           <div style={{flex:1,minWidth:100}}>
            <span style={{fontSize:10,color:"#6b7280"}}>Rotation: {el.rotation}°</span>
            <input type="range" min={0} max={360} value={el.rotation} onChange={e=>setElements(prev=>prev.map(el2=>el2.id===el.id?{...el2,rotation:+e.target.value}:el2))} style={{width:"100%",accentColor:"#6366f1"}}/>
           </div>
           <div style={{flex:1,minWidth:100}}>
            <span style={{fontSize:10,color:"#6b7280"}}>Opacity: {el.opacity}%</span>
            <input type="range" min={0} max={100} value={el.opacity} onChange={e=>setElements(prev=>prev.map(el2=>el2.id===el.id?{...el2,opacity:+e.target.value}:el2))} style={{width:"100%",accentColor:"#6366f1"}}/>
           </div>
          </div>
          <button onClick={()=>{setElements(prev=>prev.filter(e=>e.id!==selectedElementId));setSelectedElementId(null);}}
           style={{background:"#1a0808",border:"1px solid #450a0a",color:"#ef4444",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",marginTop:6}}>🗑 Delete</button>
         </div>
        );
       })()}
      </div>
     )}
{activePanel === "audio" && (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      position: "relative",
    }}
  >
    {/* Base audio screen: two big buttons */}
    <div
      style={{
        flex: 1,
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 4 }}>
        AI Audio tools
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Auto Subtitles button */}
        <button
          onClick={() => setAudioOverlay("subtitles")}
          style={{
            flex: 1,
            minWidth: 260,
            background: "#1a1b1f",
            border: "1px solid #2563eb55",
            borderRadius: 10,
            padding: "14px 16px",
            cursor: "pointer",
            textAlign: "left",
            color: "#e5e7eb",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "#22d3ee",
              }}
            >
              AUTO SUBTITLES
            </span>
            <span
              style={{
                background: "#164e63",
                color: "#22d3ee",
                fontSize: 9,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              AI
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Generate subtitle clips on the timeline using Whisper. Best for
            talking‑head or voiceover videos.
          </div>
        </button>

        {/* Text to Speech button */}
        <button
          onClick={() => setAudioOverlay("tts")}
          style={{
            flex: 1,
            minWidth: 260,
            background: "#1a1b1f",
            border: "1px solid #7c3aed55",
            borderRadius: 10,
            padding: "14px 16px",
            cursor: "pointer",
            textAlign: "left",
            color: "#e5e7eb",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "#a78bfa",
              }}
            >
              TEXT TO SPEECH
            </span>
            <span
              style={{
                background: "#2e1065",
                color: "#a78bfa",
                fontSize: 9,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              Qwen3‑TTS
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Turn written text into voice and add it as an audio clip on your
            timeline.
          </div>
        </button>
      </div>
    </div>

    {/* Overlay panel over audio area */}
    {audioOverlay && (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(3,7,18,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}
      >
        <div
          style={{
            width: 640,
            maxHeight: "90%",
            background: "#0b0c10",
            borderRadius: 14,
            border: "1px solid #1f2937",
            boxShadow: "0 24px 80px rgba(0,0,0,0.85)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#e5e7eb",
                  marginBottom: 2,
                }}
              >
                {audioOverlay === "subtitles"
                  ? "Auto Subtitles"
                  : "Text to Speech"}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {audioOverlay === "subtitles"
                  ? "Select a clip on Video 1 and generate subtitle clips timed to speech."
                  : "Generate speech audio from text and drag it to your audio track."}
              </div>
            </div>
            <button
              onClick={() => setAudioOverlay(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingTop: 4,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {audioOverlay === "subtitles" && (
              <div
                style={{
                  background: "#1a1b1f",
                  border: "1px solid #26282e",
                  borderRadius: 10,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#22d3ee",
                    letterSpacing: "0.07em",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>AUTO SUBTITLES</span>
                  <span
                    style={{
                      background: "#164e63",
                      color: "#22d3ee",
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    AI
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Select a clip on Video 1 then click Generate. Creates text
                  clips on the timeline timed to speech.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      LANGUAGE
                    </div>
                    <select
                      value={whisperLang}
                      onChange={(e) => setWhisperLang(e.target.value)}
                      style={{
                        width: "100%",
                        background: "#111214",
                        color: "#e2e8f0",
                        border: "1px solid #374151",
                        borderRadius: 6,
                        padding: "5px 8px",
                        fontSize: 11,
                      }}
                    >
                      <option value="auto">Auto detect</option>
                      <option value="en">English</option>
                      <option value="zh">Chinese</option>
                      <option value="ja">Japanese</option>
                      <option value="ko">Korean</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="es">Spanish</option>
                      <option value="ru">Russian</option>
                    </select>
                  </div>
                  <div style={{ width: 120 }}>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      MAX WORDS
                    </div>
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={maxSubtitleWords}
                      onChange={(e) =>
                        setMaxSubtitleWords(
                          Math.max(
                            1,
                            Math.min(30, Number(e.target.value) || 10)
                          )
                        )
                      }
                      style={{
                        width: "100%",
                        background: "#111214",
                        border: "1px solid #374151",
                        borderRadius: 6,
                        color: "#e2e8f0",
                        padding: "5px 8px",
                        fontSize: 11,
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleWhisperGenerate}
                  disabled={whisperRunning || !clips.some((c) => c.track === 0)}
                  style={{
                    background: whisperRunning ? "#374151" : "#164e63",
                    border: "1px solid #22d3ee",
                    color: "#22d3ee",
                    borderRadius: 6,
                    padding: "8px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: !clips.some((c) => c.track === 0) ? 0.5 : 1,
                  }}
                >
                  {whisperRunning ? "Transcribing..." : "Generate Subtitles"}
                </button>
                {whisperStatus && (
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    {whisperStatus}
                  </div>
                )}
              </div>
            )}

            {audioOverlay === "tts" && (
              <div
                style={{
                  background: "#1a1b1f",
                  border: "1px solid #26282e",
                  borderRadius: 10,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#a78bfa",
                    letterSpacing: "0.07em",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>TEXT TO SPEECH</span>
                  <span
                    style={{
                      background: "#2e1065",
                      color: "#a78bfa",
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Qwen3‑TTS
                  </span>
                </div>
                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  rows={4}
                  placeholder="Type text to convert to speech..."
                  style={{
                    background: "#111214",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    color: "#e2e8f0",
                    padding: "7px 9px",
                    fontSize: 12,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      VOICE
                    </div>
                    <select
                      value={ttsVoice}
                      onChange={(e) => setTtsVoice(e.target.value)}
                      style={{
                        width: "100%",
                        background: "#111214",
                        color: "#e2e8f0",
                        border: "1px solid #374151",
                        borderRadius: 6,
                        padding: "5px 8px",
                        fontSize: 11,
                      }}
                    >
                      <option value="Ryan">Ryan — English male</option>
                      <option value="Aiden">Aiden — English male</option>
                      <option value="Vivian">Vivian — Chinese female</option>
                      <option value="Serena">Serena — Chinese female</option>
                      <option value="Uncle_Fu">Uncle Fu — Chinese male</option>
                      <option value="Dylan">Dylan — Beijing male</option>
                      <option value="Eric">Eric — Sichuan male</option>
                      <option value="Ono_Anna">Ono Anna — Japanese female</option>
                      <option value="Sohee">Sohee — Korean female</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#6b7280",
                      marginBottom: 4,
                    }}
                  >
                    INSTRUCT (optional)
                  </div>
                  <input
                    value={ttsInstruct}
                    onChange={(e) => setTtsInstruct(e.target.value)}
                    placeholder='e.g. "speak slowly and clearly"'
                    style={{
                      width: "100%",
                      background: "#111214",
                      border: "1px solid #374151",
                      borderRadius: 6,
                      color: "#e2e8f0",
                      padding: "5px 8px",
                      fontSize: 11,
                    }}
                  />
                </div>
                <button
                  onClick={handleQwenTts}
                  disabled={ttsRunning || !ttsText.trim()}
                  style={{
                    background: ttsRunning ? "#374151" : "#2e1065",
                    border: "1px solid #7c3aed",
                    color: "#a78bfa",
                    borderRadius: 6,
                    padding: "8px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: !ttsText.trim() ? 0.5 : 1,
                  }}
                >
                  {ttsRunning ? "Generating audio..." : "Generate Voice"}
                </button>
                {ttsStatus && (
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    {ttsStatus}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
)}
    </div>

    {/* Preview column */}
    <div style={{width:previewWidth,background:"#0a0b0e",display:"flex",flexDirection:"column",borderLeft:"1px solid #26282e",flexShrink:0,position:"relative"}}>
     <div style={{position:"absolute",left:0,top:0,bottom:0,width:2,cursor:"col-resize",zIndex:30,background:"transparent"}}
      onMouseDown={e=>{e.preventDefault();const startX=e.clientX;const startW=previewWidth;const onMove=(ev:MouseEvent)=>{setPreviewWidth(Math.max(240,Math.min(800,startW+(startX-ev.clientX))));};const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);}}
      onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.15)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}/>
     {selected&&!selectedTextId&&!selectedListId&&(
      <div style={{background:"#16181f",borderBottom:"1px solid #26282e",display:"flex",flexDirection:"column",flexShrink:0}}>
       <div style={{height:36,display:"flex",alignItems:"center",padding:"0 10px",gap:8,overflowX:"auto"}}>
        <span style={{fontSize:9,color:"#6b7280",flexShrink:0}}>CLIP</span>
        <span style={{fontSize:10,color:"#e2e8f0",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selected.label}</span>
        {[["START",fmt(selected.startSec)],["DUR",fmt(selected.durationSec-selected.trimStart-selected.trimEnd)],["IN",fmt(selected.trimStart)],["OUT",fmt(selected.trimEnd)]].map(([k,v])=>(
         <div key={k} style={{display:"flex",gap:3,alignItems:"center",flexShrink:0}}><span style={{fontSize:8,color:"#6b7280"}}>{k}</span><span style={{fontFamily:"monospace",fontSize:10,color:"#22d3ee"}}>{v}</span></div>
        ))}
        <div style={{flex:1}}/><button onClick={deleteSelected} style={{background:"transparent",border:"1px solid #450a0a",color:"#ef4444",borderRadius:4,padding:"2px 7px",fontSize:9,cursor:"pointer"}}>Del</button>
       </div>
       <div style={{padding:"4px 10px 6px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:3,alignItems:"center",flexShrink:0}}>
         <span style={{fontSize:9,color:"#6b7280"}}>SPEED</span>
         {[0.25,0.5,0.75,1,1.5,2,4].map(s=>(
          <button key={s} onClick={()=>setClips(prev=>prev.map(c=>c.id===selectedId?{...c,speed:s}:c))}
           style={{background:selected?.speed===s||(s===1&&!selected?.speed)?"#2563eb":"#1a1b1f",border:"1px solid #26282e",borderRadius:4,color:"#e2e8f0",padding:"2px 5px",fontSize:9,cursor:"pointer"}}>
           {s}×
          </button>
         ))}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flex:1,minWidth:120}}>
         <span style={{fontSize:9,color:"#6b7280",flexShrink:0}}>VOL {selected?.clipVolume??100}%</span>
         <input type="range" min={0} max={200} value={selected?.clipVolume??100}
          onChange={e=>setClips(prev=>prev.map(c=>c.id===selectedId?{...c,clipVolume:+e.target.value}:c))}
          style={{flex:1,accentColor:"#22c55e",minWidth:60}}/>
        </div>
       </div>
      </div>
     )}
     <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
      <div data-preview-container="true" style={{position:"relative",height:"88%",aspectRatio:"9/16",maxWidth:"88%",background:"#000",borderRadius:6,overflow:"hidden",boxShadow:"0 0 0 1px #26282e, 0 8px 40px rgba(0,0,0,0.8)"}}>
       <video ref={videoRef} muted preload="auto" style={{width:"100%",height:"100%",objectFit:"contain",display:clips.some(c=>c.track===0)?"block":"none",filter:(()=>{const fx=selected?.effects;if(!fx)return undefined;const parts:string[]=[];if(fx.brightness!==undefined&&fx.brightness!==0)parts.push(`brightness(${1+fx.brightness/100})`);if(fx.contrast!==undefined&&fx.contrast!==0)parts.push(`contrast(${1+fx.contrast/100})`);if(fx.saturation!==undefined&&fx.saturation!==0)parts.push(`saturate(${1+fx.saturation/100})`);if(fx.blur!==undefined&&fx.blur!==0)parts.push(`blur(${fx.blur}px)`);return parts.length?parts.join(" "):undefined;})()}}/>
      <audio ref={audioRef} style={{display:"none"}} muted={false} />
       {!clips.some(c=>c.track===0)&&(<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}><span style={{fontSize:36,opacity:0.15}}>▶</span><span style={{fontSize:11,color:"#2d3748"}}>Drag a clip to Video 1 track</span></div>)}

       {/* Text overlays */}
       {activeTextClips.map(tc=>{const isSel=tc.id===selectedTextId;return(
        <div key={tc.id} style={{position:"absolute",left:`${tc.x}%`,top:`${tc.y}%`,width:`${tc.width}%`,height:`${tc.height}%`,transform:"translate(-50%,-50%)",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:isSel?"auto":"none",outline:isSel?"1.5px dashed rgba(139,92,246,0.8)":"none",outlineOffset:2,zIndex:10,cursor:isSel?"move":"default",boxSizing:"border-box"}}
         onMouseDown={e=>{if((e.target as HTMLElement).dataset.handle)return;if(!isSel){setSelectedTextId(tc.id);setBulkTextSelection(null);setSelectedId(null);setSelectedListId(null);return;}e.preventDefault();e.stopPropagation();const container=(e.currentTarget as HTMLElement).closest<HTMLElement>('[data-preview-container]');if(!container)return;const rect=container.getBoundingClientRect();const sx=e.clientX,sy=e.clientY,ox=tc.x,oy=tc.y;const onMove=(ev:MouseEvent)=>{const halfW=tc.width/2;const halfH=tc.height/2;const newX=Math.max(halfW,Math.min(100-halfW,ox+((ev.clientX-sx)/rect.width)*100));const newY=Math.max(halfH,Math.min(100-halfH,oy+((ev.clientY-sy)/rect.height)*100));updateText(tc.id,{x:newX,y:newY});};const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);}}>
         {(()=>{const s=TEXT_STYLES.find(st=>st.id===(tc.textStyle??"plain"))??TEXT_STYLES[0];return(
          <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",userSelect:"none"}}>
           <div style={{...s.wrapStyle,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontFamily:tc.fontFamily,fontSize:tc.fontSize,fontWeight:tc.bold?700:400,fontStyle:tc.italic?"italic":"normal",textDecoration:tc.underline?"underline":"none",whiteSpace:"pre-wrap",textAlign:"center",wordBreak:"break-word",...s.textStyle,color:s.id==="plain"?tc.color:s.textStyle.color}}>{tc.label}</span>
           </div>
          </div>
         );})()}
         {isSel&&([{cursor:"nw-resize",top:"-5px",left:"-5px",edges:["n","w"]},{cursor:"n-resize",top:"-5px",left:"50%",transform:"translateX(-50%)",edges:["n"]},{cursor:"ne-resize",top:"-5px",right:"-5px",edges:["n","e"]},{cursor:"e-resize",top:"50%",right:"-5px",transform:"translateY(-50%)",edges:["e"]},{cursor:"se-resize",bottom:"-5px",right:"-5px",edges:["s","e"]},{cursor:"s-resize",bottom:"-5px",left:"50%",transform:"translateX(-50%)",edges:["s"]},{cursor:"sw-resize",bottom:"-5px",left:"-5px",edges:["s","w"]},{cursor:"w-resize",top:"50%",left:"-5px",transform:"translateY(-50%)",edges:["w"]}] as {cursor:string;top?:string;bottom?:string;left?:string;right?:string;transform?:string;edges:("n"|"s"|"e"|"w")[]}[]).map((h,i)=>(
          <div key={i} data-handle="true" style={{position:"absolute",top:h.top,bottom:(h as any).bottom,left:h.left,right:(h as any).right,transform:(h as any).transform,width:10,height:10,background:"#a78bfa",border:"1.5px solid #fff",borderRadius:2,cursor:h.cursor,zIndex:20,pointerEvents:"auto"}}
           onMouseDown={e=>{e.preventDefault();e.stopPropagation();const container=(e.currentTarget as HTMLElement).closest<HTMLElement>('[data-preview-container]');if(!container)return;const rect=container.getBoundingClientRect();const sx=e.clientX,sy=e.clientY,ow=tc.width,oh=tc.height,ox=tc.x,oy=tc.y;const onMove=(ev:MouseEvent)=>{const dxP=((ev.clientX-sx)/rect.width)*100,dyP=((ev.clientY-sy)/rect.height)*100;const patch:Partial<TextClip>={};if(h.edges.includes("e"))patch.width=Math.min(Math.max(5,ow+dxP),(100-ox)*2);if(h.edges.includes("w")){const nw=Math.min(Math.max(5,ow-dxP),ox*2);patch.width=nw;patch.x=ox+(ow-nw)/2+dxP/2;}if(h.edges.includes("s"))patch.height=Math.min(Math.max(5,oh+dyP),(100-oy)*2);if(h.edges.includes("n")){const nh=Math.min(Math.max(5,oh-dyP),oy*2);patch.height=nh;patch.y=oy+(oh-nh)/2+dyP/2;}updateText(tc.id,patch);};const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);}}/>
         ))}
        </div>
       );})}

       {/* Element overlays */}
       {elements.filter(el=>currentTime>=el.startSec&&currentTime<el.startSec+el.durationSec).map(el=>(
        <div key={el.id}
         onClick={()=>{setSelectedElementId(el.id);setSelectedId(null);setSelectedTextId(null);}}
         style={{position:"absolute",left:`${el.x}%`,top:`${el.y}%`,width:`${el.width}%`,transform:`rotate(${el.rotation}deg)`,opacity:el.opacity/100,cursor:"pointer",border:selectedElementId===el.id?"2px dashed #6366f1":"2px solid transparent",borderRadius:4}}>
         {el.type==="emoji"?(
          <span style={{fontSize:`${el.width*3}px`,userSelect:"none"}}>{el.emoji}</span>
         ):(
          <svg width="100%" viewBox="0 0 100 80" style={{overflow:"visible"}}>
           {el.type==="rect"&&<rect x="5" y="5" width="90" height="70" rx="3" fill={el.color+"44"} stroke={el.strokeColor} strokeWidth={el.strokeWidth}/>}
           {el.type==="circle"&&<ellipse cx="50" cy="40" rx="45" ry="35" fill={el.color+"44"} stroke={el.strokeColor} strokeWidth={el.strokeWidth}/>}
           {el.type==="line"&&<line x1="5" y1="40" x2="95" y2="40" stroke={el.strokeColor} strokeWidth={el.strokeWidth+2} strokeLinecap="round"/>}
           {el.type==="arrow"&&<><line x1="5" y1="40" x2="80" y2="40" stroke={el.strokeColor} strokeWidth={el.strokeWidth+2} strokeLinecap="round"/><polygon points="75,28 100,40 75,52" fill={el.strokeColor}/></>}
           {el.type==="star"&&<polygon points="50,5 58,30 85,30 63,46 71,72 50,56 29,72 37,46 15,30 42,30" fill={el.color+"44"} stroke={el.strokeColor} strokeWidth={el.strokeWidth}/>}
           {el.type==="heart"&&<path d="M50 70C50 70 10 46 10 24a20 20 0 0 1 40 0 20 20 0 0 1 40 0c0 22-40 46-40 46z" fill={el.color+"44"} stroke={el.strokeColor} strokeWidth={el.strokeWidth}/>}
          </svg>
         )}
        </div>
       ))}

       {/* List overlays */}
       {activeListClips.map(lc=>{
        const isSel=lc.id===selectedListId;
        const s=TEXT_STYLES.find(st=>st.id===lc.textStyle)??TEXT_STYLES[0];
        const visibleItems=lc.items.filter(item=>currentTime>=item.revealSec).sort((a,b)=>a.revealSec-b.revealSec);
        return(
         <div key={lc.id} style={{position:"absolute",left:`${lc.x}%`,top:`${lc.y}%`,pointerEvents:isSel?"auto":"none",outline:isSel?"1.5px dashed rgba(34,197,94,0.8)":"none",outlineOffset:3,zIndex:11,cursor:isSel?"move":"default",boxSizing:"border-box",width:`${lc.width}%`,overflow:"visible"}}
          onMouseDown={e=>{
           if((e.target as HTMLElement).dataset.handle)return;
           if(!isSel){setSelectedListId(lc.id);setSelectedTextId(null);setSelectedId(null);return;}
           e.preventDefault();e.stopPropagation();
           const container=(e.currentTarget as HTMLElement).closest<HTMLElement>('[data-preview-container]');if(!container)return;
           const rect=container.getBoundingClientRect();const sx=e.clientX,sy=e.clientY,ox=lc.x,oy=lc.y;
           const onMove=(ev:MouseEvent)=>{
            const newX=Math.max(0,Math.min(90,ox+((ev.clientX-sx)/rect.width)*100));
            const newY=Math.max(0,Math.min(90,oy+((ev.clientY-sy)/rect.height)*100));
            updateList(lc.id,{x:newX,y:newY});
           };
           const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
           window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
          }}>
          <div style={{display:"flex",flexDirection:"column",gap:lc.gap,pointerEvents:"none",userSelect:"none"}}>
           {visibleItems.map(item=>{
            const itemIdx=lc.items.indexOf(item);
            return(
             <div key={item.id} style={{...s.wrapStyle,display:"inline-flex",alignItems:"center"}}>
              <span style={{fontFamily:lc.fontFamily,fontSize:lc.fontSize,fontWeight:700,whiteSpace:"nowrap",...s.textStyle}}>{itemIdx+1}. {item.text}</span>
             </div>
            );
           })}
          </div>
          {isSel&&(<>
           <div data-handle="true" style={{position:"absolute",right:0,top:"50%",transform:"translate(50%,-50%)",width:10,height:10,background:"#22c55e",border:"1.5px solid #fff",borderRadius:2,cursor:"ew-resize",zIndex:20,pointerEvents:"auto"}}
            onMouseDown={e=>{
             e.preventDefault();e.stopPropagation();
             const container=(e.currentTarget as HTMLElement).closest<HTMLElement>('[data-preview-container]');if(!container)return;
             const rect=container.getBoundingClientRect();const sx=e.clientX,ow=lc.width;
             const onMove=(ev:MouseEvent)=>{const dxP=((ev.clientX-sx)/rect.width)*100;const nw=Math.max(10,Math.min(100-lc.x,ow+dxP));updateList(lc.id,{width:nw});};
             const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
             window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
            }}/>
           <div data-handle="true" style={{position:"absolute",right:0,bottom:0,transform:"translate(50%,50%)",width:10,height:10,background:"#22c55e",border:"1.5px solid #fff",borderRadius:2,cursor:"se-resize",zIndex:20,pointerEvents:"auto"}}
            onMouseDown={e=>{
             e.preventDefault();e.stopPropagation();
             const container=(e.currentTarget as HTMLElement).closest<HTMLElement>('[data-preview-container]');if(!container)return;
             const rect=container.getBoundingClientRect();const sx=e.clientX,ow=lc.width;
             const onMove=(ev:MouseEvent)=>{const dxP=((ev.clientX-sx)/rect.width)*100;const nw=Math.max(10,Math.min(100-lc.x,ow+dxP));updateList(lc.id,{width:nw});};
             const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
             window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
            }}/>
          </>)}
         </div>
        );
       })}
      </div>
     </div>

     {/* Transport bar */}
     <div style={{background:"#0a0b0e",borderTop:"1px solid #1e2230",display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{height:3,background:"#26282e",cursor:"pointer",position:"relative"}}
       onClick={e=>{const r=(e.currentTarget as HTMLDivElement).getBoundingClientRect();applyScrub(Math.max(0,Math.min(totalDuration,((e.clientX-r.left)/r.width)*totalDuration)));}}
       onMouseDown={e=>{const bar=e.currentTarget as HTMLDivElement;const om=(ev:MouseEvent)=>{const r=bar.getBoundingClientRect();applyScrub(Math.max(0,Math.min(totalDuration,((ev.clientX-r.left)/r.width)*totalDuration)));};const ou=()=>{window.removeEventListener("mousemove",om);window.removeEventListener("mouseup",ou);};window.addEventListener("mousemove",om);window.addEventListener("mouseup",ou);}}>
       <div style={{height:"100%",width:`${Math.min(100,(currentTime/Math.max(totalDuration,0.01))*100)}%`,background:"#3b82f6",borderRadius:2}}/>
      </div>
      <div style={{height:44,display:"flex",alignItems:"center",padding:"0 10px",gap:6}}>
       <div style={{fontFamily:"monospace",fontSize:10,color:"#22d3ee",letterSpacing:"0.03em",flexShrink:0}}>{fmt(currentTime)} / {fmt(totalDuration)}</div>
       <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
        <button onClick={()=>setCurrentTime(0)} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}><svg width="12" height="12" viewBox="0 0 13 13" fill="currentColor"><rect x="1" y="1" width="2" height="11" rx="1"/><path d="M10.5 2L4 6.5l6.5 4.5V2z"/></svg></button>
        <button onClick={()=>setCurrentTime(t=>Math.max(0,t-1/30))} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}><svg width="12" height="12" viewBox="0 0 13 13" fill="currentColor"><path d="M6.5 2L1 6.5l5.5 4.5V2z"/><path d="M12 2L6.5 6.5 12 11V2z"/></svg></button>
        <button onClick={()=>setPlaying(p=>!p)} style={{width:30,height:30,borderRadius:"50%",background:"#2563eb",border:"none",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
         {playing?<svg width="9" height="9" viewBox="0 0 10 10" fill="white"><rect x="1" y="1" width="3" height="8" rx="0.8"/><rect x="6" y="1" width="3" height="8" rx="0.8"/></svg>:<svg width="9" height="9" viewBox="0 0 10 10" fill="white"><path d="M2 1l7 4-7 4V1z"/></svg>}
        </button>
        <button onClick={()=>setCurrentTime(t=>Math.min(totalDuration,t+1/30))} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}><svg width="12" height="12" viewBox="0 0 13 13" fill="currentColor"><path d="M1 2l5.5 4.5L1 11V2z"/><path d="M6.5 2L12 6.5 6.5 11V2z"/></svg></button>
        <button onClick={()=>setCurrentTime(totalDuration)} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}><svg width="12" height="12" viewBox="0 0 13 13" fill="currentColor"><path d="M2.5 2L9 6.5 2.5 11V2z"/><rect x="10" y="1" width="2" height="11" rx="1"/></svg></button>
       </div>
       <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
        <div style={{background:"#1e2027",border:"1px solid #374151",borderRadius:4,padding:"2px 6px",fontSize:10,color:"#9ca3af",display:"flex",alignItems:"center",gap:2}}>9:16 <svg width="7" height="7" viewBox="0 0 8 8" fill="#6b7280"><path d="M1 2.5l3 3 3-3H1z"/></svg></div>
        <button onClick={()=>setVolume(v=>v===0?80:0)} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:3}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}>
         {volume===0?<svg width="12" height="12" viewBox="0 0 13 13" fill="currentColor"><path d="M1 4.5h2.5l3.5-3v9L3.5 8H1V4.5z"/><line x1="8.5" y1="4.5" x2="12" y2="8" stroke="currentColor" strokeWidth="1.4"/><line x1="12" y1="4.5" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.4"/></svg>:<svg width="12" height="12" viewBox="0 0 13 13" fill="currentColor"><path d="M1 4.5h2.5l3.5-3v9L3.5 8H1V4.5z"/><path d="M8.5 4a3.5 3.5 0 010 5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>}
        </button>
        <button style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:3}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8"/></svg></button>
        <button style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:3}} onMouseEnter={e=>(e.currentTarget.style.color="#e2e8f0")} onMouseLeave={e=>(e.currentTarget.style.color="#6b7280")}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6" cy="6" r="1.8"/><path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.2 2.2l.7.7M9.1 9.1l.7.7M9.8 2.2l-.7.7M3.1 9.1l-.7.7"/></svg></button>
       </div>
      </div>
     </div>
    </div>
   </div>

   {/* Toolbar */}
   <div style={{height:40,background:"#16181f",borderTop:"1px solid #1a1b1f",borderBottom:"1px solid #26282e",display:"flex",alignItems:"center",padding:"0 14px",gap:6,flexShrink:0}}>
    <div style={{display:"flex",gap:2,background:"#111214",borderRadius:7,padding:3}}>
     {(["select","razor","hand","zoom"] as const).map(t=>(
      <button key={t} title={t} onClick={()=>setTool(t)} style={{width:30,height:30,borderRadius:5,border:"none",cursor:"pointer",background:tool===t?"#3b82f6":"transparent",color:tool===t?"#fff":"#6b7280",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.1s"}}>{{select:"↖",razor:"✂",hand:"✋",zoom:"🔍"}[t]}</button>
     ))}
    </div>
    <div style={{width:1,height:20,background:"#26282e",margin:"0 3px"}}/>
    {[{icon:"↩",title:"Undo (Ctrl+Z)",fn:undo},{icon:"↪",title:"Redo",fn:()=>{}},{icon:"🗑",title:"Delete",fn:deleteSelected},{icon:"⚡",title:"Split at playhead",fn:()=>{if(selectedId)razorCut(selectedId,currentTime);}}].map(b=>(
     <button key={b.icon} title={b.title} onClick={b.fn} style={{width:30,height:30,borderRadius:5,border:"none",cursor:"pointer",background:"transparent",color:"#6b7280",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>(e.currentTarget.style.background="#26282e")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>{b.icon}</button>
    ))}
    <div style={{width:1,height:20,background:"#26282e",margin:"0 3px"}}/>
    <button onClick={()=>setSnap(s=>!s)} title="Snap" style={{width:30,height:30,borderRadius:5,border:"none",cursor:"pointer",background:snap?"#1e3a5f":"transparent",color:snap?"#3b82f6":"#6b7280",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>⊞</button>
    <span style={{fontSize:10,color:"#4b5563"}}>ZOOM</span>
    <input type="range" min={20} max={200} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:68,accentColor:"#3b82f6"}}/>
    <span style={{fontSize:10,color:"#6b7280",minWidth:32}}>{zoom}px/s</span>
    <div style={{flex:1}}/>
    <button
      onClick={()=> setExportOpen(true)}
      disabled={!clips.some(c=>c.track===0)}
      style={{
        background: clips.some(c=>c.track===0)?"#2563eb":"#1f2937",
        border:"none",
        color:"#fff",
        padding:"6px 16px",
        borderRadius:7,
        fontSize:13,
        fontWeight:600,
        cursor: clips.some(c=>c.track===0)?"pointer":"default",
        opacity: clips.some(c=>c.track===0)?1:0.5,
      }}
    >
      Export
    </button>
    {onClose&&<button onClick={()=>onClose(clips,textClips)} style={{background:"transparent",border:"1px solid #26282e",color:"#9ca3af",padding:"6px 10px",borderRadius:7,fontSize:12,cursor:"pointer"}}>✕ Back</button>}
   </div>

   {/* Timeline */}
   <div style={{height:260,display:"flex",overflow:"hidden",background:"#0d0e11",flexShrink:0}}>
    <div style={{width:100,background:"#161719",borderRight:"1px solid #26282e",flexShrink:0,display:"flex",flexDirection:"column"}}>
     <div style={{height:22,borderBottom:"1px solid #26282e",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      <button title="Add new track" onClick={()=>setShowTrackMenu(m=>!m)} style={{display:"flex",alignItems:"center",gap:4,background:"transparent",border:"1px solid #374151",borderRadius:5,color:"#6b7280",fontSize:10,padding:"2px 7px",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#3b82f6";e.currentTarget.style.color="#3b82f6";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#374151";e.currentTarget.style.color="#6b7280";}}>
       <span style={{fontSize:13,lineHeight:1}}>+</span><span>Track</span>
      </button>
      {showTrackMenu&&(
       <div onMouseDown={e=>e.stopPropagation()} style={{position:"absolute",top:"calc(100% + 4px)",left:"50%",transform:"translateX(-50%)",background:"#1a1b1f",border:"1px solid #374151",borderRadius:8,padding:"4px 0",zIndex:200,minWidth:140,boxShadow:"0 8px 24px rgba(0,0,0,0.6)",fontSize:12,color:"#e2e8f0"}}>
        {[{type:"video" as const,icon:"🎬",label:"Video track"},{type:"audio" as const,icon:"🔊",label:"Audio track"},{type:"text" as const,icon:"T",label:"Text track"}].map(item=>(
         <div key={item.type} onClick={()=>addTrack(item.type)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="#26282e"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="transparent"}>
          <span style={{fontSize:14,width:18,textAlign:"center"}}>{item.icon}</span><span>{item.label}</span>
         </div>
        ))}
       </div>
      )}
     </div>
     {/* Subtitles track label */}
     <div style={{height:52,borderBottom:"1px solid #0f1010",display:"flex",alignItems:"center",justifyContent:"center",background:"#374151"}}>
      <img src={ccIcon} style={{width:20,height:20,objectFit:"contain",filter:"invert(1)"}} />
     </div>
     {/* Text track label */}
     <div style={{height:52,borderBottom:"1px solid #0f1010",display:"flex",alignItems:"center",justifyContent:"center",background:"#374151"}}>
      <img src={textIcon} style={{width:20,height:20,objectFit:"contain",filter:"invert(1)"}} />
     </div>
     {extraTracks.filter(tr=>tr.type==="video").map(tr=>(
      <div key={tr.id} onDragEnter={e=>onTrackDragEnter(e,tr.id)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,tr.id)} style={{height:52,borderBottom:"1px solid #0f1010",display:"flex",alignItems:"center",padding:"0 10px",gap:6,background:dropTarget===tr.id?"#0d2218":"#161719",boxShadow:dropTarget===tr.id?"inset 0 0 0 1px #22c55e":"none"}}>
       <span style={{fontSize:12}}>🎬</span><span style={{fontSize:11,color:"#6b7280"}}>{tr.label}</span>
      </div>
     ))}
     {/* Video 1 label (use Video icon) */}
     <div onDragEnter={e=>onTrackDragEnter(e,0)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,0)} style={{height:52,borderBottom:"1px solid #0f1010",display:"flex",alignItems:"center",justifyContent:"center",background:dropTarget===0?"#1d4ed8":"#1e40af",boxShadow:dropTarget===0?"inset 0 0 0 1px #bfdbfe":"none"}}>
      <img src={videoIcon} style={{width:22,height:22,objectFit:"contain",filter:"invert(1)"}} />
     </div>
     {/* Audio 1 label (use Audio icon) */}
     <div onDragEnter={e=>onTrackDragEnter(e,1)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,1)} style={{height:52,borderBottom:"1px solid #0f1010",display:"flex",alignItems:"center",justifyContent:"center",background:dropTarget===1?"#047857":"#065f46",boxShadow:dropTarget===1?"inset 0 0 0 1px #bbf7d0":"none"}}>
      <img src={audioIcon} style={{width:22,height:22,objectFit:"contain",filter:"invert(1)"}} />
     </div>
     {extraTracks.filter(tr=>tr.type==="audio").map(tr=>(
      <div key={tr.id} onDragEnter={e=>onTrackDragEnter(e,tr.id)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,tr.id)} style={{height:52,borderBottom:"1px solid #0f1010",display:"flex",alignItems:"center",padding:"0 10px",gap:6,background:dropTarget===tr.id?"#0d2218":"#161719",boxShadow:dropTarget===tr.id?"inset 0 0 0 1px #22c55e":"none"}}>
       <span style={{fontSize:12}}>🔊</span><span style={{fontSize:11,color:"#6b7280"}}>{tr.label}</span>
      </div>
     ))}
    </div>

    <div ref={tlRef} onMouseDown={onTimelineMouseDown} style={{flex:1,overflowX:"auto",overflowY:"hidden",position:"relative",cursor:tool==="razor"?"crosshair":"default"}}>
     <div style={{width:tlWidth,position:"relative"}}>
      <div style={{height:22,background:"#0d0e11",borderBottom:"1px solid #26282e",position:"relative"}}>
       {renderRuler()}
       <div style={{position:"absolute",top:0,left:currentTime*zoom,width:2,height:"100%",background:"#f97316",pointerEvents:"none",zIndex:11}}>
        <div style={{position:"absolute",top:-1,left:-3,width:0,height:0,borderLeft:"4px solid transparent",borderRight:"4px solid transparent",borderTop:"6px solid #f97316"}}/>
       </div>
      </div>

      {/* Subtitles track canvas */}
      <div style={{height:52,borderBottom:"1px solid #0d0f12",position:"relative",background:"#020617"}} onClick={()=>{setSelectedId(null);setSelectedTextId(null);}}>
       {textClips.filter(tc=>tc.subtitle).map(tc=>{const w=Math.max(tc.durationSec*zoom,4);const isSel=tc.id===selectedTextId;const isBulk=isBulkSelectedText(tc);return(
        <div id={`tclip-${tc.id}`} key={tc.id} onMouseDown={e=>onTextClipMouseDown(e,tc.id)} style={{position:"absolute",left:tc.startSec*zoom,top:4,width:w,height:44,background:(isSel||isBulk)?"#4c1d95bb":"#0ea5e9bb",border:`1.5px solid ${(isSel||isBulk)?"#c4b5fd":"#38bdf8"}`,boxShadow:isBulk?"0 0 0 1px #a78bfa inset":"none",borderRadius:6,overflow:"hidden",cursor:"grab",boxSizing:"border-box",display:"flex",alignItems:"center",paddingLeft:8,fontSize:11,color:(isSel||isBulk)?"#f5f3ff":"#e0f2fe",zIndex:isSel?5:1}}>
         CC {tc.label}
         <div onMouseDown={e=>{e.preventDefault();e.stopPropagation();const od=tc.durationSec,sx=e.clientX;const om=(ev:MouseEvent)=>setTextClips(prev=>prev.map(c=>c.id===tc.id?{...c,durationSec:Math.max(0.5,od+(ev.clientX-sx)/zoom)}:c));const ou=()=>{window.removeEventListener("mousemove",om);window.removeEventListener("mouseup",ou);};window.addEventListener("mousemove",om);window.addEventListener("mouseup",ou);}} style={{position:"absolute",right:0,top:0,bottom:0,width:7,background:"rgba(56,189,248,0.4)",cursor:"ew-resize",borderRadius:"0 4px 4px 0"}}/>
        </div>
       );})}
      </div>

      {/* Text track canvas */}
      <div style={{height:52,borderBottom:"1px solid #0d0f12",position:"relative",background:"#0c0a14"}} onClick={()=>{setSelectedId(null);setSelectedTextId(null);}}>
       {textClips.filter(tc=>!tc.subtitle).map(tc=>{const w=Math.max(tc.durationSec*zoom,4);const isSel=tc.id===selectedTextId;const isBulk=isBulkSelectedText(tc);return(
        <div id={`tclip-${tc.id}`} key={tc.id} onMouseDown={e=>onTextClipMouseDown(e,tc.id)} style={{position:"absolute",left:tc.startSec*zoom,top:4,width:w,height:44,background:(isSel||isBulk)?"#4c1d95bb":"#2e1065bb",border:`1.5px solid ${(isSel||isBulk)?"#a78bfa":"#7c3aed"}`,boxShadow:isBulk?"0 0 0 1px #a78bfa inset":"none",borderRadius:6,overflow:"hidden",cursor:"grab",boxSizing:"border-box",display:"flex",alignItems:"center",paddingLeft:8,fontSize:11,color:"#ddd6fe",zIndex:isSel?5:1}}>
         T {tc.label}
         <div onMouseDown={e=>{e.preventDefault();e.stopPropagation();const od=tc.durationSec,sx=e.clientX;const om=(ev:MouseEvent)=>setTextClips(prev=>prev.map(c=>c.id===tc.id?{...c,durationSec:Math.max(0.5,od+(ev.clientX-sx)/zoom)}:c));const ou=()=>{window.removeEventListener("mousemove",om);window.removeEventListener("mouseup",ou);};window.addEventListener("mousemove",om);window.addEventListener("mouseup",ou);}} style={{position:"absolute",right:0,top:0,bottom:0,width:7,background:"rgba(167,139,250,0.4)",cursor:"ew-resize",borderRadius:"0 4px 4px 0"}}/>
        </div>
       );})}
      </div>


      {/* Extra video rows */}
      {extraTracks.filter(tr=>tr.type==="video").map(tr=>(
       <div key={tr.id} onDragEnter={e=>onTrackDragEnter(e,tr.id)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,tr.id)} style={{height:52,borderBottom:"1px solid #0d0f12",position:"relative",background:dropTarget===tr.id?"#0d2218":"#0a0b0e",boxShadow:dropTarget===tr.id?"inset 0 0 0 1px #22c55e":"none",transition:"background 0.08s"}}>
        {dropTarget===tr.id&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:10}}><span style={{fontSize:11,color:"#22c55e",background:"rgba(0,0,0,0.6)",padding:"2px 10px",borderRadius:4}}>Drop here</span></div>}
        {clips.filter(c=>c.track===tr.id).map(clip=>{const visDur=clip.durationSec-clip.trimStart-clip.trimEnd;const w=Math.max(visDur*zoom,4);const isSel=clip.id===selectedId;return(
         <div id={`clip-${clip.id}`} key={clip.id} onMouseDown={e=>onClipMouseDown(e,clip.id)} onClick={e=>onClipClick(e,clip.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,clipId:clip.id});}} style={{position:"absolute",left:clip.startSec*zoom,top:4,width:w,height:44,background:clip.color+"bb",border:`1.5px solid ${isSel?"#fff":clip.color}`,borderRadius:6,overflow:"hidden",cursor:tool==="razor"?"crosshair":"grab",boxShadow:isSel?"0 0 0 1px white":"none",zIndex:isSel?5:1}}>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",padding:"0 2px",overflow:"hidden"}}>{Array.from({length:Math.floor(w/4)},(_,i)=><div key={i} style={{width:2,flexShrink:0,marginRight:2,height:`${25+Math.abs(Math.sin(i*0.7))*20}%`,background:"rgba(255,255,255,0.32)",borderRadius:1}}/>)}</div>
          <div style={{position:"absolute",top:3,left:6,fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.9)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:w-14,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{clip.label}</div>
          {w>64&&<div style={{position:"absolute",bottom:3,right:6,fontSize:9,color:"rgba(255,255,255,0.45)",fontFamily:"monospace"}}>{fmt(visDur)}</div>}
          {isSel&&(<><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"start")} style={{position:"absolute",left:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"4px 0 0 4px"}}/><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"end")} style={{position:"absolute",right:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"0 4px 4px 0"}}/></>)}
         </div>
        );})}
       </div>
      ))}

      {/* Video 1 */}
      <div onDragEnter={e=>onTrackDragEnter(e,0)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,0)} style={{height:52,borderBottom:"1px solid #0d0f12",position:"relative",background:dropTarget===0?"#0d2218":"#0a0b0e",boxShadow:dropTarget===0?"inset 0 0 0 1px #22c55e":"none",transition:"background 0.08s"}}>
       {dropTarget===0&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:10}}><span style={{fontSize:11,color:"#22c55e",background:"rgba(0,0,0,0.6)",padding:"2px 10px",borderRadius:4}}>Drop here</span></div>}
       {clips.filter(c=>c.track===0).map(clip=>{const visDur=clip.durationSec-clip.trimStart-clip.trimEnd;const w=Math.max(visDur*zoom,4);const isSel=clip.id===selectedId;return(
        <div id={`clip-${clip.id}`} key={clip.id} onMouseDown={e=>onClipMouseDown(e,clip.id)} onClick={e=>onClipClick(e,clip.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,clipId:clip.id});}} style={{position:"absolute",left:clip.startSec*zoom,top:4,width:w,height:44,background:clip.color+"bb",border:`1.5px solid ${isSel?"#fff":clip.color}`,borderRadius:6,overflow:"hidden",cursor:tool==="razor"?"crosshair":"grab",boxShadow:isSel?"0 0 0 1px white":"none",zIndex:isSel?5:1,outline:highlightIds.has(clip.id)?"2px solid #facc15":"none"}}>
         <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",padding:"0 2px",overflow:"hidden"}}>{Array.from({length:Math.floor(w/4)},(_,i)=><div key={i} style={{width:2,flexShrink:0,marginRight:2,height:`${25+Math.abs(Math.sin(i*0.7))*20}%`,background:"rgba(255,255,255,0.32)",borderRadius:1}}/>)}</div>
         <div style={{position:"absolute",top:3,left:6,fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.9)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:w-14,textShadow:"0 1px 3px rgba(0,0,0,0.8)",display:"flex",alignItems:"center",gap:2}}>
          {renamingId===clip.id?<input autoFocus value={renameValue} onChange={e=>setRenameValue(e.target.value)} onBlur={handleRenameCommit} onKeyDown={e=>{if(e.key==="Enter")handleRenameCommit();if(e.key==="Escape")setRenamingId(null);}} style={{background:"transparent",border:"none",borderBottom:"1px solid #facc15",color:"white",fontSize:"inherit",width:"90%",outline:"none"}} onClick={e=>e.stopPropagation()}/>:<span>{clip.label}</span>}
          {clip.speed&&clip.speed!==1&&<span style={{background:"#f59e0b22",border:"1px solid #f59e0b44",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#f59e0b",marginLeft:3}}>{clip.speed}×</span>}
          {clip.clipVolume===0&&<span style={{background:"#ef444422",border:"1px solid #ef444444",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#ef4444",marginLeft:3}}>🔇</span>}
          {clip.effects&&Object.values(clip.effects).some(v=>v!==undefined&&v!==0)&&<span style={{background:"#6366f122",border:"1px solid #6366f144",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#6366f1",marginLeft:3}}>FX</span>}
         </div>
         {w>64&&<div style={{position:"absolute",bottom:3,right:6,fontSize:9,color:"rgba(255,255,255,0.45)",fontFamily:"monospace"}}>{fmt(visDur)}</div>}
         {isSel&&(<><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"start")} style={{position:"absolute",left:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"4px 0 0 4px",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:2,height:13,background:"rgba(0,0,0,0.4)",borderRadius:1}}/></div><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"end")} style={{position:"absolute",right:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"0 4px 4px 0",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:2,height:13,background:"rgba(0,0,0,0.4)",borderRadius:1}}/></div></>)}
        </div>
       );})}
      </div>

      {/* Audio 1 */}
      <div onDragEnter={e=>onTrackDragEnter(e,1)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,1)} style={{height:52,borderBottom:"1px solid #0d0f12",position:"relative",background:dropTarget===1?"#0d2218":"#09090c",boxShadow:dropTarget===1?"inset 0 0 0 1px #22c55e":"none",transition:"background 0.08s"}}>
       {dropTarget===1&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:10}}><span style={{fontSize:11,color:"#22c55e",background:"rgba(0,0,0,0.6)",padding:"2px 10px",borderRadius:4}}>Drop here</span></div>}
       {clips.filter(c=>c.track===1).map(clip=>{const visDur=clip.durationSec-clip.trimStart-clip.trimEnd;const w=Math.max(visDur*zoom,4);const isSel=clip.id===selectedId;return(
        <div id={`clip-${clip.id}`} key={clip.id} onMouseDown={e=>onClipMouseDown(e,clip.id)} onClick={e=>onClipClick(e,clip.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,clipId:clip.id});}} style={{position:"absolute",left:clip.startSec*zoom,top:4,width:w,height:44,background:clip.color+"bb",border:`1.5px solid ${isSel?"#fff":clip.color}`,borderRadius:6,overflow:"hidden",cursor:tool==="razor"?"crosshair":"grab",boxShadow:isSel?"0 0 0 1px white":"none",zIndex:isSel?5:1,outline:highlightIds.has(clip.id)?"2px solid #facc15":"none"}}>
         <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",padding:"0 2px",overflow:"hidden"}}>{Array.from({length:Math.floor(w/4)},(_,i)=><div key={i} style={{width:2,flexShrink:0,marginRight:2,height:`${25+Math.abs(Math.sin(i*0.7))*20}%`,background:"rgba(255,255,255,0.32)",borderRadius:1}}/>)}</div>
         <div style={{position:"absolute",top:3,left:6,fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.9)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:w-14,textShadow:"0 1px 3px rgba(0,0,0,0.8)",display:"flex",alignItems:"center",gap:2}}><span>{clip.label}</span>
          {clip.speed&&clip.speed!==1&&<span style={{background:"#f59e0b22",border:"1px solid #f59e0b44",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#f59e0b",marginLeft:3}}>{clip.speed}×</span>}
          {clip.clipVolume===0&&<span style={{background:"#ef444422",border:"1px solid #ef444444",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#ef4444",marginLeft:3}}>🔇</span>}
          {clip.effects&&Object.values(clip.effects).some(v=>v!==undefined&&v!==0)&&<span style={{background:"#6366f122",border:"1px solid #6366f144",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#6366f1",marginLeft:3}}>FX</span>}
         </div>
         {w>64&&<div style={{position:"absolute",bottom:3,right:6,fontSize:9,color:"rgba(255,255,255,0.45)",fontFamily:"monospace"}}>{fmt(visDur)}</div>}
         {isSel&&(<><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"start")} style={{position:"absolute",left:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"4px 0 0 4px",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:2,height:13,background:"rgba(0,0,0,0.4)",borderRadius:1}}/></div><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"end")} style={{position:"absolute",right:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"0 4px 4px 0",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:2,height:13,background:"rgba(0,0,0,0.4)",borderRadius:1}}/></div></>)}
        </div>
       );})}
      </div>

      {/* Extra audio rows */}
      {extraTracks.filter(tr=>tr.type==="audio").map(tr=>(
       <div key={tr.id} onDragEnter={e=>onTrackDragEnter(e,tr.id)} onDragOver={onTrackDragOver} onDragLeave={onTrackDragLeave} onDrop={e=>onTrackDrop(e,tr.id)} style={{height:52,borderBottom:"1px solid #0d0f12",position:"relative",background:dropTarget===tr.id?"#0d2218":"#09090c",boxShadow:dropTarget===tr.id?"inset 0 0 0 1px #22c55e":"none",transition:"background 0.08s"}}>
        {dropTarget===tr.id&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:10}}><span style={{fontSize:11,color:"#22c55e",background:"rgba(0,0,0,0.6)",padding:"2px 10px",borderRadius:4}}>Drop here</span></div>}
        {clips.filter(c=>c.track===tr.id).map(clip=>{const visDur=clip.durationSec-clip.trimStart-clip.trimEnd;const w=Math.max(visDur*zoom,4);const isSel=clip.id===selectedId;return(
         <div id={`clip-${clip.id}`} key={clip.id} onMouseDown={e=>onClipMouseDown(e,clip.id)} onClick={e=>onClipClick(e,clip.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,clipId:clip.id});}} style={{position:"absolute",left:clip.startSec*zoom,top:4,width:w,height:44,background:clip.color+"bb",border:`1.5px solid ${isSel?"#fff":clip.color}`,borderRadius:6,overflow:"hidden",cursor:tool==="razor"?"crosshair":"grab",boxShadow:isSel?"0 0 0 1px white":"none",zIndex:isSel?5:1}}>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",padding:"0 2px",overflow:"hidden"}}>{Array.from({length:Math.floor(w/4)},(_,i)=><div key={i} style={{width:2,flexShrink:0,marginRight:2,height:`${25+Math.abs(Math.sin(i*0.7))*20}%`,background:"rgba(255,255,255,0.32)",borderRadius:1}}/>)}</div>
          <div style={{position:"absolute",top:3,left:6,fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.9)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:w-14,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{clip.label}</div>
          {w>64&&<div style={{position:"absolute",bottom:3,right:6,fontSize:9,color:"rgba(255,255,255,0.45)",fontFamily:"monospace"}}>{fmt(visDur)}</div>}
          {isSel&&(<><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"start")} style={{position:"absolute",left:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"4px 0 0 4px"}}/><div onMouseDown={e=>onTrimMouseDown(e,clip.id,"end")} style={{position:"absolute",right:0,top:0,bottom:0,width:7,background:"rgba(255,255,255,0.45)",cursor:"ew-resize",borderRadius:"0 4px 4px 0"}}/></>)}
         </div>
        );})}
       </div>
      ))}

      <div style={{position:"absolute",top:0,left:currentTime*zoom,width:1,height:"100%",background:"rgba(249,115,22,0.75)",pointerEvents:"none",zIndex:20}}/>
     </div>
    </div>
   </div>

   {/* Context menu */}
   {contextMenu&&(()=>{const clip=clips.find(c=>c.id===contextMenu.clipId);if(!clip)return null;const partner=findPartner(clip);return(
    <div onMouseDown={e=>e.stopPropagation()} style={{position:"fixed",top:contextMenu.y,left:contextMenu.x,background:"#1a1b1f",border:"1px solid #374151",borderRadius:8,padding:"4px 0",zIndex:1000,minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,0.6)",fontSize:13,color:"#e2e8f0"}}>
     {[{label:partner?"Unlink audio/video":"Unlink (no pair)",disabled:!partner,onClick:()=>handleUnlink(contextMenu.clipId)},{label:"Delete clip",onClick:()=>handleDeleteFromMenu(contextMenu.clipId),danger:true},{label:"Rename clip",onClick:()=>handleRenameStart(contextMenu.clipId)},{label:"Cut here",onClick:()=>handleRazorFromMenu(contextMenu.clipId)}].map(item=>(
      <div key={item.label} onClick={item.disabled?undefined:item.onClick} style={{padding:"7px 16px",cursor:item.disabled?"default":"pointer",opacity:item.disabled?0.4:1,color:(item as any).danger?"#ef4444":"inherit"}}
       onMouseEnter={e=>{if(!item.disabled)(e.currentTarget as HTMLDivElement).style.background="#26282e";}} onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.background="transparent";}}>{item.label}</div>
     ))}
    </div>
   );})()}

   {/* Editor-owned Export dialog */}
{exportOpen && (
<div
style={{
position: "fixed",
inset: 0,
background: "rgba(0,0,0,0.7)",
display: "flex",
alignItems: "center",
justifyContent: "center",
zIndex: 2000,
}}
>
<div
style={{
background: "#1c1c1c",
width: 900,
borderRadius: 12,
display: "grid",
gridTemplateColumns: "220px 1fr",
overflow: "hidden",
position: "relative",
}}
>
{/* Close button */}
<button
onClick={() => setExportOpen(false)}
style={{
position: "absolute",
right: 15,
top: 10,
fontSize: 26,
cursor: "pointer",
background: "transparent",
border: "none",
color: "#fff",
}}
>
&times;
</button>

{/* Left format sidebar */}
<div
style={{
background: "#121212",
padding: 20,
display: "flex",
flexDirection: "column",
gap: 10,
}}
>
<div style={{ fontSize: 24, marginBottom: 10 }}>🎬</div>
{[
"MP4 (AV1)",
"MPEG-1",
"MPEG-2",
"WMV",
"MKV",
"FLV",
"M2TS (H.264)",
].map((fmt, idx) => (
<div
key={fmt}
style={{
padding: "10px 14px",
borderRadius: 8,
cursor: "pointer",
color: idx === 0 ? "#fff" : "#aaa",
background: idx === 0 ? "#2f2f2f" : "transparent",
}}
>
{fmt}
</div>
))}
</div>

{/* Right pane */}
<div style={{ padding: 30 }}>
<div style={{ marginBottom: 20 }}>
<h2
style={{
margin: "0 0 20px 30px",
fontSize: 20,
fontWeight: 600,
}}
>
Save video to the computer
</h2>
</div>

<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
{/* Title row */}
<div
style={{
display: "grid",
gridTemplateColumns: "120px 1fr",
alignItems: "center",
marginBottom: 18,
columnGap: 16,
}}
>
<div style={{ color: "#9a9a9a" }}>Title</div>
<div>
<input
type="text"
value={exportTitle}
onChange={e=>setExportTitle(e.target.value)}
disabled={exporting}
style={{
width: "100%",
background: "#2b2b2b",
border: "none",
borderRadius: 999,
padding: "10px 16px",
color: "#fff",
}}
/>
</div>
</div>

{/* Save to row */}
<div
style={{
display: "grid",
gridTemplateColumns: "120px 1fr 120px",
alignItems: "center",
marginBottom: 18,
columnGap: 16,
}}
>
<div style={{ color: "#9a9a9a" }}>Save to</div>
<div>
<input
type="text"
style={{
width: "100%",
background: "#2b2b2b",
border: "none",
borderRadius: 999,
padding: "10px 16px",
color: exportFolder ? "#fff" : "#777",
}}
value={exportFolder || "Choose a folder"}
readOnly
/>
</div>
<div>
<button
className="secondary"
disabled={exporting}
onClick={async () => {
const result = await (window as any).api.pickTargetFolder?.();
if (result && result.folder) {
setExportFolder(result.folder);
}
}}
style={{
background: "#2a2a2a",
border: "none",
padding: "8px 14px",
borderRadius: 999,
color: "#fff",
cursor: "pointer",
width: "100%",
}}
>
Browse
</button>
</div>
</div>

{/* Quality row */}
<div
style={{
display: "grid",
gridTemplateColumns: "120px 1fr",
alignItems: "center",
marginBottom: 18,
columnGap: 16,
}}
>
<div style={{ color: "#9a9a9a" }}>Quality</div>
<div
style={{
display: "flex",
gap: 20,
alignItems: "center",
}}
>
{["draft", "good", "high"].map((q) => (
<label
key={q}
style={{ display: "flex", alignItems: "center" }}
>
<input
type="radio"
name="export-quality"
checked={exportQuality === q}
onChange={() => setExportQuality(q as any)}
disabled={exporting}
style={{ marginRight: 6 }}
/>
<span>
{q === "draft"
? "Draft"
: q === "good"
? "Good"
: "High"}
</span>
</label>
))}
</div>
</div>

{/* Summary pill */}
<div
style={{
background: "#1e2a3d",
padding: "12px 16px",
borderRadius: 8,
margin: "18px 0",
color: "#cbd6ff",
fontSize: 13,
}}
>
Standard export time, size, and quality. Use to save the final
video.
</div>

{/* Details grid */}
<div
style={{
display: "grid",
gridTemplateColumns: "120px 1fr auto",
gap: 10,
marginBottom: 20,
fontSize: 13,
position: "relative",
}}
>
<div style={{ color: "#888" }}>Resolution</div>
<div>{exportResolution}</div>
<div>
<button
disabled={exporting}
onClick={() => setExportAdvancedOpen(true)}
style={{
background: "#2b2b2b",
border: "none",
padding: "6px 12px",
borderRadius: 8,
color: "#fff",
cursor: "pointer",
}}
>
Advanced
</button>
</div>

<div style={{ color: "#888" }}>Duration</div>
<div>{fmt(totalDuration)}</div>
<div />

<div style={{ color: "#888" }}>File size</div>
<div>
{exportResolution} ·{" "}
{exportQuality === "draft"
? "~20–40 MB"
: exportQuality === "good"
? "~40–80 MB"
: "~80–140 MB"}
</div>
<div />

{exportAdvancedOpen && (
<div
style={{
position: "fixed",
inset: 0,
background: "rgba(0,0,0,0.6)",
display: "flex",
alignItems: "center",
justifyContent: "center",
zIndex: 3000,
}}
>
<div
style={{
background: "#121212",
borderRadius: 10,
border: "1px solid #2b2b2b",
padding: 20,
width: 520,
boxShadow: "0 24px 60px rgba(0,0,0,0.9)",
}}
>
<div
style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
marginBottom: 12,
}}
>
<div style={{ fontSize: 13, fontWeight: 600 }}>
Advanced export
</div>
<button
onClick={() => setExportAdvancedOpen(false)}
style={{
background: "transparent",
border: "none",
color: "#aaa",
cursor: "pointer",
fontSize: 18,
lineHeight: 1,
}}
>
×
</button>
</div>

<div style={{ marginBottom: 10 }}>
<div
style={{
fontSize: 11,
color: "#9a9a9a",
marginBottom: 4,
}}
>
Video codec
</div>
<select
value={exportCodec}
onChange={(e) => setExportCodec(e.target.value)}
disabled={exporting}
style={{
width: "100%",
background: "#2b2b2b",
border: "none",
borderRadius: 8,
padding: "8px 10px",
color: "#fff",
fontSize: 12,
}}
>
<option value="H.264">H.264</option>
<option value="H.265">H.265 / HEVC</option>
<option value="AV1">AV1</option>
</select>
</div>

<div style={{ marginBottom: 10 }}>
<div
style={{
fontSize: 11,
color: "#9a9a9a",
marginBottom: 4,
}}
>
Resolution
</div>
<select
value={exportResolution}
onChange={(e) => setExportResolution(e.target.value)}
disabled={exporting}
style={{
width: "100%",
background: "#2b2b2b",
border: "none",
borderRadius: 8,
padding: "8px 10px",
color: "#fff",
fontSize: 12,
}}
>
<option value="1920x1080">
16:9 — Standard widescreen (YouTube, TV, PC) — 1920×1080
</option>
<option value="1280x720">
16:9 — Standard widescreen (HD) — 1280×720
</option>
<option value="1080x1920">
9:16 — Vertical (TikTok, Reels, Shorts) — 1080×1920
</option>
<option value="1080x1080">
1:1 — Square (Instagram posts) — 1080×1080
</option>
<option value="1024x768">
4:3 — Old TV / classic video — 1024×768
</option>
<option value="1080x720">
3:2 — Photography / DSLR — 1080×720
</option>
<option value="2560x1080">
21:9 — Ultra-wide cinematic — 2560×1080
</option>
<option value="2048x858">
2.39:1 — CinemaScope movies — 2048×858
</option>
<option value="1280x1024">
5:4 — Older monitors — 1280×1024
</option>
<option value="5120x1440">
32:9 — Super ultrawide — 5120×1440
</option>
<option value="2160x1080">
18:9 — Modern smartphone screens — 2160×1080
</option>
<option value="3840x2160">
3840×2160 (4K) — 16:9
</option>
<option value="2560x1440">
2560×1440 (2K) — 16:9
</option>
<option value="1920x1080">
1920×1080 (Full HD) — 16:9
</option>
<option value="720x1280">
720×1280 — 9:16
</option>
</select>
</div>

<div style={{ marginBottom: 10 }}>
<div
style={{
fontSize: 11,
color: "#9a9a9a",
marginBottom: 4,
}}
>
Frame rate
</div>
<select
value={exportFps}
onChange={(e) => setExportFps(e.target.value)}
disabled={exporting}
style={{
width: "100%",
background: "#2b2b2b",
border: "none",
borderRadius: 8,
padding: "8px 10px",
color: "#fff",
fontSize: 12,
}}
>
<option value="23.976">23.976</option>
<option value="24">24</option>
<option value="25">25</option>
<option value="29.97">29.97</option>
<option value="30">30</option>
<option value="50">50</option>
<option value="59.94">59.94</option>
<option value="60">60</option>
</select>
</div>

<div
style={{
marginTop: 12,
marginBottom: 8,
fontSize: 12,
fontWeight: 600,
}}
>
Audio
</div>

<div style={{ marginBottom: 10 }}>
<div
style={{
fontSize: 11,
color: "#9a9a9a",
marginBottom: 4,
}}
>
Sample rate
</div>
<select
value={exportSampleRate}
onChange={(e) => setExportSampleRate(e.target.value)}
disabled={exporting}
style={{
width: "100%",
background: "#2b2b2b",
border: "none",
borderRadius: 8,
padding: "8px 10px",
color: "#fff",
fontSize: 12,
}}
>
<option value="44100">44.1 kHz</option>
<option value="48000">48 kHz</option>
</select>
</div>

<div style={{ marginBottom: 12 }}>
<div
style={{
fontSize: 11,
color: "#9a9a9a",
marginBottom: 4,
}}
>
Audio channels
</div>
<div style={{ display: "flex", gap: 16, fontSize: 12 }}>
<label
style={{ display: "flex", alignItems: "center", gap: 6 }}
>
<input
type="radio"
name="adv-audio-ch"
checked={exportAudioChannels === "stereo"}
onChange={() => setExportAudioChannels("stereo")}
disabled={exporting}
/>
<span>Stereo</span>
</label>
<label
style={{ display: "flex", alignItems: "center", gap: 6 }}
>
<input
type="radio"
name="adv-audio-ch"
checked={exportAudioChannels === "mono"}
onChange={() => setExportAudioChannels("mono")}
disabled={exporting}
/>
<span>Mono</span>
</label>
</div>
</div>

<div
style={{
display: "flex",
justifyContent: "space-between",
marginTop: 8,
}}
>
<button
onClick={() => {
setExportCodec("H.264");
setExportResolution("1080x1920");
setExportFps("29.97");
setExportSampleRate("44100");
setExportAudioChannels("stereo");
setExportQuality("good");
}}
style={{
background: "#2a2a2a",
border: "none",
padding: "6px 12px",
borderRadius: 8,
color: "#fff",
cursor: "pointer",
fontSize: 12,
}}
>
Restore defaults
</button>
<div style={{ display: "flex", gap: 8 }}>
<button
onClick={() => setExportAdvancedOpen(false)}
style={{
background: "#2a2a2a",
border: "none",
padding: "6px 12px",
borderRadius: 8,
color: "#fff",
cursor: "pointer",
fontSize: 12,
}}
>
Cancel
</button>
<button
onClick={() => setExportAdvancedOpen(false)}
style={{
background: "#fff",
border: "none",
padding: "6px 16px",
borderRadius: 8,
color: "#000",
cursor: "pointer",
fontSize: 12,
fontWeight: 600,
}}
>
OK
</button>
</div>
</div>
</div>
</div>
)}
</div>

{/* Codec / FPS / Audio summary */}
<div
style={{
color: "#aaa",
fontSize: 14,
marginBottom: 20,
}}
>
<span>Codec: </span>
<strong>{exportCodec}</strong>
<span> · Frame rate: </span>
<strong>{exportFps} fps</strong>
<span> · Audio: </span>
<strong>
{exportSampleRate === "48000" ? "48 kHz" : "44.1 kHz"} ·{" "}
{exportAudioChannels === "mono" ? "Mono" : "Stereo"}
</strong>
</div>

{/* Bottom actions */}
<div
style={{
display: "flex",
justifyContent: "flex-end",
gap: 12,
}}
>
<button
className="secondary"
disabled={exporting}
onClick={() => setExportOpen(false)}
style={{
background: "#2a2a2a",
padding: "10px 20px",
borderRadius: 8,
cursor: "pointer",
border: "none",
color: "#fff",
}}
>
Cancel
</button>
<button
disabled={
exporting || !exportFolder || !clips.some((c) => c.track === 0)
}
style={{
background:
exporting ||
!exportFolder ||
!clips.some((c) => c.track === 0)
? "#2b2b2b"
: "#fff",
color:
exporting ||
!exportFolder ||
!clips.some((c) => c.track === 0)
? "#777"
: "#000",
border: "none",
padding: "10px 20px",
borderRadius: 8,
cursor:
exporting ||
!exportFolder ||
!clips.some((c) => c.track === 0)
? "default"
: "pointer",
}}
onClick={async () => {
if (!exportFolder || !clips.some((c) => c.track === 0)) return;
setExporting(true);

try {
const result = await (window as any).api.exportTimeline?.({
clips,
textClips,
outputFolder: exportFolder,
quality: exportQuality,
resolution: exportResolution,
codec: exportCodec,
fps: exportFps,
sampleRate: exportSampleRate,
audioChannels: exportAudioChannels,
title: exportTitle,
transitions,
elements,
});

if (result?.outputPath) {
console.log("[EDITOR EXPORT] Done:", result.outputPath);
}
} catch (err: any) {
console.error("[EDITOR EXPORT ERROR]", err);
} finally {
setExporting(false);
setExportOpen(false);
}
}}
>
{exporting ? "Exporting…" : "Start"}
</button>
</div>
</div>
</div>
</div>
</div>
)}
</div>
);
};

export default VideoEditor;