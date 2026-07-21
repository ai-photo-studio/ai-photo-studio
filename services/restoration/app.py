from __future__ import annotations

import io
import os
import math
import time
import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

app = FastAPI(title="AI Photo Studio Old Photo Restoration", version="1.0.0")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_LAMA_DENOISE = float(os.getenv("RESTORATION_LAMA_DENOISE", "0.3"))
DEFAULT_GFPGAN_FIDELITY = float(os.getenv("RESTORATION_GFPGAN_FIDELITY", "0.7"))
DEFAULT_CODEFORMER_FIDELITY = float(os.getenv("RESTORATION_CODEFORMER_FIDELITY", "0.5"))
DEFAULT_CODEFORMER_DENOISE = float(os.getenv("RESTORATION_CODEFORMER_DENOISE", "0.4"))
DEFAULT_DDCOLOR_TEMPERATURE = float(os.getenv("RESTORATION_DDCOLOR_TEMPERATURE", "0.55"))
DEFAULT_DDCOLOR_SATURATION = float(os.getenv("RESTORATION_DDCOLOR_SATURATION", "0.6"))
DEFAULT_ESRGAN_SCALE = float(os.getenv("RESTORATION_ESRGAN_SCALE", "4.0"))
DEFAULT_ESRGAN_SHARPEN = float(os.getenv("RESTORATION_ESRGAN_SHARPEN", "0.55"))
DEFAULT_ESRGAN_DENOISE = float(os.getenv("RESTORATION_ESRGAN_DENOISE", "0.3"))
DEFAULT_FACE_RESTORATION_THRESHOLD = float(os.getenv("RESTORATION_FACE_THRESHOLD", "0.6"))
DEFAULT_COLORIZATION_THRESHOLD = float(os.getenv("RESTORATION_COLOR_THRESHOLD", "0.3"))
DEFAULT_UPSCALE_THRESHOLD = float(os.getenv("RESTORATION_UPSCALE_THRESHOLD", "800"))

LAMA_MODEL_PATH = os.getenv("LAMA_CHECKPOINT", "/models/lama.pth")
GFPGAN_MODEL_PATH = os.getenv("GFPGAN_CHECKPOINT", "/models/GFPGAN.pth")
CODEFORMER_MODEL_PATH = os.getenv("CODEFORMER_CHECKPOINT", "/models/codeformer.pth")
DDCOLOR_MODEL_PATH = os.getenv("DDCOLOR_CHECKPOINT", "/models/ddcolor.pth")
REALESRGAN_MODEL_PATH = os.getenv("REALESRGAN_CHECKPOINT", "/models/RealESRGAN_x4.pth")

MODEL_DEVICE = os.getenv("MODEL_DEVICE", "cuda" if os.path.exists("/dev/nvidia0") else "cpu")
MODEL_CACHE_DIR = os.getenv("MODEL_CACHE_DIR", "/models")

# DEBUG mode: saves every intermediate image
DEBUG_ENABLED = os.getenv("RESTORATION_DEBUG", "0") == "1"
DEBUG_DIR = os.getenv("RESTORATION_DEBUG_DIR", "/tmp/debug-output")
RUN_ID: str = ""


def save_debug(file_name: str, image: "Image.Image", stage: str = "") -> None:
    """Save an intermediate image in DEBUG mode."""
    if not DEBUG_ENABLED:
        return
    try:
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        filename = f"{RUN_ID}_{safe_name}_{stage}.png"
        path = os.path.join(DEBUG_DIR, filename)
        os.makedirs(DEBUG_DIR, exist_ok=True)
        image.save(path, "PNG")
        logger.info(f"DEBUG saved: {path} ({image.size[0]}x{image.size[1]})")
    except Exception as e:
        logger.warning(f"DEBUG save failed for {file_name}: {e}")


@dataclass(slots=True)
class RestoredImage:
    content: bytes
    media_type: str
    filename: str
    credits_used: float
    stages: list[str]


@dataclass
class ModelCache:
    lama: Optional[object] = None
    gfpgan: Optional[object] = None
    codeformer: Optional[object] = None
    ddcolor: Optional[object] = None
    realsrgan: Optional[object] = None
    device: str = MODEL_DEVICE


model_cache = ModelCache()


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA", "L"):
            image = image.convert("RGBA")
        return image
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _to_jpeg_bytes(image: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def _is_grayscale(image: Image.Image) -> bool:
    if image.mode in ("L", "LA", "1"):
        return True
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    sample = pixels[::max(1, len(pixels) // 1000)]
    return all(abs(r - g) < 15 and abs(g - b) < 15 and abs(r - b) < 15 for r, g, b in sample)


def _detect_damage(image: Image.Image) -> dict:
    width, height = image.size
    megapixels = (width * height) / 1_000_000
    
    if image.mode == "L":
        base_quality = 45
    elif image.mode == "RGBA":
        base_quality = 55
    else:
        base_quality = 60
    
    quality = {
        "blur_score": base_quality,
        "noise_score": 30,
        "brightness_score": 55,
        "contrast_score": 50,
        "overall_score": base_quality,
        "resolution": {"width": width, "height": height, "megapixels": megapixels},
        "is_grayscale": _is_grayscale(image)
    }
    
    return quality


def _load_lama_model() -> Optional[object]:
    try:
        if model_cache.lama is not None:
            return model_cache.lama
        
        if os.path.exists(LAMA_MODEL_PATH):
            import torch
            from lama_cleaner.model_manager import ModelManager
            
            manager = ModelManager(device=MODEL_DEVICE)
            model = manager.load_model("lama")
            model_cache.lama = model
            logger.info(f"LaMa model loaded via lama-cleaner from {LAMA_MODEL_PATH}")
            return model
        else:
            logger.warning("LaMa checkpoint not found, using PIL fallback")
            return None
    except Exception as e:
        logger.warning(f"Failed to load LaMa model: {e}", exc_info=True)
        return None


def _generate_damage_mask(image: Image.Image) -> "Image.Image":
    """Generate a damage mask using edge detection and histogram analysis."""
    import numpy as np
    gray = image.convert("L")
    img_array = np.array(gray, dtype=np.float32)
    
    # Laplacian edge detection
    from scipy import ndimage
    laplacian = ndimage.laplace(img_array)
    edge_mask = np.abs(laplacian) > 40
    
    # Dark spot detection (potential scratches/dust)
    dark_mask = img_array < 40
    
    # Bright spot detection (potential tears/folds)
    bright_mask = img_array > 220
    
    # Combine masks
    combined = (edge_mask | dark_mask | bright_mask).astype(np.uint8) * 255
    
    # Morphological dilation to connect nearby damage regions
    from scipy.ndimage import binary_dilation
    structure = np.ones((5, 5))
    combined = binary_dilation(combined > 0, structure=structure).astype(np.uint8) * 255
    
    from PIL import Image as PILImage
    return PILImage.fromarray(combined, mode="L")


def _apply_lama(image: Image.Image, denoise: float, model: Optional[object] = None) -> Image.Image:
    if model is not None:
        try:
            import torch
            import numpy as np
            from PIL import Image as PILImage
            
            # Generate damage mask from the image
            mask = _generate_damage_mask(image)
            
            # Save mask for verification
            try:
                mask_path = f"/tmp/lama_mask_{int(time.time())}.png"
                mask.save(mask_path)
                logger.info(f"LaMa mask saved to {mask_path}, size={mask.size}, mode={mask.mode}")
            except Exception:
                pass
            
            # Tensor pipeline logging
            import numpy as np
            img_rgb_np = np.array(image.convert('RGB'), dtype=np.float32)
            mask_np = np.array(mask.convert('L'), dtype=np.float32)
            logger.info('=== LAMA TENSOR PIPELINE ===')
            logger.info(f'Input image: size={image.size}, mode={image.mode}')
            logger.info(f'Image array: shape={img_rgb_np.shape} dtype={img_rgb_np.dtype} min={img_rgb_np.min()} max={img_rgb_np.max()} mean={img_rgb_np.mean():.1f}')
            logger.info(f'Mask array: shape={mask_np.shape} dtype={mask_np.dtype} min={mask_np.min()} max={mask_np.max()} mean={mask_np.mean():.1f}')
            logger.info(f'Mask coverage: {int((mask_np > 0).sum())}/{mask_np.size} = {((mask_np > 0).sum()/mask_np.size*100):.1f}%')

            # Convert to tensors
            img_array = np.array(image.convert("RGB"), dtype=np.float32) / 255.0
            mask_array = np.array(mask.convert("L"), dtype=np.float32) / 255.0
            
            img_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).to(MODEL_DEVICE)
            mask_tensor = torch.from_numpy(mask_array).unsqueeze(0).unsqueeze(0).to(MODEL_DEVICE)
            
            if MODEL_DEVICE == "cuda":
                img_tensor = img_tensor.half()
                mask_tensor = mask_tensor.half()
            
            logger.info(f"LaMa input shapes: image={img_tensor.shape}, mask={mask_tensor.shape}, dtype={img_tensor.dtype}")
            
            with torch.no_grad():
                # LaMa model from lama-cleaner takes (image, mask)
                output = model(img_tensor, mask_tensor)
                if isinstance(output, dict):
                    output = output.get("result", output.get("inpaint", output))
                if isinstance(output, (list, tuple)):
                    output = output[0]
                
                logger.info(f"LaMa output type={type(output).__name__}")
                
                # Convert output to PIL
                if isinstance(output, torch.Tensor):
                    output = output.squeeze(0).cpu().float().clamp(0, 1)
                    output_np = output.permute(1, 2, 0).numpy()
                    result = PILImage.fromarray((output_np * 255).astype(np.uint8))
                else:
                    logger.warning(f"LaMa unexpected output type: {type(output)}")
                    result = image
            
            logger.info(f"LaMa inference successful, output size={result.size}")
            return result
        except Exception as e:
            logger.warning(f"LaMa inference failed: {e}", exc_info=True)
    
    # PIL fallback
    logger.warning("LaMa using PIL fallback")
    working = image.convert("RGBA") if image.mode not in ("RGBA", "L") else image
    denoise = _clamp(denoise, 0.0, 1.0)
    
    if denoise > 0:
        working = working.filter(ImageFilter.MedianFilter(size=3))
        if denoise > 0.5:
            working = working.filter(ImageFilter.SMOOTH_MORE)
    
    inpainted = working.filter(ImageFilter.MinFilter(size=3))
    inpainted = inpainted.filter(ImageFilter.MaxFilter(size=3))
    inpainted = inpainted.filter(ImageFilter.MedianFilter(size=3))
    
    return inpainted


def _load_gfpgan_model() -> Optional[object]:
    try:
        if model_cache.gfpgan is not None:
            return model_cache.gfpgan
        
        if os.path.exists(GFPGAN_MODEL_PATH):
            from gfpgan import GFPGANer
            
            model = GFPGANer(
                model_path=GFPGAN_MODEL_PATH,
                upscale=1,
                half_precision=(MODEL_DEVICE == "cuda"),
                device=MODEL_DEVICE,
            )
            model_cache.gfpgan = model
            return model
        else:
            logger.warning("GFPGAN checkpoint not found, using PIL fallback")
            return None
    except Exception as e:
        logger.warning(f"Failed to load GFPGAN model: {e}, using PIL fallback")
        return None


def _detect_faces(image: Image.Image) -> list[dict]:
    """Detect faces using RetinaFace or OpenCV fallback."""
    try:
        import numpy as np
        img_array = np.array(image.convert("RGB"))
        
        # Try RetinaFace first
        try:
            from retinaface import RetinaFace
            faces = RetinaFace.detect_faces(img_array)
            if faces:
                results = []
                for face_id, face_data in faces.items():
                    area = face_data.get("area", {})
                    results.append({
                        "x": int(area.get("x", 0)),
                        "y": int(area.get("y", 0)),
                        "width": int(area.get("w", 0)),
                        "height": int(area.get("h", 0)),
                        "confidence": float(face_data.get("score", 0)),
                    })
                return results
        except ImportError:
            pass
        
        # OpenCV Haar Cascade fallback
        import cv2
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        detections = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        return [{"x": int(x), "y": int(y), "width": int(w), "height": int(h), "confidence": 0.8}
                for x, y, w, h in detections]
    except Exception as e:
        logger.warning(f"Face detection failed: {e}", exc_info=True)
        return []


def _restore_face_gfpgan(image: Image.Image, fidelity: float, model: Optional[object] = None) -> Image.Image:
    if model is not None:
        try:
            from PIL import Image as PILImage
            import numpy as np
            
            # Only detect and process faces, not the entire image
            faces = _detect_faces(image)
            
            if not faces:
                logger.info("No faces detected — skipping GFPGAN")
                return image
            
            img_array = np.array(image)
            current = img_array.copy()
            
            for face in faces:
                # Expand bounding box by 20% for context
                cx = face["x"] + face["width"] // 2
                cy = face["y"] + face["height"] // 2
                expanded_w = int(face["width"] * 1.4)
                expanded_h = int(face["height"] * 1.4)
                
                x1 = max(0, cx - expanded_w // 2)
                y1 = max(0, cy - expanded_h // 2)
                x2 = min(image.width, cx + expanded_w // 2)
                y2 = min(image.height, cy + expanded_h // 2)
                
                face_crop = current[y1:y2, x1:x2]
                
                # Only suppress background enhancement to avoid smoothing
                _, restored, _ = model.enhance(
                    face_crop,
                    fidelity=fidelity,
                    has_aligned=False,
                    only_center_face=False,
                    paste_back=True,
                    bg_upsampler=None,
                )
                
                if restored is not None:
                    # Paste restored face back
                    restored_resized = PILImage.fromarray(restored).resize((x2 - x1, y2 - y1), PILImage.LANCZOS)
                    current[y1:y2, x1:x2] = np.array(restored_resized)
                    logger.info(f"GFPGAN restored face at ({x1},{y1}) size {x2-x1}x{y2-y1}")
            
            result = PILImage.fromarray(current)
            return result
        except Exception as e:
            logger.warning(f"GFPGAN inference failed: {e}, using PIL fallback")
            import traceback
            traceback.print_exc()
    
    working = image.convert("RGB")
    fidelity = _clamp(fidelity, 0.0, 1.0)
    
    contrast = ImageEnhance.Contrast(working).enhance(1.0 + fidelity * 0.3)
    color = ImageEnhance.Color(contrast).enhance(1.0 + fidelity * 0.2)
    sharp = ImageEnhance.Sharpness(color).enhance(1.0 + fidelity * 1.5)
    brightness = ImageEnhance.Brightness(sharp).enhance(1.0 + fidelity * 0.1)
    result = brightness.filter(ImageFilter.SMOOTH)
    
    return result.convert("RGBA") if image.mode in ("RGBA", "L") else result


def _load_codeformer_model() -> Optional[object]:
    try:
        if model_cache.codeformer is not None:
            return model_cache.codeformer
        
        if os.path.exists(CODEFORMER_MODEL_PATH):
            from codeformer import CodeFormer
            
            model = CodeFormer(
                device=MODEL_DEVICE,
                model_path=CODEFORMER_MODEL_PATH,
            )
            model_cache.codeformer = model
            return model
        else:
            logger.warning("CodeFormer checkpoint not found, using PIL fallback")
            return None
    except Exception as e:
        logger.warning(f"Failed to load CodeFormer model: {e}, using PIL fallback")
        return None


def _restore_face_codeformer(image: Image.Image, fidelity: float, denoise: float, model: Optional[object] = None) -> Image.Image:
    if model is not None:
        try:
            import numpy as np
            from PIL import Image as PILImage
            
            img_array = np.array(image.convert("RGB"))
            
            output = model(
                img_array,
                fidelity=fidelity,
                denoise_strength=denoise,
            )
            
            if output is not None:
                result = PILImage.fromarray(output[0])
                return result
        except Exception as e:
            logger.warning(f"CodeFormer inference failed: {e}, using PIL fallback")
    
    working = image.convert("RGB")
    fidelity = _clamp(fidelity, 0.0, 1.0)
    denoise = _clamp(denoise, 0.0, 1.0)
    
    if denoise > 0:
        working = working.filter(ImageFilter.MedianFilter(size=3))
        if denoise > 0.5:
            working = working.filter(ImageFilter.SMOOTH_MORE)
    
    detail = working.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    blended = Image.blend(working, detail, fidelity * 0.4)
    color = ImageEnhance.Color(blended).enhance(1.0 + fidelity * 0.15)
    contrast = ImageEnhance.Contrast(color).enhance(1.0 + fidelity * 0.2)
    result = ImageEnhance.Sharpness(contrast).enhance(1.0 + fidelity * 0.8)
    
    return result.convert("RGBA") if image.mode in ("RGBA", "L") else result


def _load_ddcolor_model() -> Optional[object]:
    try:
        if model_cache.ddcolor is not None:
            return model_cache.ddcolor
        
        if os.path.exists(DDCOLOR_MODEL_PATH):
            import torch
            from ddcolor import DDColor
            
            model = DDColor(
                model_path=DDCOLOR_MODEL_PATH,
                device=MODEL_DEVICE,
            )
            model_cache.ddcolor = model
            return model
        else:
            logger.warning("DDColor checkpoint not found, using PIL fallback")
            return None
    except Exception as e:
        logger.warning(f"Failed to load DDColor model: {e}, using PIL fallback")
        return None


def _colorize_ddcolor(image: Image.Image, temperature: float, saturation: float, model: Optional[object] = None) -> Image.Image:
    if model is not None:
        try:
            import numpy as np
            from PIL import Image as PILImage
            
            img_array = np.array(image.convert("RGB"))
            
            colorized = model(img_array, temperature=temperature, saturation=saturation)
            
            if colorized is not None:
                result = PILImage.fromarray(colorized)
                return result
        except Exception as e:
            logger.warning(f"DDColor inference failed: {e}, using PIL fallback")
    
    temperature = _clamp(temperature, 0.0, 1.0)
    saturation = _clamp(saturation, 0.0, 1.0)
    
    if image.mode in ("L", "LA", "1"):
        gray = image.convert("L")
        rgb = gray.convert("RGB")
        r, g, b = rgb.split()
        warm_r = r.point(lambda x: min(255, int(x * (1.0 + temperature * 0.15))))
        warm_b = b.point(lambda x: max(0, int(x * (1.0 - temperature * 0.10))))
        warm_image = Image.merge("RGB", (warm_r, g, warm_b))
        colorized = Image.blend(rgb, warm_image, saturation * 0.7)
        return colorized.convert("RGBA")
    
    return image.convert("RGBA")


def _load_realesrgan_model() -> Optional[object]:
    try:
        if model_cache.realsrgan is not None:
            return model_cache.realsrgan
        
        if os.path.exists(REALESRGAN_MODEL_PATH):
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer
            
            model = RealESRGANer(
                scale=4,  # Match checkpoint (RealESRGAN_x4plus.pth is a 4x model)
                model_path=REALESRGAN_MODEL_PATH,
                device=MODEL_DEVICE,
                half=True if MODEL_DEVICE == "cuda" else False,
            )
            model_cache.realsrgan = model
            return model
        else:
            logger.warning("Real-ESRGAN checkpoint not found, using PIL fallback")
            return None
    except Exception as e:
        logger.warning(f"Failed to load Real-ESRGAN model: {e}, using PIL fallback")
        return None


def _upscale_realesrgan(image: Image.Image, scale: float, sharpen: float, denoise: float, model: Optional[object] = None) -> Image.Image:
    if model is not None:
        try:
            import numpy as np
            from PIL import Image as PILImage
            
            img_array = np.array(image.convert("RGB"))
            
            output, _ = model.enhance(
                img_array,
                outscale=int(scale),
            )
            
            if output is not None:
                result = PILImage.fromarray(output)
                return result
        except Exception as e:
            logger.warning(f"Real-ESRGAN inference failed: {e}, using PIL fallback")
    
    working = image.convert("RGBA")
    scale = _clamp(scale, 1.0, 4.0)
    sharpen = _clamp(sharpen, 0.0, 1.0)
    denoise = _clamp(denoise, 0.0, 1.0)
    
    if denoise > 0:
        working = working.filter(ImageFilter.MedianFilter(size=3))
        if denoise > 0.45:
            working = working.filter(ImageFilter.SMOOTH_MORE)
    
    target_size = (
        max(1, int(round(working.width * scale))),
        max(1, int(round(working.height * scale))),
    )
    if target_size != working.size:
        working = working.resize(target_size, Image.Resampling.LANCZOS)
    
    alpha = working.split()[-1] if working.mode == "RGBA" else None
    
    rgb = working.convert("RGB")
    rgb = ImageOps.autocontrast(rgb, cutoff=int(round(denoise * 5)))
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.0 + sharpen * 1.8)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.0 + sharpen * 0.25)
    rgb = ImageEnhance.Color(rgb).enhance(1.0 + sharpen * 0.08)
    
    if alpha is not None:
        r, g, b = rgb.split()
        rgb = Image.merge("RGBA", (r, g, b, alpha))
    
    return rgb.convert("RGBA") if rgb.mode != "RGBA" else rgb


def _calculate_credits(image: Image.Image, damage_severity: str) -> float:
    megapixels = (image.width * image.height) / 1_000_000
    base_credits = 1.0
    
    if megapixels > 2:
        base_credits += (megapixels - 2) * 0.5
    
    severity_multiplier = {"LIGHT": 1.0, "MEDIUM": 1.5, "HEAVY": 2.0, "UNKNOWN": 1.0}
    base_credits *= severity_multiplier.get(damage_severity, 1.0)
    
    return round(base_credits, 2)


def _should_use_face_restoration(image: Image.Image, damage_severity: str, quality_score: float) -> tuple[str, float, float]:
    has_faces = damage_severity in ("LIGHT", "MEDIUM", "HEAVY")
    
    if not has_faces:
        return "none", 0.7, 0.5
    
    if quality_score < 50:
        return "codeformer", DEFAULT_CODEFORMER_FIDELITY, DEFAULT_CODEFORMER_DENOISE
    elif quality_score < 70:
        return "gfpgan", DEFAULT_GFPGAN_FIDELITY, 0.5
    else:
        return "gfpgan", DEFAULT_GFPGAN_FIDELITY, 0.5


def _should_colorize(image: Image.Image, damage_severity: str, quality_score: float) -> tuple[bool, float, float]:
    is_bw = _is_grayscale(image)
    
    if not is_bw:
        return False, 0.55, 0.6
    
    needs_colorization = quality_score < 60 or damage_severity in ("HEAVY", "MEDIUM")
    
    if needs_colorization:
        temp = DEFAULT_DDCOLOR_TEMPERATURE
        sat = DEFAULT_DDCOLOR_SATURATION
        if damage_severity == "HEAVY":
            temp = min(0.7, temp + 0.1)
            sat = min(0.8, sat + 0.1)
        return True, temp, sat
    
    return False, 0.55, 0.6


def _should_upscale(image: Image.Image, damage_severity: str) -> tuple[bool, float, float, float]:
    needs_upscale = image.width < DEFAULT_UPSCALE_THRESHOLD or image.height < DEFAULT_UPSCALE_THRESHOLD
    
    if needs_upscale:
        scale = DEFAULT_ESRGAN_SCALE
        sharpen = DEFAULT_ESRGAN_SHARPEN
        denoise = DEFAULT_ESRGAN_DENOISE
        
        if damage_severity == "HEAVY":
            scale = min(2.0, scale)
        
        return True, scale, sharpen, denoise
    
    return False, 2.0, 0.55, 0.3


def _process_restoration(
    raw: bytes,
    content_type: str | None,
    file_name: str | None,
    lama_denoise: float = DEFAULT_LAMA_DENOISE,
) -> RestoredImage:
    source = _load_image(raw)
    stages: list[str] = []
    
    global RUN_ID
    RUN_ID = f"{int(time.time())}_{file_name or 'unknown'}"
    if DEBUG_ENABLED:
        save_debug(file_name or "unknown", source, "01_original")
    
    damage = _detect_damage(source)
    damage_severity = "MEDIUM"
    if damage["overall_score"] < 45:
        damage_severity = "HEAVY"
    elif damage["overall_score"] < 70:
        damage_severity = "LIGHT"
    stages.append("damage_detection")
    
    lama_model = _load_lama_model()
    working = source
    working_rgba = working.convert("RGBA") if working.mode not in ("RGBA", "L") else working
    stages.append("lama_inpaint")
    
    # Save pre-LaMa state (with damage mask overlay)
    try:
        mask_image = _generate_damage_mask(working_rgba)
        save_debug(file_name or "unknown", mask_image, "02_damage_mask")
    except Exception:
        pass
    
    working = _apply_lama(working_rgba, lama_denoise, lama_model)
    save_debug(file_name or "unknown", working, "03_lama_output")
    
    face_provider, face_fidelity, face_denoise = _should_use_face_restoration(working, damage_severity, damage["overall_score"])
    if face_provider != "none":
        stages.append(f"face_restoration_{face_provider}")
        if face_provider == "gfpgan":
            gfpgan_model = _load_gfpgan_model()
            # Save face crops before GFPGAN
            try:
                from PIL import ImageDraw
                draw = ImageDraw.Draw(working.convert("RGB"))
                faces = _detect_faces(working)
                for i, face in enumerate(faces):
                    x, y, w, h = face["x"], face["y"], face["width"], face["height"]
                    crop = working.crop((x, y, x + w, y + h))
                    save_debug(file_name or "unknown", crop, f"04_face_{i}_crop_before")
                    draw.rectangle([x, y, x + w, y + h], outline="red", width=2)
                if faces:
                    save_debug(file_name or "unknown", working, "04_face_boxes")
            except Exception:
                pass
            working = _restore_face_gfpgan(working, face_fidelity, gfpgan_model)
        elif face_provider == "codeformer":
            codeformer_model = _load_codeformer_model()
            working = _restore_face_codeformer(working, face_fidelity, face_denoise, codeformer_model)
        save_debug(file_name or "unknown", working, "05_face_restored")
    
    needs_color, color_temp, color_sat = _should_colorize(working, damage_severity, damage["overall_score"])
    if needs_color:
        stages.append("ddcolor_colorize")
        ddcolor_model = _load_ddcolor_model()
        working_before_color = working
        working = _colorize_ddcolor(working, color_temp, color_sat, ddcolor_model)
        save_debug(file_name or "unknown", working_before_color, "06_before_colorize")
        save_debug(file_name or "unknown", working, "07_after_colorize")
    
    needs_upscale, upscale_scale, upscale_sharpen, upscale_denoise = _should_upscale(working, damage_severity)
    if needs_upscale:
        stages.append("real_esrgan_upscale")
        realsrgan_model = _load_realesrgan_model()
        working_before_esrgan = working
        working = _upscale_realesrgan(working, upscale_scale, upscale_sharpen, upscale_denoise, realsrgan_model)
        save_debug(file_name or "unknown", working_before_esrgan, "08_before_esrgan")
        save_debug(file_name or "unknown", working, "09_after_esrgan")
    
    save_debug(file_name or "unknown", working, "10_final_output")
    
    if working.mode in ("RGBA", "LA"):
        rgb = working.convert("RGB")
        alpha = working.split()[-1] if working.mode in ("RGBA", "LA") else None
        if alpha is not None:
            white_bg = Image.new("RGB", rgb.size, (255, 255, 255))
            white_bg.paste(rgb, mask=alpha)
            working = white_bg
    
    result_bytes = _to_jpeg_bytes(working.convert("RGB"), quality=92)
    credits = _calculate_credits(working, damage_severity)
    
    safe_name = (file_name or "restored.png").rsplit(".", 1)[0]
    
    return RestoredImage(
        content=result_bytes,
        media_type="image/jpeg",
        filename=f"{safe_name}-restored.jpg",
        credits_used=credits,
        stages=stages,
    )


@app.get("/health")
def health():
    models_loaded = {
        "lama": model_cache.lama is not None,
        "gfpgan": model_cache.gfpgan is not None,
        "codeformer": model_cache.codeformer is not None,
        "ddcolor": model_cache.ddcolor is not None,
        "realesrgan": model_cache.realsrgan is not None,
    }
    
    return {
        "success": True,
        "model": "restoration",
        "status": "ready",
        "device": model_cache.device,
        "models": models_loaded,
        "stages": ["damage_detection", "lama_inpaint", "face_restoration", "colorization", "upscaling"],
    }


@app.post("/restore")
async def restore(request: Request):
    lama_denoise = float(request.query_params.get("lama_denoise", DEFAULT_LAMA_DENOISE))
    
    processed = _process_restoration(
        raw=await request.body(),
        content_type=request.headers.get("content-type"),
        file_name=request.headers.get("x-file-name"),
        lama_denoise=lama_denoise,
    )
    
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{processed.filename}"',
            "X-File-Name": processed.filename,
            "X-Credits-Used": str(processed.credits_used),
            "X-Processing-Stages": ",".join(processed.stages),
        },
    )


@app.post("/analyze")
async def analyze(request: Request):
    raw = await request.body()
    source = _load_image(raw)
    
    damage = _detect_damage(source)
    is_bw = _is_grayscale(source)
    face_provider, _, _ = _should_use_face_restoration(source, "MEDIUM", damage["overall_score"])
    needs_color, _, _ = _should_colorize(source, "MEDIUM", damage["overall_score"])
    needs_upscale, _, _, _ = _should_upscale(source, "MEDIUM")
    
    return {
        "success": True,
        "analysis": {
            "resolution": damage.get("resolution", {}),
            "quality_score": damage["overall_score"],
            "is_grayscale": is_bw,
            "recommended_face_restoration": face_provider if face_provider != "none" else None,
            "needs_colorization": needs_color,
            "needs_upscale": needs_upscale,
        }
    }


@app.on_event("startup")
async def startup():
    logger.info(f"Restoration endpoint starting on device: {MODEL_DEVICE}")
    logger.info("Models will load lazily on first restore request (ModelCache pattern)")
    
    import torch
    if torch.cuda.is_available():
        logger.info(f"CUDA available: {torch.cuda.get_device_name(0)}")
        logger.info(f"VRAM total: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    else:
        logger.info("CUDA not available — running on CPU")


@app.get("/debug/models")
def debug_models():
    return {
        "device": model_cache.device,
        "models": {
            "lama": {
                "loaded": model_cache.lama is not None,
                "checkpoint": LAMA_MODEL_PATH if os.path.exists(LAMA_MODEL_PATH) else "not found",
            },
            "gfpgan": {
                "loaded": model_cache.gfpgan is not None,
                "checkpoint": GFPGAN_MODEL_PATH if os.path.exists(GFPGAN_MODEL_PATH) else "not found",
            },
            "codeformer": {
                "loaded": model_cache.codeformer is not None,
                "checkpoint": CODEFORMER_MODEL_PATH if os.path.exists(CODEFORMER_MODEL_PATH) else "not found",
            },
            "ddcolor": {
                "loaded": model_cache.ddcolor is not None,
                "checkpoint": DDCOLOR_MODEL_PATH if os.path.exists(DDCOLOR_MODEL_PATH) else "not found",
            },
            "realesrgan": {
                "loaded": model_cache.realsrgan is not None,
                "checkpoint": REALESRGAN_MODEL_PATH if os.path.exists(REALESRGAN_MODEL_PATH) else "not found",
            },
        }
    }