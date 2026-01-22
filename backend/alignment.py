import ffmpeg
import os
import numpy as np
import soundfile as sf
import librosa
import tempfile

def get_audio_duration(file_path):
    try:
        probe = ffmpeg.probe(file_path)
        audio_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'audio'), None)
        if audio_stream:
            return float(audio_stream['duration'])
        # Fallback to format duration if stream duration missing
        return float(probe['format']['duration'])
    except Exception as e:
        print(f"Error probing audio: {e}")
        return None

def align_audio(input_path, output_path, target_duration_sec):
    """
    Time-stretch audio to match target duration using ffmpeg atempo.
    :param input_path: Source audio file.
    :param output_path: Destination audio file.
    :param target_duration_sec: Desired duration in seconds.
    :return: True if successful, False otherwise.
    """
    current_duration = get_audio_duration(input_path)
    if current_duration is None:
        print("Could not determine input audio duration.")
        return False

    if target_duration_sec <= 0:
        print("Target duration must be positive.")
        return False

    speed_factor = current_duration / target_duration_sec
    print(f"Aligning: {current_duration:.2f}s -> {target_duration_sec:.2f}s (Speed Factor: {speed_factor:.2f}x)")

    # ffmpeg 'atempo' filter is limited to [0.5, 2.0].
    # We need to chain filters for values outside this range.
    tempo_filters = []
    remaining_factor = speed_factor

    while remaining_factor > 2.0:
        tempo_filters.append(2.0)
        remaining_factor /= 2.0
    while remaining_factor < 0.5:
        tempo_filters.append(0.5)
        remaining_factor /= 0.5
    
    # Append the last necessary factor (now guaranteed to be within [0.5, 2.0] unless it was 1.0)
    if abs(remaining_factor - 1.0) > 0.01: # Only if not effectively 1.0
        tempo_filters.append(remaining_factor)

    try:
        stream = ffmpeg.input(input_path)
        
        # Chain filters
        for t in tempo_filters:
            stream = stream.filter('atempo', t)
            
        stream = ffmpeg.output(stream, output_path)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
        print(f"Aligned audio saved to {output_path}")
        return True
    except ffmpeg.Error as e:
        print(f"FFmpeg Error: {e.stderr.decode() if e.stderr else str(e)}")
        return False

def merge_audios_to_video(video_path, audio_segments, output_path, strategy='auto_speedup'):
    """
    Merge multiple audio segments into a final video using Numpy for mixing.
    This avoids the 'Argument list too long' (WinError 206) issue with ffmpeg complex filters.
    
    :param video_path: Path to original video.
    :param audio_segments: List of dicts {'start': float, 'path': str}
    :param output_path: Path to save final video.
    """
    temp_mixed_path = None
    try:
        if not audio_segments:
            print("No audio segments provided.")
            return False

        if strategy and strategy != 'auto_speedup':
            return merge_video_advanced(video_path, audio_segments, output_path, strategy)


        # 1. Get video duration to initialize the audio buffer
        try:
            probe = ffmpeg.probe(video_path)
            video_duration = float(probe['format']['duration'])
        except Exception as e:
            print(f"Error probing video duration: {e}")
            return False
            
        target_sr = 44100
        # Calculate total samples needed (add a bit of buffer if needed, but video_duration should be exact)
        total_samples = int(video_duration * target_sr) + 1
        
        # Initialize stereo buffer (change to 1 if mono desired, but stereo is safer)
        # Using float32 for mixing to avoid clipping issues before final normalization/clipping
        mixed_audio = np.zeros((total_samples, 2), dtype=np.float32)

        print(f"[Mixer] Initialized buffer: {video_duration:.2f}s ({total_samples} samples)", flush=True)

        # 2. Mix audio segments
        for i, seg in enumerate(audio_segments):
            start_time = seg['start']
            file_path = seg['path']
            
            # Start index
            start_idx = int(start_time * target_sr)
            print(f"[Mixer] Processing segment {i}: {file_path} (Start: {start_time}s)", flush=True)
            
            if start_idx >= total_samples:
                print(f"[Mixer] Warning: Segment {i} starts after video ends. Skipping.")
                continue

            try:
                # Load audio with librosa (handles resampling to target_sr automatically)
                # librosa loads as (channels, samples) or (samples,) if mono=True. 
                # We force mono=False to handle stereo sources, or handle shape manually.
                # Actually sf.read or librosa.load? librosa.load is good for resampling.
                # librosa.load returns (y, sr). y is shape (n,) or (2, n) -> No, librosa usually mixes to mono unless mono=False
                y, _ = librosa.load(file_path, sr=target_sr, mono=False)
                
                # Check shape. If mono (N,), reshape to (1, N)
                if y.ndim == 1:
                    y = y.reshape(1, -1)
                
                # Ensure stereo for mixing: shape (2, N)
                if y.shape[0] == 1:
                    y = np.repeat(y, 2, axis=0)
                elif y.shape[0] > 2:
                    y = y[:2, :] # Take first 2 channels
                
                # Transpose to (N, 2) to match our buffer
                y = y.T 
                
                # Apply volume boost (1.2x) as per original logic
                y = y * 1.2
                
                # Length to add
                seg_samples = y.shape[0]
                
                # Calculate end index considering boundary
                end_idx = start_idx + seg_samples
                if end_idx > total_samples:
                    # Clip segment if it extends beyond video
                    y = y[:total_samples - start_idx]
                    end_idx = total_samples
                
                # Add to buffer
                mixed_audio[start_idx:end_idx] += y
                
            except Exception as e:
                print(f"[Mixer] Error processing segment {file_path}: {e}")
                continue

        # 3. Save mixed audio to a temp file
        # Normalize if necessary? standard logic often clips. 
        # Let's simple clip to [-1.0, 1.0] to avoid distortion if multiple oversaturate, 
        # though 1.2x on single track is usually fine.
        max_val = np.max(np.abs(mixed_audio))
        if max_val > 1.0:
            print(f"[Mixer] Audio amplitude {max_val:.2f} > 1.0, normalizing.")
            mixed_audio = mixed_audio / max_val
        
        # Create temp file
        fd, temp_mixed_path = tempfile.mkstemp(suffix='.wav')
        os.close(fd)
        
        sf.write(temp_mixed_path, mixed_audio, target_sr)
        print(f"[Mixer] Saved temporary merged audio to {temp_mixed_path}")
        
        print("[PROGRESS] 50", flush=True)

        # 4. Mux with original video using FFMPEG
        input_video = ffmpeg.input(video_path)
        input_audio = ffmpeg.input(temp_mixed_path)
        
        # Use video stream from original, audio from temp
        v = input_video['v']
        a = input_audio['a']
        
        # -c:v copy (fast), -c:a aac
        stream = ffmpeg.output(v, a, output_path, vcodec='copy', acodec='aac', shortest=None)
        
        ffmpeg.run(stream, overwrite_output=True, quiet=False)
        print("[PROGRESS] 100", flush=True)
        print(f"Final video saved to {output_path}", flush=True)
        
        return True
        
    except Exception as e:
        print(f"Error merging video: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Cleanup temp file
        if temp_mixed_path and os.path.exists(temp_mixed_path):
            try:
                os.remove(temp_mixed_path)
            except:
                pass

def get_rife_executable():
    """Locate rife-ncnn-vulkan executable."""
    # Logic: Search in ../models/rife
    # APP_ROOT logic from main.py is harder to access here without passing it.
    # But usually models are in ../models relative to backend (in dev) or ../../models (in prod).
    # Let's try likely paths.
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Check strict Project/models/rife
    # Need to traverse up to find 'models'
    # Start with assumption of standard structure
    candidates = [
        os.path.join(current_dir, "..", "models", "rife"), # Dev: backend/../models
        os.path.join(current_dir, "..", "..", "models", "rife"), # Prod: resources/backend/../../models
        os.path.join(current_dir, "models", "rife")
    ]
    
    rife_exe = None
    rife_model_path = None
    
    for root in candidates:
        if os.path.exists(root):
            # DFS for exe
            for dirpath, dirnames, filenames in os.walk(root):
                for f in filenames:
                    if f.lower() == 'rife-ncnn-vulkan.exe':
                        rife_exe = os.path.join(dirpath, f)
                        # Look for model
                        # Usually in same dir
                        if os.path.exists(os.path.join(dirpath, 'rife-v4.6')):
                             rife_model_path = 'rife-v4.6'
                        break
                if rife_exe: break
        if rife_exe: break
        
    return rife_exe, rife_model_path

def apply_rife_interpolation(input_path, output_path, target_duration):
    """
    Use RIFE to interpolate video to at least target_duration (conceptually).
    Actually RIFE doubles frames. We run it enough times so that 
    len(frames) / original_fps >= target_duration.
    """
    rife_exe, rife_model = get_rife_executable()
    if not rife_exe:
        print("[RIFE] Executable not found. Please download RIFE in Model Manager.")
        return False
        
    # Get info
    try:
        probe = ffmpeg.probe(input_path)
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        orig_duration = float(probe['format']['duration'])
        # If duration is tiny, use video stream duration tag?
        if orig_duration < 0.01 and video_stream:
             orig_duration = float(video_stream.get('duration', 0.1))
    except:
        orig_duration = 0.1
        
    if orig_duration <= 0: orig_duration = 0.1
    
    raw_factor = target_duration / orig_duration
    
    # Calculate how many 2x passes needed
    # 2^n >= raw_factor
    import math
    if raw_factor <= 1.0:
        # No interpolation needed for length, just copy?
        # But maybe we want smoothness? 
        # If strategy is RIFE, user likely wants smoothness even if strictly fitting.
        # But 'merge_video_advanced' only calls this if we need to slow down (duration extension).
        pass_count = 0
    else:
        pass_count = math.ceil(math.log2(raw_factor))
        
    if pass_count < 1: pass_count = 1 # At least one pass if invoked
    
    print(f"[RIFE] Interpolating {input_path} ({orig_duration:.2f}s) to ~{target_duration:.2f}s. Factor={raw_factor:.2f}. Passes={pass_count}")
    
    current_in = input_path
    
    import shutil
    import subprocess
    
    work_dir = os.path.dirname(output_path)
    
    success = True
    
    for i in range(pass_count):
        temp_out = os.path.join(work_dir, f"rife_pass_{i}.mp4")
        
        cmd = [rife_exe, '-i', current_in, '-o', temp_out]
        if rife_model:
            cmd.extend(['-m', rife_model])
            
        print(f"  [RIFE] Pass {i+1}/{pass_count}: Running...")
        # print(cmd)
        
        try:
            # Hide output logic?
            # subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            subprocess.run(cmd, check=True)
            
            if i > 0 and current_in != input_path:
                try: os.remove(current_in)
                except: pass
                
            current_in = temp_out
        except Exception as e:
            print(f"  [RIFE] Failed at pass {i}: {e}")
            success = False
            break
            
    if success:
        # Now current_in has 2^n * frames.
        # We assume 2^n >= raw_factor
        # So effective 'content duration' if played at original speed is >= target_duration
        # We rename to output, but we might need to finalize it?
        # merge_video_advanced expects a video chunk.
        # It will apply setpts later?
        # merge_video_advanced logic: 
        # if scale_factor > 1.05: apply setpts.
        # format: setpts=FACTOR*PTS
        # If we return a RIFE'd video, its PTS are likely reset or just doubled density.
        # If RIFE doubles frames and keeps duration constant (doubles FPS):
        #   Duration: 2s. Frames 60 (was 30).
        #   We want to fill 5s.
        #   We need to play these 60 frames over 5s? No.
        #   Wait, pass_count ensuring we have *enough frames* for smooth 30fps at 5s.
        #   2s @ 30fps = 60 frames.
        #   Target 5s @ 30fps = 150 frames.
        #   Pass 1: 120 frames. (Not enough for 150).
        #   Pass 2: 240 frames. (Enough).
        #   So if we have 240 frames. We want to play them over 5s.
        #   FPS = 240 / 5 = 48 fps. 
        #   If we force output to 30fps (via -r 30 in final merge), we drop frames. 48->30.
        #   This is fine.
        #   BUT: The *timestamps* in current_in are likely for "2s" (high fps).
        #   So ffmpeg sees it as 2s video.
        #   merge_video_advanced calculates scale_factor = seg_audio_dur (target) / slot_dur (input).
        #   If we replace input with RIFE output, the duration is still ~2s.
        #   So merge_video_advanced will apply setpts=2.5*PTS.
        #   2s * 2.5 = 5s.
        #   Since we have 240 frames in that 2s (high density), stretching 2.5x -> 5s.
        #   Result: 240 frames over 5s. 48 fps.
        #   This works perfect.
        
        if os.path.exists(output_path):
            try: os.remove(output_path)
            except: pass
        os.rename(current_in, output_path)
        return True
    else:
        return False

def merge_video_advanced(video_path, audio_segments, output_path, strategy):
    """
    Advanced video merging with frame rate conversion/blending.
    Reconstructs video timeline to match audio duration.
    """
    print(f"[AdvancedMerge] Starting with strategy: {strategy}")
    import subprocess
    import shutil
    
    # helper to clean paths
    clean_paths = []
    
    try:
        # Pre-process segments: sort by start
        sorted_segments = sorted(audio_segments, key=lambda x: x['start'])
        
        # We need to build a list of (video_chunk_path, audio_chunk_path)
        clips_list = [] 
        
        # We'll use a working dir for temp chunks
        work_dir = os.path.dirname(output_path)
        chunk_dir = os.path.join(work_dir, "temp_chunks")
        if os.path.exists(chunk_dir):
            shutil.rmtree(chunk_dir)
        os.makedirs(chunk_dir, exist_ok=True)
        
        cursor = 0.0
        
        for i, seg in enumerate(sorted_segments):
            seg_start = float(seg['start'])
            seg_audio_path = seg['path']
            # Assume main.py now passes 'duration' (original slot duration)
            slot_dur = float(seg.get('duration', 0))
            
            # 1. Handle Gap (if any)
            if seg_start > cursor:
                gap_dur = seg_start - cursor
                if gap_dur > 0.05: # Ignore tiny gaps
                    print(f"  [Gap] {cursor:.2f}s -> {seg_start:.2f}s ({gap_dur:.2f}s)")
                    v_chunk = os.path.join(chunk_dir, f"gap_{i}.mp4")
                    
                    try:
                        input_v = ffmpeg.input(video_path, ss=cursor, t=gap_dur)['v']
                        input_a = ffmpeg.input(f"anullsrc=channel_layout=stereo:sample_rate=44100", f='lavfi', t=gap_dur)
                        
                        (
                            ffmpeg
                            .output(input_v, input_a, v_chunk, vcodec='libx264', acodec='aac', ac=2, ar=44100, **{'b:v': '4M'}, preset='fast', shortest=None)
                            .run(overwrite_output=True, quiet=True)
                        )
                        clips_list.append(v_chunk)
                    except ffmpeg.Error as e:
                        print(f"Gap generation error: {e.stderr.decode() if e.stderr else str(e)}")
            
            # 2. Handle Segment
            seg_audio_dur = get_audio_duration(seg_audio_path) or 0.1
            
            # Determine processing
            if slot_dur <= 0.05:
                # If slot is practically zero/missing, assume insert mode or error.
                # Use audio duration as slot.
                slot_dur = 0.1
            
            scale_factor = seg_audio_dur / slot_dur if slot_dur > 0 else 1.0
            
            print(f"  [Seg {i}] Slot: {slot_dur:.2f}s, Audio: {seg_audio_dur:.2f}s, Factor: {scale_factor:.2f}x")
            
            v_chunk_seg = os.path.join(chunk_dir, f"seg_{i}.mp4")
            
            # FFMPEG Command Construction
            # We construct filter chain manually
            
            stream_v = ffmpeg.input(video_path, ss=seg_start, t=slot_dur)['v']
            stream_a = ffmpeg.input(seg_audio_path)
            
            # Prepare Video Filter
            # Structure: (filter_name, [args], {kwargs})
            v_filters = []
            
            if scale_factor > 1.05 and strategy != 'auto_speedup':
                if strategy == 'frame_blend':
                    # Slow down video: setpts=FACTOR*PTS
                    v_filters.append(('setpts', [f"{scale_factor}*PTS"], {}))
                    # Frame blending: minterpolate=mi_mode=blend
                    v_filters.append(('minterpolate', [], {'mi_mode': 'blend'}))
                elif strategy == 'freeze_frame':
                    # Freeze frame: tpad
                    pad_dur = seg_audio_dur - slot_dur
                    if pad_dur > 0:
                        v_filters.append(('tpad', [], {'stop_mode': 'clone', 'stop_duration': str(pad_dur)}))
                elif strategy == 'rife':
                     # RIFE Interpolation
                     # 1. Extract raw chunk
                     raw_chunk = os.path.join(chunk_dir, f"rife_in_{i}.mp4")
                     rife_out = os.path.join(chunk_dir, f"rife_out_{i}.mp4")
                     
                     rife_success = False
                     try:
                         # Extract without audio
                         (
                            ffmpeg
                            .input(video_path, ss=seg_start, t=slot_dur)
                            .output(raw_chunk, vcodec='libx264', preset='fast', an=None)
                            .run(overwrite_output=True, quiet=True)
                         )
                         
                         if apply_rife_interpolation(raw_chunk, rife_out, seg_audio_dur):
                             rife_success = True
                             # Switch input stream to RIFE output
                             stream_v = ffmpeg.input(rife_out)['v']
                             
                             # Clean up input chunk early
                             try: os.remove(raw_chunk)
                             except: pass
                     except Exception as e:
                         print(f"  [Seg {i}] RIFE prep failed: {e}")
                     
                     # Apply slow motion (SetPTS)
                     # Steps: RIFE added frames. SetPTS stretches time.
                     v_filters.append(('setpts', [f"{scale_factor}*PTS"], {}))
            
            else:
                 if abs(scale_factor - 1.0) > 0.02:
                     v_filters.append(('setpts', [f"{scale_factor}*PTS"], {}))

            # Apply filters
            output_args = {
                'vcodec': 'libx264', 
                'acodec': 'aac', 
                'ac': 2,
                'ar': 44100,
                'b:v': '4M', 
                'preset': 'fast',
                'shortest': None
            }
            
            # Apply filter chain
            out_stream = stream_v
            if v_filters:
                for fname, fargs, fkwargs in v_filters:
                    out_stream = out_stream.filter(fname, *fargs, **fkwargs)

            # Map streams: Processed Video + New Audio
            try:
                (
                    ffmpeg
                    .output(out_stream, stream_a, v_chunk_seg, **output_args)
                    .run(overwrite_output=True, quiet=True)
                )
                clips_list.append(v_chunk_seg)
            except ffmpeg.Error as e:
                 print(f"Seg generation error {i}: {e.stderr.decode() if e.stderr else str(e)}")
                 # Fallback?
            
            # Update cursor
            cursor = seg_start + slot_dur
            
        # 3. Handle Tail
        probe = ffmpeg.probe(video_path)
        total_duration = float(probe['format']['duration'])
        
        if cursor < total_duration - 0.1:
            tail_dur = total_duration - cursor
            print(f"  [Tail] {cursor:.2f}s -> {total_duration:.2f}s")
            v_chunk = os.path.join(chunk_dir, "tail.mp4")
            try:
                input_v = ffmpeg.input(video_path, ss=cursor, t=tail_dur)['v']
                input_a = ffmpeg.input(f"anullsrc=channel_layout=stereo:sample_rate=44100", f='lavfi', t=tail_dur)
                (
                    ffmpeg
                    .output(input_v, input_a, v_chunk, vcodec='libx264', acodec='aac', ac=2, ar=44100, **{'b:v': '4M'}, preset='fast', shortest=None)
                    .run(overwrite_output=True, quiet=True)
                )
                clips_list.append(v_chunk)
            except Exception as e:
                print(f"Tail error: {e}")

        # 4. Concat all
        if not clips_list:
            print("No clips generated.")
            return False
            
        print(f"Concatenating {len(clips_list)} clips...")
        
        concat_list_path = os.path.join(chunk_dir, "concat.txt")
        with open(concat_list_path, 'w', encoding='utf-8') as f:
            for clip in clips_list:
                # FFMPEG concat requires safe paths
                safe_path = clip.replace('\\', '/')
                f.write(f"file '{safe_path}'\n")
        
        try:
            (
                ffmpeg
                .input(concat_list_path, format='concat', safe=0)
                .output(output_path, c='copy')
                .run(overwrite_output=True, quiet=True)
            )
            print(f"Advanced merge complete: {output_path}")
        except ffmpeg.Error as e:
            print(f"Concat error: {e.stderr.decode() if e.stderr else str(e)}")
            return False
            
        # Cleanup
        try:
            shutil.rmtree(chunk_dir)
        except: 
            pass
            
    except Exception as e:
        print(f"Advanced merge failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    return True

