import sys
import os
import torch
import soundfile as sf
import traceback
import json

_model = None
_model_spec = None # tuple (model_type, model_size)

def get_model(model_type='base', model_size='1.7B'):
    """
    model_type: 'base', 'design', 'custom'
    model_size: '1.7B' or '0.6B'
    """
    global _model, _model_spec
    
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(project_root, "models")
    
    size_str = model_size # e.g. "1.7B" or "0.6B"
    
    suffix_map = {
        'base': 'Base',
        'design': 'VoiceDesign',
        'custom': 'CustomVoice'
    }
    suffix = suffix_map.get(model_type, 'Base')
    
    repo_name = f"Qwen3-TTS-12Hz-{size_str}-{suffix}"
    target_repo = os.path.join(models_dir, repo_name)
    
    if not os.path.exists(target_repo):
         # Fallback to HF
         hf_repos = {
            'base': f"Qwen/Qwen3-TTS-12Hz-{size_str}-Base",
            'design': f"Qwen/Qwen3-TTS-12Hz-{size_str}-VoiceDesign",
            'custom': f"Qwen/Qwen3-TTS-12Hz-{size_str}-CustomVoice"
        }
         target_repo = hf_repos.get(model_type, hf_repos['base'])
    
    current_spec = (model_type, model_size)
    if _model is not None and _model_spec == current_spec:
        return _model
    
    print(f"[QwenTTS] Loading model: {target_repo}...")
    
    # [FIX] Use local Qwen3-TTS implementation to avoid transformers/offline issues
    # Add backend/Qwen3-TTS to sys.path to ensure we can import qwen_tts
    qwen_lib_path = os.path.join(os.path.dirname(__file__), "Qwen3-TTS")
    if qwen_lib_path not in sys.path:
        sys.path.append(qwen_lib_path)
        
    try:
        from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel
    except ImportError as e:
        print(f"[QwenTTS] Critical Error: could not import 'qwen_tts' from {qwen_lib_path}")
        raise e
    
    # Unload previous to save VRAM
    if _model is not None:
        del _model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    try:
        # Use Qwen3TTSModel.from_pretrained which registers the configs/models automatically
        _model = Qwen3TTSModel.from_pretrained(
            target_repo,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="sdpa",
            local_files_only=True
        )
        _model_spec = current_spec
        print(f"[QwenTTS] Loaded {model_type} successfully.")
        return _model
    except Exception as e:
        print(f"[QwenTTS] Error loading {model_type}: {e}")
        traceback.print_exc()
        raise e

def run_qwen_tts(text, ref_audio_path, output_path, language="English", **kwargs):
    """
    Single generation entry point.
    """
    try:
        qwen_mode = kwargs.get('qwen_mode', 'clone')
        voice_instruct = kwargs.get('voice_instruct', '')
        model_size = kwargs.get('qwen_model_size', '1.7B') 
        
        if qwen_mode == 'design' and voice_instruct:
            print(f"[QwenTTS] Mode: Voice Design ({voice_instruct}) - Size: {model_size}")
            design_model = get_model('design', model_size)
            
            print(f"[QwenTTS] Designing voice ref...")
            ref_design_text = "Hello, this is the voice you designed." 
            if language == "Chinese":
                ref_design_text = "你好，这是你设计的那个声音。"
            
            ref_wavs, sr = design_model.generate_voice_design(
                text=ref_design_text,
                language=language, 
                instruct=voice_instruct
            )
            
            temp_design_path = output_path + ".design_ref.wav"
            sf.write(temp_design_path, ref_wavs[0], sr)
            print(f"[QwenTTS] Design ref saved to {temp_design_path}")
            
            wavs, sr__ = design_model.generate_voice_design(
                text=text,
                language=language,
                instruct=voice_instruct
            )
            sf.write(output_path, wavs[0], sr__)
            return True

        elif qwen_mode == 'preset':
            preset_voice = kwargs.get('preset_voice', 'Vivian')
            print(f"[QwenTTS] Mode: Preset Voice ({preset_voice}) - Size: {model_size}")
            custom_model = get_model('custom', model_size)
            wavs, sr = custom_model.generate_custom_voice(
                text=text,
                language=language,
                speaker=preset_voice
            )
            sf.write(output_path, wavs[0], sr)
            return True

        else:
            # Clone Mode (Default)
            print(f"[QwenTTS] Mode: Clone (Ref: {os.path.basename(ref_audio_path) if ref_audio_path else 'None'}) - Size: {model_size}")
            base_model = get_model('base', model_size)
            
            if not ref_audio_path or not os.path.exists(ref_audio_path):
                 print("[QwenTTS] Error: Ref audio required for Clone mode.")
                 return False

            qwen_ref_text = kwargs.get('qwen_ref_text', '')
            use_x_vector = not bool(qwen_ref_text)
            print(f"[QwenTTS] Mode: Clone (Ref: {os.path.basename(ref_audio_path)}) - X-Vector: {use_x_vector}")
            
            prompt = base_model.create_voice_clone_prompt(
                ref_audio=ref_audio_path,
                ref_text=qwen_ref_text, 
                x_vector_only_mode=use_x_vector
            )
            
            wavs, sr = base_model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=prompt
            )

            sf.write(output_path, wavs[0], sr)
            return True

    except Exception as e:
        print(f"[QwenTTS] Error: {e}")
        traceback.print_exc()
        return False

def run_batch_qwen_tts(tasks, language="English", **kwargs):
    """
    Batch generation with concurrency control.
    """
    results = []
    qwen_mode = kwargs.get('qwen_mode', 'clone')
    voice_instruct = kwargs.get('voice_instruct', '')
    model_size = kwargs.get('qwen_model_size', '1.7B')
    batch_size = kwargs.get('batch_size', 1)
    
    try:
        if qwen_mode == 'design' and voice_instruct:
             model = get_model('design', model_size)
             print(f"[QwenTTS] Batch Design ({len(tasks)} items, Batch Size: {batch_size})...")
             
             for i in range(0, len(tasks), batch_size):
                 chunk = tasks[i : i + batch_size]
                 texts = [t['text'] for t in chunk]
                 instructs = [voice_instruct] * len(chunk)
                 langs = [language] * len(chunk)
                 
                 wavs, sr = model.generate_voice_design(
                     text=texts,
                     language=langs,
                     instruct=instructs
                 )
                 
                 for j, w in enumerate(wavs):
                     out = chunk[j]['output_path']
                     sf.write(out, w, sr)
                     results.append({"success": True, "output": out})
                     print(f"[PROGRESS] {int((i + j + 1) / len(tasks) * 100)}", flush=True)

        elif qwen_mode == 'preset':
             preset_voice = kwargs.get('preset_voice', 'Vivian')
             model = get_model('custom', model_size)
             print(f"[QwenTTS] Batch Preset ({len(tasks)} items, Speaker: {preset_voice}, Batch Size: {batch_size})...")
             
             for i in range(0, len(tasks), batch_size):
                 chunk = tasks[i : i + batch_size]
                 texts = [t['text'] for t in chunk]
                 speakers = [preset_voice] * len(chunk)
                 langs = [language] * len(chunk)
                 
                 wavs, sr = model.generate_custom_voice(
                     text=texts,
                     language=langs,
                     speaker=speakers
                 )
                 
                 for j, w in enumerate(wavs):
                     out = chunk[j]['output_path']
                     sf.write(out, w, sr)
                     results.append({"success": True, "output": out})
                     print(f"[PROGRESS] {int((i + j + 1) / len(tasks) * 100)}", flush=True)
                 
        else:
             # Clone Mode
             model = get_model('base', model_size)
             print(f"[QwenTTS] Batch Clone ({len(tasks)} items, Batch Size: {batch_size})...")
             
             qwen_ref_text = kwargs.get('qwen_ref_text', '')
             use_x_vector = not bool(qwen_ref_text)
             
             for i in range(0, len(tasks), batch_size):
                 chunk = tasks[i : i + batch_size]
                 
                 chunk_prompts = []
                 chunk_texts = []
                 chunk_langs = []
                 
                 for t in chunk:
                     p = model.create_voice_clone_prompt(
                        ref_audio=t['ref_audio_path'],
                        ref_text=qwen_ref_text,
                        x_vector_only_mode=use_x_vector
                     )
                     chunk_prompts.append(p[0])
                     chunk_texts.append(t['text'])
                     chunk_langs.append(language)
                 
                 wavs, sr = model.generate_voice_clone(
                     text=chunk_texts,
                     language=chunk_langs,
                     voice_clone_prompt=chunk_prompts
                 )
                 
                 for j, w in enumerate(wavs):
                     out = chunk[j]['output_path']
                     sf.write(out, w, sr)
                     results.append({"success": True, "output": out})
                     print(f"[PROGRESS] {int((i + j + 1) / len(tasks) * 100)}", flush=True)

    except Exception as e:
        print(f"[QwenTTS] Batch Error: {e}")
        traceback.print_exc()
        # Ensure results list matches tasks length for caller if partially failed
        if len(results) < len(tasks):
            for _ in range(len(tasks) - len(results)):
                results.append({"success": False, "error": str(e)})

    finally:
        # Explicit VRAM Cleanup
        global _model
        if _model is not None:
             print("[QwenTTS] Unloading model to free VRAM...")
             del _model
             _model = None
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            print("[QwenTTS] VRAM cleared.")

    return results
