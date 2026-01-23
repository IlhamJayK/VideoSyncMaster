
import sys
import subprocess
import os
import importlib.metadata

def get_installed_version(package_name):
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return None

def check_transformers_version(required_version):
    """
    Check if the installed transformers version matches the required version.
    Returns True if match, False otherwise.
    """
    current_version = get_installed_version("transformers")
    print(f"[DependencyManager] Checking transformers: Current={current_version}, Required={required_version}")
    return current_version == required_version

def install_package(package_spec):
    """
    Install a package using pip.
    """
    print(f"[DependencyManager] Installing {package_spec}...")
    # Add a special flag for frontend to detect and show notification
    print(f"[DEPS_INSTALLING] {package_spec}", flush=True)
    try:
        # Use the current python executable
        cmd = [sys.executable, "-m", "pip", "install", package_spec, "--no-cache-dir"]
        
        # We want to capture output to show progress if possible, or at least log it
        # Using check_call will stream to stdout/stderr which main.py captures
        subprocess.check_call(cmd)
        print(f"[DependencyManager] Successfully installed {package_spec}")
        print(f"[DEPS_DONE] {package_spec}", flush=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[DependencyManager] Failed to install {package_spec}: {e}")
        return False

def ensure_transformers_version(target_version):
    """
    Ensure the specific version of transformers is installed.
    If not, uninstall current and install target.
    """
    if check_transformers_version(target_version):
        return True
    
    print(f"[DependencyManager] Switching transformers to version {target_version}...")
    
    # Optional: Uninstall first to be safe, though pip install usually handles upgrades/downgrades
    # But for "coexistence" switching, strictly uninstaling might be cleaner to avoid debris
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "uninstall", "transformers", "-y"])
    except Exception:
        pass # Ignore if not installed or fails
    
    success = install_package(f"transformers=={target_version}")
    if success:
        # Verify
        # importlib.metadata.distribution("transformers") # Force refresh might be needed or process restart
        # In Python, once distribution metadata is loaded, it might be cached.
        # But since we are doing this BEFORE importing transformers in main.py, it should be fine.
        return True
    return False

def check_gpu_deps():
    """
    Check if accelerate is installed (needed for Qwen3)
    """
    if not get_installed_version("accelerate"):
        print("[DependencyManager] accelerate not found. Installing...")
        install_package("accelerate>=1.12.0")

