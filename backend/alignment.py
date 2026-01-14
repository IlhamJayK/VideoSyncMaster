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

def merge_audios_to_video(video_path, audio_segments, output_path):
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
