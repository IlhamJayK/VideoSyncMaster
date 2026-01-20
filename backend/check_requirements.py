import sys
import os
import re

# Try to use importlib.metadata (Python 3.8+)
try:
    from importlib.metadata import distributions, version, PackageNotFoundError
except ImportError:
    # Fallback usually not needed for Py3.10+ but good for safety
    import pkg_resources

def normalize_name(name):
    """Normalize package name: lower case and replace _ with -"""
    return re.sub(r"[-_.]+", "-", name).lower()

def check_requirements(requirements_path):
    required = set()
    
    # 1. Parse requirements.txt
    with open(requirements_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Check for environment markers (simple partial implementation for speed)
            if ';' in line:
                try:
                    # Using pkg_resources to parse markers safely if available
                    req_obj = pkg_resources.Requirement.parse(line)
                    if not req_obj.marker.evaluate():
                        continue
                    pkg_name = req_obj.name
                except:
                    # Fallback simple string check if pkg_resources fails or not imported
                    parts = line.split(';')
                    marker = parts[1].strip()
                    # Very basic check for sys_platform
                    if "sys_platform == 'linux'" in marker and sys.platform != 'linux':
                        continue
                    if "sys_platform != 'linux'" in marker and sys.platform == 'linux':
                        continue
                    
                    # Extract name from first part
                    match = re.match(r"^([a-zA-Z0-9\-_]+)", parts[0].strip())
                    if match:
                        pkg_name = match.group(1)
                    else:
                        continue
            else:
                match = re.match(r"^([a-zA-Z0-9\-_]+)", line)
                if match:
                    pkg_name = match.group(1)
                else:
                    continue
            
            required.add(normalize_name(pkg_name))

    # 2. Get installed packages
    try:
        # Debug info
        # print(f"[Debug] Python Executable: {sys.executable}")
        
        if 'distributions' in globals():
            installed_dists = list(distributions())
            installed = {normalize_name(dist.metadata["Name"]) for dist in installed_dists}
            # Debug: print what we found if whisperx is missing
            # if "whisperx" not in installed:
            #     print(f"[Debug] Installed packages ({len(installed)}): {sorted(list(installed))}")
        else:
             # Fallback
            installed = {normalize_name(pkg.key) for pkg in pkg_resources.working_set}
            
    except Exception as e:
        print(f"[Check] 下载包失败: {e}")
        return False

    # 3. Compare
    missing = []
    for pkg in required:
        if pkg not in installed:
            missing.append(pkg)

    if missing:
        print(f"[Info] 发现缺失的包: {', '.join(missing)}")
        return False
    
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)

    req_path = sys.argv[1]
    if check_requirements(req_path):
        print("[Info] 所有依赖齐全.")
        sys.exit(0)
    else:
        print("[Info] 发现缺失的包，正在安装...")
        sys.exit(1)
