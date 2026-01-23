import { useState, useEffect, useRef } from 'react'
import './App.css'
import './components/ThemeButtonElement'
import VideoUpload from './components/VideoUpload'
import Timeline, { Segment } from './components/Timeline'
import TranslationPanel from './components/TranslationPanel'
import CloudBackground from './components/CloudBackground'
import Sidebar from './components/Sidebar'
import ModelManager from './components/ModelManager';
import TTSConfig from './components/TTSConfig';
import WhisperConfig from './components/WhisperConfig';
import CompensationStrategy from './components/CompensationStrategy';


function App() {
  const [videoPath, setVideoPath] = useState<string>('')
  const [originalVideoPath, setOriginalVideoPath] = useState<string>('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(false)
  const [dubbingLoading, setDubbingLoading] = useState(false)
  const [generatingSegmentId, setGeneratingSegmentId] = useState<number | null>(null);
  const [retranslatingSegmentId, setRetranslatingSegmentId] = useState<number | null>(null);
  const [playingAudioIndex, setPlayingAudioIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVideoIndex, setPlayingVideoIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const timeIndex = segments.findIndex(seg => currentTime >= seg.start && currentTime < seg.end);
  const activeIndex = editingIndex !== null ? editingIndex : timeIndex;
  const [seekTime, setSeekTime] = useState<number | null>(null)
  const [playUntilTime, setPlayUntilTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isIndeterminate, setIsIndeterminate] = useState(false);
  const [installingDeps, setInstallingDeps] = useState(false);
  const [depsPackageName, setDepsPackageName] = useState('');
  const [translatedSegments, setTranslatedSegments] = useState<Segment[]>([])
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('targetLang') || 'English')
  const [mergedVideoPath, setMergedVideoPath] = useState<string>('')
  const timelineRef = useRef<HTMLDivElement>(null);
  const translationRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef<null | 'timeline' | 'translation'>(null);
  const [leftWidth, setLeftWidth] = useState(() => parseInt(localStorage.getItem('leftWidth') || '400'));
  const [activeQwenMode, setActiveQwenMode] = useState<'clone' | 'design' | 'preset'>(() => (localStorage.getItem('qwen_mode') as any) || 'clone');
  const [timelineWidth, setTimelineWidth] = useState(() => parseInt(localStorage.getItem('timelineWidth') || '500'));
  const [dragTarget, setDragTarget] = useState<'left' | 'middle' | null>(null);
  const [asrService, setAsrService] = useState(() => localStorage.getItem('asrService') || 'whisperx');
  const [missingDeps, setMissingDeps] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'models' | 'strategy' | 'tts' | 'whisper'>(() => (localStorage.getItem('currentView') as any) || 'home');
  const [mergeVersion, setMergeVersion] = useState(0);
  const [ttsService, setTtsService] = useState<'indextts' | 'qwen'>(() => (localStorage.getItem('ttsService') as any) || 'indextts');
  const [batchSize, setBatchSize] = useState(() => parseInt(localStorage.getItem('batchSize') || '1'));

  useEffect(() => {
    const checkEnv = async () => {
      try {
        const result = await (window as any).ipcRenderer.invoke('check-python-env');
        if (result && result.success && result.missing) {
          setMissingDeps(result.missing);
          if (result.missing.length > 0) {
            console.log("Missing dependencies:", result.missing);
            setStatus(`检测到 ${result.missing.length} 个缺失的 Python 依赖`);
          }
        }
      } catch (e) {
        console.error("Failed to check env:", e);
      }
    };
    checkEnv();
  }, []);

  // Persistence for Settings
  useEffect(() => { localStorage.setItem('targetLang', targetLang); }, [targetLang]);
  useEffect(() => { localStorage.setItem('asrService', asrService); }, [asrService]);
  useEffect(() => { localStorage.setItem('ttsService', ttsService); }, [ttsService]);
  useEffect(() => { localStorage.setItem('leftWidth', leftWidth.toString()); }, [leftWidth]);
  useEffect(() => { localStorage.setItem('timelineWidth', timelineWidth.toString()); }, [timelineWidth]);
  useEffect(() => { localStorage.setItem('currentView', currentView); }, [currentView]);
  useEffect(() => { localStorage.setItem('batchSize', batchSize.toString()); }, [batchSize]);

  useEffect(() => {
    const validateLayout = () => {
      const sidebarWidth = 80;
      const minTranslationWidth = 350;
      const minLeftWidth = 250;
      const minTimelineWidth = 300;
      const margins = 40;

      const totalAvailable = window.innerWidth - sidebarWidth - margins;
      const currentTotal = leftWidth + timelineWidth + minTranslationWidth;

      if (currentTotal > totalAvailable) {
        // We need to shrink. Prioritize shrinking timeline, then left.
        // But respect minimums.

        let availableForTwoColumns = totalAvailable - minTranslationWidth;
        // Clamp to theoretical maximums
        if (availableForTwoColumns < minLeftWidth + minTimelineWidth) {
          // Screen implies extremely small width, just set to minimums (layout will break but logic won't hang)
          availableForTwoColumns = minLeftWidth + minTimelineWidth;
        }

        // Try to keep ratio or just shrink timeline first?
        // Let's protect leftWidth (video) a bit more.
        let newLeft = leftWidth;
        let newTimeline = timelineWidth;

        // Shrink timeline down to min
        if (newLeft + newTimeline > availableForTwoColumns) {
          const overflow = (newLeft + newTimeline) - availableForTwoColumns;
          const timelineShrinkable = newTimeline - minTimelineWidth;

          if (timelineShrinkable >= overflow) {
            newTimeline -= overflow;
          } else {
            newTimeline = minTimelineWidth;
            const remainingOverflow = overflow - timelineShrinkable;
            newLeft = Math.max(minLeftWidth, newLeft - remainingOverflow);
          }
        }

        if (newLeft !== leftWidth) setLeftWidth(newLeft);
        if (newTimeline !== timelineWidth) setTimelineWidth(newTimeline);
      }
    };

    // Run on mount and resize
    validateLayout();
    window.addEventListener('resize', validateLayout);
    return () => window.removeEventListener('resize', validateLayout);
  }, [leftWidth, timelineWidth]); // Re-run if they change externally (though we want to avoid loop, this logic only shrinks if OVER limit)



  // Background Mode
  const [bgMode, setBgMode] = useState<'gradient' | 'dark'>(() => (localStorage.getItem('bgMode') as 'gradient' | 'dark') || 'gradient');
  const themeBtnRef = useRef<HTMLElement>(null);

  /* 
   * Transition Logic:
   * "gradient" mode is now repurposed as "Light Mode"
   * "dark" mode remains default
   */
  useEffect(() => {
    if (bgMode === 'gradient') { // 'gradient' maps to Light Mode now
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-bg');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-bg');
    }

    // Reset specific style property to allow class to take over or ensure fallback
    document.body.style.backgroundColor = '';
    localStorage.setItem('bgMode', bgMode);
  }, [bgMode]);

  useEffect(() => {
    const btn = themeBtnRef.current;
    if (!btn) return;
    const handler = (e: any) => {
      setBgMode(e.detail === 'dark' ? 'dark' : 'gradient');
    };
    btn.addEventListener('change', handler);
    return () => btn.removeEventListener('change', handler);
  }, []);

  // Abort controller for One-Click Run
  const abortRef = useRef(false);

  // Listener for Backend Progress & Partial Results
  useEffect(() => {
    const handleProgress = (_event: any, value: number) => {
      setIsIndeterminate(false);
      setProgress(value);
    };

    const handlePartialResult = (_event: any, data: any) => {
      if (data && typeof data.index === 'number') {
        setTranslatedSegments(prev => {
          const newSegs = [...prev];
          if (newSegs[data.index]) {
            // Handle Audio Update
            if (data.audio_path !== undefined) {
              const isSuccess = data.success === true;
              newSegs[data.index] = {
                ...newSegs[data.index],
                audioPath: data.audio_path,
                audioStatus: isSuccess ? 'ready' : 'error'
              }
            }
            // Handle Text Update (Real-time translation)
            if (data.text !== undefined) {
              newSegs[data.index] = {
                ...newSegs[data.index],
                text: data.text
              }
            }
          }
          return newSegs;
        })
      }
    };

    const handleDepsInstalling = (_event: any, pkgName: string) => {
      setInstallingDeps(true);
      setDepsPackageName(pkgName);
    };

    const handleDepsDone = () => {
      setInstallingDeps(false);
      setDepsPackageName('');
    };

    (window as any).ipcRenderer.on('backend-progress', handleProgress);
    (window as any).ipcRenderer.on('backend-partial-result', handlePartialResult);
    (window as any).ipcRenderer.on('backend-deps-installing', handleDepsInstalling);
    (window as any).ipcRenderer.on('backend-deps-done', handleDepsDone);

    return () => {
      const ipc = (window as any).ipcRenderer;
      if (ipc.off) {
        ipc.off('backend-progress', handleProgress);
        ipc.off('backend-partial-result', handlePartialResult);
        ipc.off('backend-deps-installing', handleDepsInstalling);
        ipc.off('backend-deps-done', handleDepsDone);
      }
    };
  }, []);

  // Drag state refs to avoid closure staleness and re-renders
  const dragState = useRef<{
    startX: number;
    startLeftWidth: number;
    startTimelineWidth: number;
    target: 'left' | 'middle' | null;
  }>({ startX: 0, startLeftWidth: 0, startTimelineWidth: 0, target: null });

  // Drag handlers using Refs to avoid closure staleness
  const handleDragMove = useRef((e: MouseEvent) => {
    if (!dragState.current.target) return;

    const { startX, startLeftWidth, startTimelineWidth, target } = dragState.current;
    const deltaX = e.clientX - startX;

    const minTranslationWidth = 350;
    const minTimelineWidth = 300;
    const minLeftWidth = 250;

    const sidebarWidth = 80; // Buffer safe assumption
    const availableContentWidth = window.innerWidth - sidebarWidth;

    if (target === 'left') {
      const maxLeft = availableContentWidth - timelineWidth - minTranslationWidth - 40;
      const newW = Math.max(minLeftWidth, Math.min(maxLeft, startLeftWidth + deltaX));
      setLeftWidth(newW);
    } else if (target === 'middle') {
      const maxTimeline = availableContentWidth - leftWidth - minTranslationWidth - 40;
      const newW = Math.max(minTimelineWidth, Math.min(maxTimeline, startTimelineWidth + deltaX));
      setTimelineWidth(newW);
    }
  }).current;

  const handleDragUp = useRef(() => {
    setDragTarget(null);
    dragState.current.target = null;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragUp);
  }).current;

  const startDrag = (e: React.MouseEvent, target: 'left' | 'middle') => {
    e.preventDefault();
    setDragTarget(target);
    dragState.current = {
      startX: e.clientX,
      startLeftWidth: leftWidth,
      startTimelineWidth: timelineWidth,
      target: target
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragUp);
  };


  // Sync Scroll Handler
  const handleScroll = (source: 'timeline' | 'translation') => {
    const sourceEl = source === 'timeline' ? timelineRef.current : translationRef.current;
    const targetEl = source === 'timeline' ? translationRef.current : timelineRef.current;

    if (!sourceEl || !targetEl) return;
    if (isScrollingRef.current && isScrollingRef.current !== source) return;

    isScrollingRef.current = source;

    // Calculate percentage or exact position? exact is better if height matches.
    // But content height might differ due to text length. Percentage is safer for now.
    // Or just map index to index? No, simple scroll sync for now.
    const percentage = sourceEl.scrollTop / (sourceEl.scrollHeight - sourceEl.clientHeight);
    targetEl.scrollTop = percentage * (targetEl.scrollHeight - targetEl.clientHeight);

    // Debounce reset
    clearTimeout((window as any).scrollTimeout);
    (window as any).scrollTimeout = setTimeout(() => {
      isScrollingRef.current = null;
    }, 50);
  };

  const formatTimeSRT = (seconds: number) => {
    const pad = (num: number, size: number) => ('000' + num).slice(size * -1);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
  };

  const handleASR = async (): Promise<Segment[] | null> => {
    if (!originalVideoPath) {
      setStatus('请先上传/选择视频');
      return null;
    }

    setLoading(true);
    setIsIndeterminate(true);
    setProgress(0);
    setStatus('正在识别字幕...');

    try {
      // Calculate paths first
      const paths = await (window as any).ipcRenderer.invoke('get-paths');
      const outputRoot = paths.outputDir;
      const projectRoot = paths.projectRoot; // Available from backend
      const filenameWithExt = originalVideoPath.split(/[\\/]/).pop() || "video.mp4";
      const filenameNoExt = filenameWithExt.replace(/\.[^/.]+$/, "");

      const sessionOutputDir = `${outputRoot}\\${filenameNoExt}`;
      // Corrected Cache Path: ProjectRoot/.cache/VideoName
      const cacheDir = `${projectRoot}\\.cache\\${filenameNoExt}`;

      // Ensure directories exist
      await (window as any).ipcRenderer.invoke('ensure-dir', sessionOutputDir);
      await (window as any).ipcRenderer.invoke('ensure-dir', cacheDir);

      const vadOnset = localStorage.getItem('whisper_vad_onset') || '0.700';
      const vadOffset = localStorage.getItem('whisper_vad_offset') || '0.700';

      const result = await (window as any).ipcRenderer.invoke('run-backend', [
        '--action', 'test_asr',
        '--input', originalVideoPath,
        '--asr', asrService,
        '--output_dir', cacheDir, // Pass cache dir for raw debug files
        '--vad_onset', vadOnset,
        '--vad_offset', vadOffset
      ]);

      if (abortRef.current) return null;

      console.log("ASR Result:", result);
      if (Array.isArray(result)) {
        // Enforce chronological sort
        result.sort((a: any, b: any) => a.start - b.start);

        // Update state
        setSegments(result);

        const srtContent = result.map((seg: any, index: number) => {
          return `${index + 1}\n${formatTimeSRT(seg.start)} --> ${formatTimeSRT(seg.end)}\n${seg.text}\n`;
        }).join('\n');

        const srtPath = `${cacheDir}\\${filenameNoExt}.srt`; // Save to .cache
        await (window as any).ipcRenderer.invoke('save-file', srtPath, srtContent);

        // Also Save segments JSON to cache for referencing later
        const jsonPath = `${cacheDir}\\audio_segments.json`;
        await (window as any).ipcRenderer.invoke('save-file', jsonPath, JSON.stringify(result, null, 2));

        setStatus(`识别完成，SRT及数据已保存至 ${cacheDir}。请在下方编辑字幕。`);
        return result;
      } else {
        setStatus('识别失败：输出格式无效。');
        return null;
      }
    } catch (e: any) {
      console.error(e);
      setStatus(`错误: ${e.message}`);
      return null;
    } finally {
      if (!abortRef.current) {
        // Only turn off loading if not aborted (or if aborted, we want to stop anyway)
        // Actually always turn off loading for this step.
        setLoading(false);
        setIsIndeterminate(false);
        setProgress(0);
      }
    }
  };

  const handleTranslate = async (overrideSegments?: Segment[]): Promise<Segment[] | null> => {
    const segsToUse = overrideSegments || segments;
    if (segsToUse.length === 0) return null;

    setLoading(true);
    setIsIndeterminate(true);
    setProgress(0);
    setStatus(`正在翻译 ${segsToUse.length} 个片段到 ${targetLang}...`);

    // Initialize translatedSegments with placeholders
    const placeholders = segsToUse.map(seg => ({
      ...seg,
      text: '...',
      audioPath: undefined,
      audioStatus: undefined
    }));
    setTranslatedSegments(placeholders);

    try {
      if (abortRef.current) return null;

      // Prepare JSON for backend
      const inputJson = JSON.stringify(segsToUse);

      const result = await (window as any).ipcRenderer.invoke('run-backend', [
        '--action', 'translate_text',
        '--input', inputJson,
        '--lang', targetLang,
        '--json'
      ]);

      if (abortRef.current) return null;

      if (result && result.success) {
        setTranslatedSegments(result.segments);
        setStatus("翻译完成！");
        return result.segments;
      } else {
        console.error("Translation failed:", result);
        setStatus(`翻译失败: ${result?.error || 'Unknown'}`);
        return null;
      }
    } catch (e: any) {
      console.error(e);
      setStatus(`Translation Error: ${e.message}`);
      return null;
    } finally {
      if (!abortRef.current) {
        setLoading(false);
        setIsIndeterminate(false);
        setProgress(0);
      }
    }
  };

  const handleGenerateSingleDubbing = async (index: number) => {
    if (!originalVideoPath || !translatedSegments[index]) return;
    setGeneratingSegmentId(index);
    setStatus(`正在生成第 ${index + 1} 句配音...`);

    try {
      const seg = translatedSegments[index];
      const paths = await (window as any).ipcRenderer.invoke('get-paths');
      const filename = originalVideoPath.split(/[\\/]/).pop() || "video.mp4";
      const filenameNoExt = filename.replace(/\.[^/.]+$/, "");
      const segmentsDir = `${paths.outputDir}\\${filenameNoExt}\\${filenameNoExt}_segments`;

      await (window as any).ipcRenderer.invoke('ensure-dir', segmentsDir);

      const audioPath = `${segmentsDir}\\segment_${index}.wav`;

      // Read advanced TTS config
      const ttsTemp = localStorage.getItem('tts_temperature') || '0.8';
      const ttsTopP = localStorage.getItem('tts_top_p') || '0.8';
      const ttsRepPen = localStorage.getItem('tts_repetition_penalty') || '10.0';
      const ttsCfg = localStorage.getItem('tts_cfg_scale') || '0.7';
      const ttsRefAudio = localStorage.getItem('tts_ref_audio_path') || '';

      const qwenMode = localStorage.getItem('qwen_mode') || 'clone';
      const qwenInstruct = localStorage.getItem('qwen_voice_instruction') || '';
      const qwenLang = localStorage.getItem('qwen_language');
      const qwenModelSize = localStorage.getItem('qwen_model_size') || '1.7B';

      // Design then Clone Workflow
      const qwenDesignRef = localStorage.getItem('qwen_design_ref_audio');
      const qwenDesignText = localStorage.getItem('qwen_design_ref_text');

      let effectiveQwenMode = qwenMode;
      let qwenRefAudio = localStorage.getItem('qwen_ref_audio_path');
      let qwenRefText = '';

      if (ttsService === 'qwen' && qwenMode === 'design' && qwenDesignRef) {
        effectiveQwenMode = 'clone';
        qwenRefAudio = qwenDesignRef;
        qwenRefText = qwenDesignText || '';
        console.log('[QwenBoost] Using designed voice for cloning:', qwenRefAudio);
      }

      // Determine effective language: Qwen Override > Target Lang
      let effectiveLang = targetLang;
      if (ttsService === 'qwen' && qwenLang && qwenLang !== 'Auto') {
        effectiveLang = qwenLang;
      }

      const args = [
        '--action', 'generate_single_tts',
        '--input', originalVideoPath,
        '--output', audioPath,
        '--text', seg.text,
        '--start', seg.start.toString(),
        '--duration', (seg.end - seg.start).toString(),
        '--lang', effectiveLang,
        '--temperature', ttsTemp,
        '--top_p', ttsTopP,
        '--repetition_penalty', ttsRepPen,
        '--cfg_scale', ttsCfg,
        '--strategy', localStorage.getItem('compensation_strategy') || 'auto_speedup',
        '--tts_service', ttsService,
        '--json'
      ];

      if (ttsService === 'qwen') {
        if (qwenRefAudio) args.push('--ref_audio', qwenRefAudio);
        if (qwenRefText) args.push('--qwen_ref_text', qwenRefText);

        args.push('--qwen_mode', effectiveQwenMode);
        args.push('--qwen_model_size', qwenModelSize);
        if (effectiveQwenMode === 'design' && qwenInstruct) {
          args.push('--voice_instruct', qwenInstruct);
        }
      } else {
        // IndexTTS fallback for explicit ref
        if (ttsRefAudio) args.push('--ref_audio', ttsRefAudio);
      }



      const result = await (window as any).ipcRenderer.invoke('run-backend', args);

      if (result && result.success) {
        setTranslatedSegments(prev => {
          const newSegs = [...prev];
          newSegs[index] = { ...newSegs[index], audioPath: result.audio_path, audioStatus: 'ready' };
          return newSegs;
        });
        setStatus(`第 ${index + 1} 句配音生成完成`);
      } else {
        console.error("Single TTS failed:", result);
        setTranslatedSegments(prev => {
          const newSegs = [...prev];
          newSegs[index] = { ...newSegs[index], audioStatus: 'error' };
          return newSegs;
        });
        setStatus(`第 ${index + 1} 句配音失败: ${result?.error || 'Unknown'}`);
      }
    } catch (e: any) {
      console.error(e);
      setStatus(`配音生成错误: ${e.message}`);
    } finally {
      setGeneratingSegmentId(null);
    }
  };

  const handleGenerateAllDubbing = async (overrideSegments?: Segment[]): Promise<Segment[] | null> => {
    const segsToUse = overrideSegments || translatedSegments;
    if (!originalVideoPath || segsToUse.length === 0) return null;

    setDubbingLoading(true);
    setIsIndeterminate(true); // Show animation while preparing/extracting refs
    setProgress(0);
    setStatus("正在批量生成配音 (模型加载中可能较慢)...");

    try {
      if (abortRef.current) return null;

      const paths = await (window as any).ipcRenderer.invoke('get-paths');
      const filename = originalVideoPath.split(/[\\/]/).pop() || "video.mp4";
      const filenameNoExt = filename.replace(/\.[^/.]+$/, "");
      const segmentsDir = `${paths.outputDir}\\${filenameNoExt}\\${filenameNoExt}_segments`;

      await (window as any).ipcRenderer.invoke('ensure-dir', segmentsDir);

      const tempJsonPath = `${segmentsDir}\\batch_tasks.json`;

      // Prepare segments with pre-defined output paths to help backend
      const segmentsToProcess = segsToUse.map((seg, idx) => ({
        ...seg,
        // Ensure audioPath is set desired location if not already
        audioPath: seg.audioPath || `${segmentsDir}\\segment_${idx}.wav`
      }));

      await (window as any).ipcRenderer.invoke('save-file', tempJsonPath, JSON.stringify(segmentsToProcess));

      if (abortRef.current) return null;

      // Read advanced TTS config
      const ttsTemp = localStorage.getItem('tts_temperature') || '0.8';
      const ttsTopP = localStorage.getItem('tts_top_p') || '0.8';
      const ttsRepPen = localStorage.getItem('tts_repetition_penalty') || '10.0';
      const ttsCfg = localStorage.getItem('tts_cfg_scale') || '0.7';
      const ttsRefAudio = localStorage.getItem('tts_ref_audio_path') || '';

      const qwenMode = localStorage.getItem('qwen_mode') || 'clone';
      const qwenInstruct = localStorage.getItem('qwen_voice_instruction') || '';
      const qwenLang = localStorage.getItem('qwen_language');
      const qwenModelSize = localStorage.getItem('qwen_model_size') || '1.7B';

      // Design then Clone Workflow
      const qwenDesignRef = localStorage.getItem('qwen_design_ref_audio');
      const qwenDesignText = localStorage.getItem('qwen_design_ref_text');

      let effectiveQwenMode = qwenMode;
      let qwenRefAudio = localStorage.getItem('qwen_ref_audio_path');
      let qwenRefText = '';

      if (ttsService === 'qwen' && qwenMode === 'design' && qwenDesignRef) {
        effectiveQwenMode = 'clone';
        qwenRefAudio = qwenDesignRef;
        qwenRefText = qwenDesignText || '';
        console.log('[QwenBoost] Using designed voice for batch cloning:', qwenRefAudio);
      }

      let effectiveLang = targetLang;
      if (ttsService === 'qwen' && qwenLang && qwenLang !== 'Auto') {
        effectiveLang = qwenLang;
      }

      const args = [
        '--action', 'generate_batch_tts',
        '--input', originalVideoPath,
        '--ref', tempJsonPath,
        '--lang', effectiveLang,
        '--temperature', ttsTemp,
        '--top_p', ttsTopP,
        '--repetition_penalty', ttsRepPen,
        '--cfg_scale', ttsCfg,
        '--strategy', localStorage.getItem('compensation_strategy') || 'auto_speedup', // Pass strategy
        '--tts_service', ttsService,
        '--batch_size', batchSize.toString(),
        '--json'
      ];

      if (ttsService === 'qwen') {
        if (qwenRefAudio) args.push('--ref_audio', qwenRefAudio);
        if (qwenRefText) args.push('--qwen_ref_text', qwenRefText);

        args.push('--qwen_mode', effectiveQwenMode);
        args.push('--qwen_model_size', qwenModelSize);
        if (effectiveQwenMode === 'design' && qwenInstruct) {
          args.push('--voice_instruct', qwenInstruct);
        }
      } else {
        if (ttsRefAudio) args.push('--ref_audio', ttsRefAudio);
      }



      const result = await (window as any).ipcRenderer.invoke('run-backend', args);

      if (abortRef.current) return null;

      if (result && result.success && Array.isArray(result.results)) {
        // Construct new segments based on results
        const newSegments = [...segmentsToProcess];

        result.results.forEach((res: any) => {
          if (newSegments[res.index]) {
            if (res.success) {
              newSegments[res.index] = {
                ...newSegments[res.index],
                audioPath: res.audio_path,
                audioStatus: 'ready'
              };
            } else {
              newSegments[res.index] = {
                ...newSegments[res.index],
                audioStatus: 'error'
              };
              console.error(`Segment ${res.index} failed:`, res.error);
            }
          }
        });

        setTranslatedSegments(newSegments);
        setStatus("批量配音生成完成");
        return newSegments;
      } else {
        setStatus(`批量配音失败: ${result?.error || 'Unknown'}`);
        return null;
      }

    } catch (e: any) {
      console.error(e);
      setStatus(`Batch Error: ${e.message}`);
      return null;
    } finally {
      if (!abortRef.current) {
        setDubbingLoading(false);
        setProgress(0);
      }
    }
  };

  const handlePlaySegmentAudio = (index: number, audioPath: string) => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    // If clicking the same segment that is currently playing, toggle pause
    if (playingAudioIndex === index) {
      audioEl.pause();
      setPlayingAudioIndex(null);
      return;
    }

    // Play new segment
    const url = `file:///${audioPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    audioEl.src = url;
    audioEl.play().catch(e => {
      console.error("Audio play failed", e);
      setPlayingAudioIndex(null);
      setStatus("播放失败: " + (e.message || "未知错误"));
    });

    setPlayingAudioIndex(index);
  };


  const handleDubbing = async (overrideSegments?: Segment[]): Promise<boolean> => {
    if (!originalVideoPath) {
      setStatus("请先上传/选择视频");
      return false;
    }

    const segsToUse = overrideSegments || translatedSegments;

    // Check if we have audio segments
    const hasAudio = segsToUse.some(s => s.audioPath);
    if (!hasAudio) {
      setStatus("请先生成配音音频");
      return false;
    }

    setDubbingLoading(true);
    setIsIndeterminate(true);
    setProgress(100); // Indeterminate bar
    setStatus("正在合并视频...");

    try {
      if (abortRef.current) return false;

      const paths = await (window as any).ipcRenderer.invoke('get-paths');
      const projectRoot = paths.projectRoot;
      const filename = originalVideoPath.split(/[\\/]/).pop() || "video.mp4";
      const filenameNoExt = filename.replace(/\.[^/.]+$/, "");
      const outputPath = `${paths.outputDir}\\${filenameNoExt}\\${filenameNoExt}_dubbed_${targetLang}.mp4`;
      const cacheDir = `${projectRoot}\\.cache\\${filenameNoExt}`;

      // Ensure cache dir exists
      await (window as any).ipcRenderer.invoke('ensure-dir', cacheDir);

      const jsonPath = `${cacheDir}\\audio_segments.json`; // Save intermediate JSON to .cache

      // Filter and map segments for backend
      const audioSegments = segsToUse
        .filter(s => s.audioPath)
        .map(s => ({
          start: s.start,
          end: s.end,
          path: s.audioPath
        }));

      // Save JSON manifest
      await (window as any).ipcRenderer.invoke('save-file', jsonPath, JSON.stringify(audioSegments, null, 2));

      if (abortRef.current) return false;

      // Read Compensation Strategy
      const strategy = localStorage.getItem('compensation_strategy') || 'auto_speedup';

      const qwenMode = localStorage.getItem('qwen_mode') || 'clone';
      const qwenInstruct = localStorage.getItem('qwen_voice_instruction') || '';

      const args = [
        '--action', 'merge_video',
        '--input', originalVideoPath,
        '--ref', jsonPath,
        '--output', outputPath,
        '--strategy', strategy,
        '--tts_service', ttsService
      ];

      if (ttsService === 'qwen') {
        const explicitRef = localStorage.getItem('qwen_ref_audio_path');
        if (explicitRef) args.push('--ref_audio', explicitRef);

        args.push('--qwen_mode', qwenMode);
        if (qwenMode === 'design' && qwenInstruct) {
          args.push('--voice_instruct', qwenInstruct);
        }
      } else {
        const indexRef = localStorage.getItem('tts_ref_audio_path');
        if (indexRef) args.push('--ref_audio', indexRef);
      }

      // Call merge_video
      const result = await (window as any).ipcRenderer.invoke('run-backend', args);

      if (abortRef.current) return false;

      if (result && result.success) {
        setStatus("配音合并完成！");
        // setVideoPath(result.output); // Keep original video in the source player
        setMergedVideoPath(result.output);
        setMergeVersion(v => v + 1);
        return true;
      } else {
        setStatus(`合并失败: ${result?.error || '未知错误'}`);
        return false;
      }

    } catch (error: any) {
      setStatus(`合并请求失败: ${error.message}`);
      return false;
    } finally {
      if (!abortRef.current) {
        setDubbingLoading(false);
        setIsIndeterminate(false);
        setProgress(0);
      }
    }
  };



  const handleReTranslate = async (index: number) => {
    if (loading || !translatedSegments[index]) return;

    setLoading(true);
    setRetranslatingSegmentId(index); // Set active index
    setStatus(`正在重新翻译片段 ${index + 1}...`);

    try {
      const sourceText = segments[index].text;
      const result = await (window as any).ipcRenderer.invoke('run-backend', [
        '--action', 'translate_text',
        '--input', sourceText,
        '--lang', targetLang,
        '--json'
      ]);

      if (result && result.success) {
        // Handle both simple text return and segment list return
        const newText = result.text || (result.segments && result.segments[0]?.text);

        if (newText) {
          setTranslatedSegments(prev => {
            const newSegs = [...prev];
            newSegs[index] = { ...newSegs[index], text: newText };
            return newSegs;
          });
          setStatus("重新翻译完成");
        } else {
          setStatus("重新翻译失败：返回结果为空");
        }
      } else {
        console.error("Re-translation failed:", result);
        setStatus(`重新翻译失败: ${result?.error || 'Unknown'}`);
      }
    } catch (e: any) {
      console.error(e);
      setStatus(`重新翻译错误: ${e.message}`);
    } finally {
      setProgress(0);
      setLoading(false);
      setRetranslatingSegmentId(null); // Clear active index
      setIsIndeterminate(false);
    }
  };

  const handleStop = async () => {
    abortRef.current = true;
    try {
      await (window as any).ipcRenderer.invoke('kill-backend');
      setStatus("任务已由用户停止");
    } catch (e) {
      console.error("Stop failed", e);
    } finally {
      setLoading(false);
      setDubbingLoading(false);
      setGeneratingSegmentId(null);
      setIsIndeterminate(false);
      setProgress(0);
    }
  };

  const handleOneClickRun = async () => {
    if (!originalVideoPath) {
      setStatus("请先选择视频");
      return;
    }
    abortRef.current = false;

    // Steps are sequential. Logic checks result of previous step.
    const asrSegs = await handleASR();
    if (!asrSegs) return;

    const transSegs = await handleTranslate(asrSegs);
    if (!transSegs) return;

    const dubbedSegs = await handleGenerateAllDubbing(transSegs);
    if (!dubbedSegs) return;

    await handleDubbing(dubbedSegs);
  };

  const handleTranslateAndDub = async () => {
    // Logic similar to OneClickRun but skipping ASR
    abortRef.current = false;
    const transSegs = await handleTranslate(); // Use current segments state
    if (!transSegs) return;

    // 继续生成配音
    await handleGenerateAllDubbing(transSegs);
  };

  // Modified to support pause toggle
  const handlePlaySegment = (startTime: number, endTime?: number, index?: number) => {
    // If we have an index and it matches currently playing video segment, toggle pause
    if (index !== undefined && playingVideoIndex === index) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setPlayingVideoIndex(null);
      return;
    }

    // Switch to new segment
    if (index !== undefined) {
      setPlayingVideoIndex(index);
    } else {
      setPlayingVideoIndex(null); // Unknown index
    }

    setSeekTime(null);
    setTimeout(() => {
      setSeekTime(startTime);
      if (endTime) {
        // Subtle offset to prevent jumping to next segment at end
        setPlayUntilTime(endTime - 0.05);
      } else {
        setPlayUntilTime(null);
      }
    }, 10);
  };




  const parseSRTContent = (text: string): Segment[] => {
    // Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const regex = /(\d+)\s*\n\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*\n([\s\S]*?)(?=\n\d+\s*\n\s*\d{2}:\d{2}[:.]|$)/g;

    const newSegments: Segment[] = [];
    let match;
    const parseTime = (t: string) => {
      const cleanT = t.replace(',', '.');
      const [h, m, s] = cleanT.split(':');
      return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
    };

    while ((match = regex.exec(normalizedText)) !== null) {
      const content = match[4].trim();
      if (content) {
        newSegments.push({
          start: parseTime(match[2]),
          end: parseTime(match[3]),
          text: content
        });
      }
    }
    return newSegments;
  };

  const handleSRTUpload = (file: File) => {
    if (!originalVideoPath) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const newSegments = parseSRTContent(text);
        if (newSegments.length > 0) {
          setSegments(newSegments);
          setStatus(`已加载外部源字幕 (${newSegments.length} 条)`);
        } else {
          setStatus(`字幕解析失败：未找到有效字幕片段`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleTargetSRTUpload = (file: File) => {
    if (!originalVideoPath) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const newSegments = parseSRTContent(text);
        if (newSegments.length > 0) {
          // Ensure audioStatus is reset for new translations
          const preparedSegments = newSegments.map(s => ({ ...s, audioStatus: 'none' as const }));
          setTranslatedSegments(preparedSegments);
          setStatus(`已加载译文字幕 (${newSegments.length} 条)`);
        } else {
          setStatus(`译文字幕解析失败：未找到有效字幕片段`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleOpenLog = async () => {
    try {
      const result = await (window as any).ipcRenderer.invoke('open-backend-log');
      if (!result.success) {
        setStatus(`无法打开日志: ${result.error}`);
      }
    } catch (e: any) {
      console.error(e);
      setStatus(`打开日志失败: ${e.message}`);
    }
  };

  const handleRepairEnv = async () => {
    if (loading) return; // Prevent if already busy

    let message = "这将尝试自动安装/修复 Python 依赖。过程可能需要几分钟，且需联网。\n是否继续？";
    if (missingDeps.length > 0) {
      message = `检测到以下缺失的依赖项:\n\n${missingDeps.join(', ')}\n\n点击“确定”将尝试自动安装这些依赖。\n过程可能需要几分钟，且需联网。是否继续？`;
    }

    const confirm = window.confirm(message);
    if (!confirm) return;

    setLoading(true);
    setIsIndeterminate(true);
    setStatus("正在修复环境 (pip install)... 请耐心等待");

    try {
      const result = await (window as any).ipcRenderer.invoke('fix-python-env');
      if (result && result.success) {
        setStatus("环境修复完成！请重启软件以生效。");
        alert("修复完成！建议重启软件。");
        setMissingDeps([]); // Clear flag
      } else {
        setStatus(`修复失败: ${result.error}`);
        alert(`修复失败: ${result.error}\n请检查日志或网络。`);
      }
    } catch (e: any) {
      setStatus(`修复请求异常: ${e.message}`);
      console.error(e);
    } finally {
      setLoading(false);
      setIsIndeterminate(false);
    }
  };




  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'row', height: '100vh', padding: '20px', boxSizing: 'border-box' }}>
      <theme-button
        key="theme-btn-3"
        ref={themeBtnRef}
        value={bgMode === 'dark' ? 'dark' : 'light'}
        size="1"
        style={{
          position: 'fixed',
          top: '20px',
          right: '30px',
          width: '180px',
          height: '70px',
          zIndex: 1000,
          cursor: 'pointer'
        }}
      ></theme-button>

      {/* Smooth Background Transition Layer (z-index 0) */}


      <CloudBackground mode={bgMode} />

      {bgMode === 'dark' && (
        <>
          <div className="blob-extra-blue" />
          <div className="blob-extra-orange" />
        </>
      )}

      <style>{`
        @keyframes indeterminate-progress {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
      `}</style>

      {/* Main Content Wrapper (z-index 2) */}
      <Sidebar
        activeService={currentView === 'home' ? asrService : currentView}
        onServiceChange={(s) => {
          if (['models', 'strategy', 'tts', 'whisper'].includes(s)) {
            setCurrentView(s as any);
          } else {
            setAsrService(s);
            setCurrentView('home');
          }
        }}
        disabled={false}
        onOpenLog={handleOpenLog}
        onRepairEnv={handleRepairEnv}
        onOpenModels={() => setCurrentView('models')}
        hasMissingDeps={missingDeps.length > 0}
        themeMode={bgMode}
      />
      {currentView === 'models' && (
        <div className="glass-panel" style={{ flex: 1, margin: '20px', zIndex: 2, overflow: 'hidden', position: 'relative' }}>
          <ModelManager themeMode={bgMode} />
        </div>
      )}
      {currentView === 'strategy' && (
        <div className="glass-panel" style={{ flex: 1, margin: '20px', zIndex: 2, overflow: 'hidden', position: 'relative' }}>
          <CompensationStrategy themeMode={bgMode} />
        </div>
      )}
      {currentView === 'tts' && (
        <div className="glass-panel" style={{ flex: 1, margin: '20px', zIndex: 2, overflow: 'hidden', position: 'relative' }}>
          <TTSConfig
            themeMode={bgMode}
            activeService={ttsService}
            onServiceChange={setTtsService}
            onQwenModeChange={setActiveQwenMode}
          />
        </div>
      )}
      {currentView === 'whisper' && (
        <div className="glass-panel" style={{ flex: 1, margin: '20px', zIndex: 2, overflow: 'hidden', position: 'relative' }}>
          <WhisperConfig themeMode={bgMode} />
        </div>
      )}
      <div className="content-wrapper" style={{ display: currentView === 'home' ? 'flex' : 'none', position: 'relative', zIndex: 2, height: '100%', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
        {/* Active TTS Status Indicator */}
        <div style={{
          position: 'absolute',
          top: '85px',
          right: '25px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
          fontSize: '0.85em',
          pointerEvents: 'auto',
          userSelect: 'none'
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>正在使用:</span>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>
            {ttsService === 'qwen' ? (
              <>Qwen3 ({activeQwenMode === 'clone' ? '声音克隆' : activeQwenMode === 'design' ? '声音设计' : '预置音色'})</>
            ) : 'Index-TTS'}
          </span>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }}></div>

          {ttsService === 'qwen' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9em' }}>并发数量:</span>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                style={{ width: 60, accentColor: '#22c55e', cursor: 'pointer' }}
              />
              <span style={{ color: '#fff', fontWeight: 'bold', minWidth: 14 }}>{batchSize}</span>
            </div>
          )}
        </div>

        <h1 style={{
          textAlign: 'center',
          marginBottom: '5px',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '2.5rem',
          fontWeight: '800',
          letterSpacing: '-1px',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
        }}>VideoSync</h1>
        <p style={{
          textAlign: 'center',
          marginTop: '5px',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1em',
          fontWeight: 700,
          opacity: 1,
          letterSpacing: '1px'
        }}>自动配音与音色克隆系统</p>

        {/* Repositioned Button: Absolute Top Left */}
        <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
          <button
            onClick={handleOneClickRun}
            disabled={loading || dubbingLoading || generatingSegmentId !== null || !originalVideoPath}
            title={!originalVideoPath ? "请先选择视频" : "自动执行所有步骤"}
            style={{
              padding: '10px 24px',
              background: '#ffffff',
              color: '#7c3aed',
              border: 'none',
              borderRadius: '24px',
              fontSize: '1em',
              fontWeight: 'bold',
              cursor: (loading || dubbingLoading || generatingSegmentId !== null || !originalVideoPath) ? 'not-allowed' : 'pointer',
              opacity: (loading || dubbingLoading || generatingSegmentId !== null || !originalVideoPath) ? 0.6 : 1,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            🚀 一键全流程 (识别+翻译+配音+合成)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', margin: '10px 0', padding: '10px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '8px', color: '#fff', fontSize: '0.9em', backdropFilter: 'blur(5px)' }}>
          <a
            href="https://space.bilibili.com/32275117"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#fff', textDecoration: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
          >
            天冬制作 Made by Tiandong
          </a>
        </div>

        {/* Hidden Audio Player for controlling playback */}
        <audio
          ref={audioRef}
          style={{ display: 'none' }}
          onEnded={() => setPlayingAudioIndex(null)}
          onError={(e) => {
            console.error("Audio playback error", e);
            setPlayingAudioIndex(null);
            setStatus("播放失败: 无法加载音频文件");
          }}
        />

        {
          status && (
            <div style={{ padding: '10px', background: 'rgba(99,102,241,0.2)', borderRadius: '8px', marginBottom: '10px', textAlign: 'center', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
              <div>{status}</div>
              {(loading || dubbingLoading || generatingSegmentId !== null) && (
                <button
                  onClick={handleStop}
                  style={{
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.9em'
                  }}
                >
                  ⏹ 停止任务
                </button>
              )}
              {!(loading || dubbingLoading || generatingSegmentId !== null) && (
                <button
                  onClick={() => setStatus('')}
                  title="清除消息"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    opacity: 0.6,
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '1.2em',
                    lineHeight: 1
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        }

        {/* Progress Bar */}
        {
          (loading || dubbingLoading) && (
            <div style={{ width: '100%', height: '8px', background: '#374151', borderRadius: '4px', marginBottom: '15px', overflow: 'hidden', position: 'relative' }}>
              <div
                className={isIndeterminate ? "progress-bar-indeterminate" : ""}
                style={{
                  height: '100%',
                  background: '#22c55e', // Green
                  width: isIndeterminate ? '30%' : `${progress}%`,
                  transition: isIndeterminate ? 'none' : 'width 0.3s ease-out',
                  position: 'absolute',
                  left: isIndeterminate ? undefined : 0,
                  borderRadius: '4px'
                }}
              />
            </div>
          )
        }

        {/* Main Content Area (Split Resizable) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%' }}>

          {/* Left Column: Video & Upload */}
          <div style={{ width: leftWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '10px', overflowY: 'auto', height: '100%' }}>
            <VideoUpload
              onFileSelected={(path) => {
                setVideoPath(path);
                setOriginalVideoPath(path);
              }}
              currentPath={videoPath}
              onTimeUpdate={setCurrentTime}
              seekTime={seekTime}
              playUntilTime={playUntilTime}
              videoRef={videoRef}
              onVideoPause={() => setPlayingVideoIndex(null)}
              disabled={loading || dubbingLoading || generatingSegmentId !== null}
              onUserSeek={() => setPlayUntilTime(null)}
            />

            {/* Merged Video Display Section */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', color: 'var(--text-primary)' }}>4. 合并后的视频</h3>

              {/* Merged Video Player */}
              {mergedVideoPath && (
                <div style={{ marginBottom: '15px', position: 'relative', background: 'black', borderRadius: '4px', overflow: 'hidden' }}>
                  <video
                    src={(mergedVideoPath.startsWith('file:') ? mergedVideoPath : `file:///${encodeURI(mergedVideoPath.replace(/\\/g, '/'))}`) + `?v=${mergeVersion}`}
                    controls
                    style={{ width: '100%', display: 'block' }}
                  />
                  <div
                    style={{
                      padding: '8px',
                      background: 'rgba(0,0,0,0.7)',
                      fontSize: '0.85em',
                      color: '#9ca3af',
                      wordBreak: 'break-all',
                      cursor: 'pointer'
                    }}
                    onClick={() => (window as any).ipcRenderer.invoke('open-external', mergedVideoPath)}
                    title="点击调用系统播放器打开"
                  >
                    {mergedVideoPath.split(/[\\/]/).pop()} <span style={{ color: '#6366f1' }}>(点击打开)</span>
                  </div>
                </div>
              )}

              {!mergedVideoPath && (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.9em',
                  border: '2px dashed var(--border-color)',
                  borderRadius: '4px',
                  marginBottom: '15px'
                }}>
                  合并完成后将在此显示
                </div>
              )}

              {/* Action Buttons */}
              <button
                onClick={() => handleDubbing()}
                disabled={loading || dubbingLoading || !videoPath || translatedSegments.length === 0}
                className="btn"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: loading || dubbingLoading || translatedSegments.length === 0 ? '#4b5563' : '#10b981',
                  cursor: loading || dubbingLoading || translatedSegments.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: loading || dubbingLoading || translatedSegments.length === 0 ? 0.7 : 1,
                  marginBottom: '10px'
                }}
              >
                {dubbingLoading ? '处理中...' : '开始合并 (生成配音)'}
              </button>
              <button
                onClick={() => (window as any).ipcRenderer.invoke('open-folder', mergedVideoPath)}
                disabled={!mergedVideoPath}
                className="btn"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: mergedVideoPath ? '#6366f1' : '#4b5563',
                  cursor: mergedVideoPath ? 'pointer' : 'not-allowed',
                  opacity: mergedVideoPath ? 1 : 0.7
                }}
              >
                📂 打开文件所在文件夹
              </button>
            </div>
          </div>

          {/* Resizer Divider */}
          <div
            onMouseDown={(e) => startDrag(e, 'left')}
            style={{
              width: '6px',
              flexShrink: 0,
              cursor: 'col-resize',
              backgroundColor: dragTarget === 'left' ? '#6366f1' : 'rgba(255,255,255,0.1)',
              margin: '0 2px',
              borderRadius: '3px',
              transition: 'background 0.2s, width 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10
            }}
            title="Drag to resize / 拖拽调整大小"
          >
            <div style={{ width: '2px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          </div>

          {/* Center Column: Original Timeline */}
          <div
            style={{ width: timelineWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minWidth: '300px', paddingLeft: '10px', paddingRight: '10px' }}
            onScroll={() => handleScroll('timeline')}
          >
            {/* We need to refactor Timeline to expose scroll ref or handle scrolling here. 
               Timeline has "glass-panel" style with overflow.
           */}
            <Timeline
              segments={segments}
              currentTime={currentTime}
              onUpdateSegment={(idx, txt) => {
                const newSegs = [...segments];
                newSegs[idx].text = txt;
                setSegments(newSegs);
              }}
              onPlaySegment={(start, end) => handlePlaySegment(start, end, segments.findIndex(s => s.start === start))}
              domRef={timelineRef}
              onScroll={() => handleScroll('timeline')}
              onASR={handleASR}
              loading={loading || dubbingLoading}
              videoPath={videoPath}
              playingVideoIndex={playingVideoIndex}
              activeIndex={activeIndex}
              onEditStart={setEditingIndex}
              onEditEnd={() => setEditingIndex(null)}
              onUploadSubtitle={handleSRTUpload}
            />
          </div>

          {/* Resizer Divider Middle */}
          <div
            onMouseDown={(e) => startDrag(e, 'middle')}
            style={{
              width: '6px',
              flexShrink: 0,
              cursor: 'col-resize',
              backgroundColor: dragTarget === 'middle' ? '#6366f1' : 'rgba(255,255,255,0.1)',
              margin: '0 2px',
              borderRadius: '3px',
              transition: 'background 0.2s, width 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10
            }}
            title="Drag to resize / 拖拽调整大小"
          >
            <div style={{ width: '2px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          </div>

          {/* Right Column: Translation Timeline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: '300px' }}>
            <TranslationPanel
              segments={segments} // Pass original segments to trigger translation
              translatedSegments={translatedSegments}
              setTranslatedSegments={setTranslatedSegments}
              targetLang={targetLang}
              setTargetLang={setTargetLang}
              onTranslate={() => handleTranslate()}
              onTranslateAndDub={handleTranslateAndDub}
              onGenerateAll={() => handleGenerateAllDubbing()}
              onGenerateSingle={handleGenerateSingleDubbing}
              onPlayAudio={handlePlaySegmentAudio}
              generatingSegmentId={generatingSegmentId}
              retranslatingSegmentId={retranslatingSegmentId}
              domRef={translationRef}
              onScroll={() => handleScroll('translation')}
              onUploadSubtitle={handleTargetSRTUpload}

              hasVideo={!!originalVideoPath}


              currentTime={currentTime}
              dubbingLoading={dubbingLoading}
              onReTranslate={handleReTranslate}
              loading={loading}
              onPlaySegment={(start, end) => handlePlaySegment(start, end, segments.findIndex(s => s.start === start))}
              playingAudioIndex={playingAudioIndex}
              playingVideoIndex={playingVideoIndex}
              activeIndex={activeIndex}
              onEditStart={setEditingIndex}
              onEditEnd={() => setEditingIndex(null)}
              ttsService={ttsService}
            />
          </div>
        </div>
      </div >
      {/* Dependency Installation Modal */}
      {installingDeps && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: '#fff',
          textAlign: 'center',
          padding: '20px',
          backdropFilter: 'blur(15px)',
          WebkitBackdropFilter: 'blur(15px)',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '40px',
            borderRadius: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: '600px'
          }}>
            <div className="spinner" style={{
              width: '60px',
              height: '60px',
              border: '5px solid rgba(255,255,255,0.1)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '30px',
              boxShadow: '0 0 15px rgba(99, 102, 241, 0.5)'
            }}></div>
            <h2 style={{ marginBottom: '15px', color: '#fff' }}>⚙️ 正在同步 AI 运行环境</h2>
            <p style={{ fontSize: '1.2em', marginBottom: '10px' }}>
              正在安装核心依赖: <span style={{ color: '#818cf8', fontWeight: 'bold' }}>{depsPackageName || '...'}</span>
            </p>
            <p style={{ color: '#aaa', maxWidth: '500px' }}>
              这是为了让 Qwen3-TTS 与原有模型并存所必需的操作。这可能需要 2-5 分钟（取决于您的网络），请勿关闭软件。
            </p>

            <div style={{
              marginTop: '30px',
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '20px',
              color: '#818cf8',
              fontWeight: 500
            }}>
              安装完成后将自动开始合成
            </div>
          </div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  )
}

export default App
