import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

class LLMTranslator:
    def __init__(self, model_dir=None):
        if model_dir is None:
            # Path Logic
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
            # Candidates
            # 1. Dev: ../models/Qwen2.5-7B-Instruct
            path_dev = os.path.join(base_dir, "..", "models", "Qwen2.5-7B-Instruct")
            # 2. Prod: ../../models/Qwen2.5-7B-Instruct (resources/backend -> resources -> root)
            path_prod = os.path.join(base_dir, "..", "..", "models", "Qwen2.5-7B-Instruct")
            
            if os.path.exists(path_prod):
                self.model_dir = path_prod
            else:
                self.model_dir = path_dev
        else:
            self.model_dir = model_dir

        print(f"Initializing LLM from {self.model_dir}...")
        
        # Initialize tokenizer first (independent of model quantization)
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir, trust_remote_code=True)
        except Exception as e:
            print(f"Failed to load tokenizer: {e}")
            self.model = None
            return

        # Try to load model with 4-bit quantization
        try:
            try:
                import bitsandbytes
                print(f"bitsandbytes version: {bitsandbytes.__version__}")
            except ImportError:
                print("bitsandbytes not found")

            from transformers import BitsAndBytesConfig
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4"
            )
            
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_dir, 
                device_map="auto", 
                trust_remote_code=True,
                quantization_config=quantization_config
            )
            print("LLM Initialized successfully (4-bit).")
        except Exception as e:
            print(f"Failed to load LLM (4-bit attempt): {e}")
            # Fallback to fp16
            try:
                 print("Retrying with fp16...")
                 self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_dir,
                    device_map="auto",
                    trust_remote_code=True,
                    torch_dtype=torch.float16
                )
            except Exception as e2:
                print(f"Failed to load LLM: {e2}")
                self.model = None

    def translate(self, text, target_lang="English"):
        if not self.model:
            return None
        
        # Improved prompt to ensure target language compliance
        messages = [
            {"role": "system", "content": f"You are a high-level translator. Translate the given text into {target_lang}. Output ONLY the translated text. Do not output the original text. Do not explain."},
            {"role": "user", "content": text}
        ]
        
        text_input = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        model_inputs = self.tokenizer([text_input], return_tensors="pt").to(self.model.device)
        
        generated_ids = self.model.generate(
            model_inputs.input_ids,
            max_new_tokens=512,
            do_sample=True,       # Enable sampling so retries vary
            temperature=0.3,      # Low temperature for high quality but not fixed
            top_p=0.9,
            repetition_penalty=1.1
        )
        
        generated_ids = [
            output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
        ]
        
        response = self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return response.strip()

    def cleanup(self):
        """
        Release model and tokenizer from memory.
        """
        print("Cleaning up LLM from VRAM...", flush=True)
        if hasattr(self, 'model'):
            del self.model
        if hasattr(self, 'tokenizer'):
            del self.tokenizer
        
        import gc
        gc.collect()
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("LLM cleanup complete.", flush=True)
