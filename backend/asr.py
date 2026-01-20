import os
import sys

python_dir = os.path.dirname(sys.executable)
site_packages = os.path.join(python_dir, "Lib", "site-packages")
if os.path.exists(site_packages) and site_packages not in sys.path:
    sys.path.insert(0, site_packages)

import torch
import traceback
import whisperx
import gc
import transformers.modeling_utils
import transformers.utils.import_utils

transformers.utils.import_utils.check_torch_load_is_safe = lambda: None
transformers.modeling_utils.check_torch_load_is_safe = lambda: None

from jianying import JianYingASR
from bcut import BcutASR
from asr_data import ASRData



BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Define specific model relative paths
# 1. Dev/Resources Path: ../models/whisperx/...
PATH_DEV_1 = os.path.join(BACKEND_DIR, "..", "models", "whisperx", "faster-whisper-large-v3-turbo-ct2")
PATH_DEV_2 = os.path.join(BACKEND_DIR, "..", "models", "faster-whisper-large-v3-turbo-ct2")

# 2. Prod Root Path: ../../models/whisperx/... (From resources/backend -> resources -> root)
PATH_PROD_1 = os.path.join(BACKEND_DIR, "..", "..", "models", "whisperx", "faster-whisper-large-v3-turbo-ct2")
PATH_PROD_2 = os.path.join(BACKEND_DIR, "..", "..", "models", "faster-whisper-large-v3-turbo-ct2")

DEFAULT_MODEL_ID = "large-v3-turbo" 

def split_into_subtitles(segments, max_chars=35, max_gap=0.5):
    new_segments = []
    
    PUNCTUATION = {'.', '?', '!', '。', '？', '！', '…', '；', ';', ',', '，'}
    
    if max_chars is None:
        max_chars = 30
        
    PUNCTUATION = {'.', '?', '!', '。', '？', '！', '…', '；', ';', ',', '，'}

    def is_content(w_text):
        return w_text.strip() not in PUNCTUATION

    for vad_seg in segments:
        words = vad_seg.get("words", [])
        if not words:
            continue
            
        # SANITIZER: Cap word duration
        # WhisperX sometimes hallucinates 5s+ duration for the last word.
        # We cap it to 1.5s max per character/word.
        for w in words:
            if "start" in w and "end" in w:
                dur = w["end"] - w["start"]
                if dur > 1.5:
                    w["end"] = w["start"] + 1.5

            
        vad_start = vad_seg["start"]
        vad_end = vad_seg["end"]
        
        merged_words = []
        if words:
            current_merged = words[0].copy()
            for i in range(1, len(words)):
                next_w = words[i]
                
                curr_end = current_merged.get("end")
                next_start = next_w.get("start")
                next_end = next_w.get("end")

                if curr_end is None or next_start is None or next_end is None:

                    merged_words.append(current_merged)
                    current_merged = next_w.copy()
                    continue

                curr_is_ascii = all(ord(c) < 128 for c in current_merged["word"])
                next_is_ascii = all(ord(c) < 128 for c in next_w["word"])
                gap = next_start - curr_end
                
                if curr_is_ascii and next_is_ascii and gap < 0.1:
                    current_merged["word"] += next_w["word"]
                    current_merged["end"] = next_end
                else:
                    merged_words.append(current_merged)
                    current_merged = next_w.copy()
            merged_words.append(current_merged)
            
        seg_chunks = []
        current_chunk_words = []
        current_len = 0
        
        for word in merged_words:
            w_text = word["word"]
            should_limit_split = False
            is_punct = w_text.strip() in PUNCTUATION
            
            if current_chunk_words and not is_punct:
                if current_len + len(w_text) > max_chars:
                    should_limit_split = True
            
            if should_limit_split:
                 seg_chunks.append(current_chunk_words)
                 current_chunk_words = []
                 current_len = 0
            
            current_chunk_words.append(word)
            current_len += len(w_text)
            
            if w_text and w_text[-1] in PUNCTUATION:
                 seg_chunks.append(current_chunk_words)
                 current_chunk_words = []
                 current_len = 0
                 
        if current_chunk_words:
            seg_chunks.append(current_chunk_words)
            
        for idx, chunk in enumerate(seg_chunks):
            raw_text = "".join([w["word"] for w in chunk])
            display_text = raw_text.strip()
            for p in PUNCTUATION:
                display_text = display_text.replace(p, "")
            
            if not display_text:
                continue
                
            # Safely get start/end from chunk or fallback to VAD boundaries
            c_start = chunk[0].get("start", vad_start)
            c_end = chunk[-1].get("end", vad_end)
            
            for w in chunk:
                if is_content(w["word"]) and "start" in w:
                    c_start = w["start"]
                    break
            for w in reversed(chunk):
                if is_content(w["word"]) and "end" in w:
                    c_end = w["end"]
                    break
            
            if idx == 0:
                # Limit backfill to prevent dragging in huge silence
                limit_start = max(vad_start, c_start - 0.5)
                if c_start > limit_start:
                    c_start = limit_start
            
            INTERNAL_DELAY = -0.35
            
            if idx > 0:
                c_start += INTERNAL_DELAY
                
            if idx < len(seg_chunks) - 1:
                c_end += INTERNAL_DELAY
            
            # Add tail extension
            c_end += 0.2

            # --- Strict VAD Intersection ---
            # Ensure the subtitle never exceeds the VAD-detected speech boundaries.
            # This prevents "eating" the silence between VAD segments.
            c_start = max(c_start, vad_start)
            c_end = min(c_end, vad_end)
            # -------------------------------
            
            # Ensure valid timestamp
            if c_end is None: c_end = c_start + 0.1
            if c_end <= c_start:
                 c_end = c_start + 0.1 # Min duration

            if idx == len(seg_chunks) - 1:
                pass 

            new_segments.append({
                "start": c_start,
                "end": c_end,
                "text": display_text
            })

    for i in range(len(new_segments) - 1):
        curr = new_segments[i]
        nxt = new_segments[i+1]
        
        # Safety for gap logic
        if nxt["start"] < curr["end"]:
            nxt["start"] = curr["end"]
            
        if nxt["end"] <= nxt["start"]:
            nxt["end"] = nxt["start"] + 0.1

    # for i in range(len(new_segments) - 1):
    #     curr = new_segments[i]
    #     nxt = new_segments[i+1]
    #     
    #     gap = nxt["start"] - curr["end"]
    #     
    #     if 0 < gap < 0.3: 
    #         curr["end"] = nxt["start"]
            
    return new_segments




def run_asr(audio_path, model_path=None, service="whisperx"):
    """
    Run ASR using WhisperX or Cloud APIs:
    1. Transcribe (Faster-Whisper generic / Cloud)
    2. Align (WhipserX Phoneme Alignment - Only for WhisperX)
    """
    
    # If input is video, extract audio first
    ext = os.path.splitext(audio_path)[1].lower()
    if ext in ['.mp4', '.mkv', '.avi', '.mov', '.flv']:
        import hashlib
        
        # Create cache directory
        cache_dir = os.path.join(BACKEND_DIR, ".cache")
        os.makedirs(cache_dir, exist_ok=True)
        
        # Generare unique filename based on absolute path
        abs_path = os.path.abspath(audio_path)
        file_hash = hashlib.md5(abs_path.encode('utf-8')).hexdigest()
        cached_audio = os.path.join(cache_dir, f"{file_hash}.mp3")
        
        if os.path.exists(cached_audio):
             print(f"Using cached audio: {cached_audio}")
             audio_path = cached_audio
        else:
            print(f"Extracting audio to {cached_audio}...")
            try:
                from pydub import AudioSegment
                AudioSegment.from_file(audio_path).export(cached_audio, format="mp3")
                audio_path = cached_audio
            except Exception as e:
                print(f"Audio extraction failed: {e}")
                # Fallback to original path if extraction fails (though likely will fail later)
                pass

    if service == "jianying":
        print(f"Running JianYing ASR on {audio_path}")
        asr = JianYingASR(audio_path, need_word_time_stamp=False)
        asr_data = asr.run()
        # Convert ASRData to standard format
        segments = []
        for seg in asr_data.segments:
            segments.append({
                "start": seg.start_time / 1000.0,
                "end": seg.end_time / 1000.0,
                "text": seg.text
            })
        print(f"JianYing ASR complete. {len(segments)} segments.")
        return segments

    elif service == "bcut":
        print(f"Running Bcut ASR on {audio_path}")
        asr = BcutASR(audio_path, need_word_time_stamp=False)
        asr_data = asr.run()
        # Convert ASRData to standard format
        segments = []
        for seg in asr_data.segments:
            segments.append({
                "start": seg.start_time / 1000.0,
                "end": seg.end_time / 1000.0,
                "text": seg.text
            })
        print(f"Bcut ASR complete. {len(segments)} segments.")
        return segments
    
    # Default: WhisperX
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    batch_size = 4 
    
    local_model_path = None
    if os.path.exists(PATH_PROD_1):
        local_model_path = PATH_PROD_1
    elif os.path.exists(PATH_PROD_2):
        local_model_path = PATH_PROD_2
    elif os.path.exists(PATH_DEV_1):
        local_model_path = PATH_DEV_1
    elif os.path.exists(PATH_DEV_2):
        local_model_path = PATH_DEV_2

    target_model = DEFAULT_MODEL_ID
    
    # --- Robust Path Resolution ---
    def resolve_file_path(in_path):
        if os.path.exists(in_path):
            return in_path
        
        # Path might me mangled (e.g. contain '?'). Try to recover via timestamp prefix.
        dirname, basename = os.path.split(in_path)
        if not os.path.exists(dirname):
            return in_path # Can't do anything if dir doesn't exist
            
        import re
        match = re.match(r"(\d+)_", basename)
        if match:
            prefix = match.group(1)
            try:
                for f in os.listdir(dirname):
                    if f.startswith(prefix):
                        found_path = os.path.join(dirname, f)
                        print(f"Resolving mangled path '{basename}' -> '{f}'")
                        return found_path
            except Exception as e:
                print(f"Path resolution error: {e}")
        
        return in_path

    resolved_path = resolve_file_path(audio_path)
    if resolved_path != audio_path:
        audio_path = resolved_path
    if local_model_path:
        print(f"Found local model at: {local_model_path}")
        target_model = local_model_path
    else:
        print(f"Local model not found. Will try downloading {DEFAULT_MODEL_ID}...")
        local_model_path = PATH_1 
    
    # 1. Transcribe
    print(f"Loading WhisperX model: {target_model} on {device} ({compute_type})...")
    
    try:
        if local_model_path:
            download_root = os.path.dirname(local_model_path)
        else:
            # Default download root: Prod path
            download_root = os.path.join(BACKEND_DIR, "..", "..", "models", "whisperx")
            if not os.path.exists(os.path.join(BACKEND_DIR, "..", "..")): # If not in prod structure
                 download_root = os.path.join(BACKEND_DIR, "..", "models", "whisperx") 
        
        asr_options = {
            "initial_prompt": "这是一段包含标点符号的中文对话，请使用逗号和句号。",
        }
        
        # VAD Options: Tuned for Aggressive Silence Detection (Strict Thresholds)
        # Note: 'min_silence_duration_ms' is not supported by whisperx.load_model via kwargs
        # We tune thresholds instead.
        vad_options = {
            "vad_onset": 0.550,  # Slightly stricter than 0.5
            "vad_offset": 0.550  # Significantly stricter than 0.363 (cuts silence sooner)
        }
        
        model = whisperx.load_model(
            target_model, 
            device, 
            compute_type=compute_type,
            download_root=download_root,
            asr_options=asr_options,
            vad_options=vad_options 
        )
        
        print(f"Loading audio: {audio_path}")
        print(f"Loading audio: {audio_path}")
        # Use librosa for robust Unicode handling on Windows
        import librosa
        audio, _ = librosa.load(audio_path, sr=16000, mono=True)
        audio = audio.astype("float32") # WhisperX expects float32
        print(f"Audio loaded via librosa. Shape: {audio.shape}")
        
        print("Transcribing with VAD filtering...")

        result = model.transcribe(
            audio, 
            batch_size=batch_size, 
            language="zh", 
            task="transcribe"
        )
        
        print(f"Transcription complete. Detected language: {result['language']}")
        
        # 2. Align (Visual Timestamp Correction)
        print("Loading Alignment Model...")
        
        # Define local alignment model path
        # Model ID: jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn
        local_align_dir = os.path.join(BACKEND_DIR, "..", "models", "alignment") # Dev
        prod_align_dir = os.path.join(BACKEND_DIR, "..", "..", "models", "alignment") # Prod
        
        if os.path.exists(prod_align_dir):
            local_align_dir = prod_align_dir
        align_model_name = None # Let WhisperX pick default if not found
        
        if os.path.exists(local_align_dir):
            if os.path.exists(os.path.join(local_align_dir, "config.json")):
                 align_model_name = local_align_dir
                 print(f"Found local alignment model at: {local_align_dir}")
            else:
                # Check for subfolder if user dragged the folder in
                subdirs = [d for d in os.listdir(local_align_dir) if os.path.isdir(os.path.join(local_align_dir, d))]
                if subdirs:
                    possible_path = os.path.join(local_align_dir, subdirs[0])
                    if os.path.exists(os.path.join(possible_path, "config.json")):
                        align_model_name = possible_path
                        print(f"Found local alignment model at: {possible_path}")
                
        if not align_model_name:
             print(f"Local alignment model not found (checked {local_align_dir} and subdirs). Downloading from HF Hub...")
        
        load_args = {"language_code": result["language"], "device": device}
        if align_model_name and result["language"] == "zh":
             load_args["model_name"] = align_model_name

        model_a, metadata = whisperx.load_align_model(**load_args)
        
        print("Aligning segments...")
        aligned_result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=True)
        
        # --- DEBUG: Save Raw Output (User Request) ---
        try:
            import json
            base_name = os.path.splitext(audio_path)[0]
            
            # 1. Save JSON (Full Detail)
            json_path = base_name + "_debug_raw.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(aligned_result["segments"], f, ensure_ascii=False, indent=2)
            print(f"Debug: Saved raw JSON to {json_path}")
            
            # 2. Save SRT (Raw Segments)
            srt_path = base_name + "_debug_raw.srt"
            def fmt_time(t):
                hours = int(t // 3600)
                minutes = int((t % 3600) // 60)
                seconds = int(t % 60)
                milliseconds = int((t % 1) * 1000)
                return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

            with open(srt_path, "w", encoding="utf-8") as f:
                for i, seg in enumerate(aligned_result["segments"]):
                    start = fmt_time(seg["start"])
                    end = fmt_time(seg["end"])
                    text = seg["text"].strip()
                    f.write(f"{i+1}\n{start} --> {end}\n{text}\n\n")
            print(f"Debug: Saved raw SRT to {srt_path}")
            
        except Exception as e:
            print(f"Warning: Failed to save debug files: {e}")
        # ---------------------------------------------
        
        # Cleanup
        del model_a
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()

        print("Splitting long segments into subtitles...")
        # Use existing logic helper
        final_segments = split_into_subtitles(aligned_result["segments"], max_chars=30)
        
        # --- DEBUG: Save Final Output (Corrected) ---
        try:
            final_json_path = base_name + "_debug_final.json"
            with open(final_json_path, "w", encoding="utf-8") as f:
                json.dump(final_segments, f, ensure_ascii=False, indent=2)
            print(f"Debug: Saved FINAL JSON to {final_json_path}")
        except Exception as e:
            print(f"Warning: Failed to save final debug info: {e}")
        # --------------------------------------------
        
        print(f"WhisperX processing complete. {len(final_segments)} segments.")
        return final_segments

    except Exception as e:
        print(f"Error during WhisperX ASR: {e}")
        traceback.print_exc()
        return []