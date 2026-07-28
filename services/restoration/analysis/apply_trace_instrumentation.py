#!/usr/bin/env python3
"""Apply OPS-77 branch-level tracing to _apply_lama in app.py"""
import sys

with open('services/restoration/app.py', 'r') as f:
    content = f.read()

old = '''def _apply_lama(image: Image.Image, denoise: float, model: Optional[object] = None) -> Image.Image:
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
    logger.warning("LaMa using PIL fallback")'''

new = '''def _apply_lama(image: Image.Image, denoise: float, model: Optional[object] = None) -> Image.Image:
    logger.info('TRACE01 entered _apply_lama')
    
    if model is not None:
        logger.info('TRACE02 model is not None')
        logger.info(f'TRACE02b model type={type(model).__name__}')
        if hasattr(model, '__dir__'):
            attrs = [x for x in dir(model) if not x.startswith('_')][:10]
            logger.info(f'TRACE02c model attrs={attrs}')
        
        try:
            import torch
            import numpy as np
            from PIL import Image as PILImage
            logger.info('TRACE03 imports done')
            
            mask = _generate_damage_mask(image)
            logger.info('TRACE04 mask generated')
            
            try:
                mask_path = f"/tmp/lama_mask_{int(time.time())}.png"
                mask.save(mask_path)
                logger.info(f"LaMa mask saved to {mask_path}")
            except Exception:
                pass
            
            # Tensor pipeline logging
            logger.info('TRACE05 building tensors')
            img_array = np.array(image.convert("RGB"), dtype=np.float32) / 255.0
            mask_array = np.array(mask.convert("L"), dtype=np.float32) / 255.0
            
            img_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).to(MODEL_DEVICE)
            mask_tensor = torch.from_numpy(mask_array).unsqueeze(0).unsqueeze(0).to(MODEL_DEVICE)
            logger.info(f'TRACE05b tensors ready: img={img_tensor.shape} mask={mask_tensor.shape}')
            
            if MODEL_DEVICE == "cuda":
                img_tensor = img_tensor.half()
                mask_tensor = mask_tensor.half()
                logger.info('TRACE05c fp16 on cuda')
            
            logger.info(f'TRACE05d model device={MODEL_DEVICE}')
            
            with torch.no_grad():
                logger.info('TRACE06 calling model()')
                try:
                    output = model(img_tensor, mask_tensor)
                    logger.info(f'TRACE07 model() returned, type={type(output).__name__}')
                except Exception as infer_err:
                    logger.error(f'TRACE07_EXCEPTION: {infer_err}')
                    import traceback
                    logger.error(f'TRACE07_TRACEBACK: {traceback.format_exc()}')
                    result = image
                    logger.info('TRACE08 returning original due to exception')
                    return result
                
                if isinstance(output, torch.Tensor):
                    logger.info(f'TRACE07c Tensor shape={output.shape} dtype={output.dtype} '
                                f'min={output.min().item():.4f} max={output.max().item():.4f}')
                    output_cpu = output.detach().cpu().float()
                    input_cpu = img_tensor.detach().cpu().float()
                    diff = (output_cpu - input_cpu).abs()
                    changed_px = int((diff > 0.01).sum().item())
                    total_px = diff.numel()
                    logger.info(f'TRACE07d pixel change: {changed_px}/{total_px} '
                                f'({changed_px/total_px*100:.2f}%)')
                elif isinstance(output, dict):
                    logger.info(f'TRACE07c dict keys={list(output.keys())}')
                    for k in output:
                        v = output[k]
                        if hasattr(v, 'shape'):
                            logger.info(f'  key={k} type={type(v).__name__} shape={v.shape}')
                    extracted = output.get("result", output.get("inpaint", output))
                    logger.info(f'TRACE07e extracted type={type(extracted).__name__}')
                    if isinstance(extracted, torch.Tensor):
                        logger.info(f'  Tensor shape={extracted.shape}')
                    output = extracted
                elif isinstance(output, (list, tuple)):
                    logger.info(f'TRACE07c list/tuple len={len(output)}')
                    for i, v in enumerate(output[:3]):
                        if hasattr(v, 'shape'):
                            logger.info(f'  [{i}] type={type(v).__name__} shape={v.shape}')
                    output = output[0] if len(output) > 0 else img_tensor
                else:
                    logger.warning(f'TRACE07c UNSUPPORTED type={type(output).__name__}')
                    result = image
                    logger.info('TRACE08 returning original')
                    return result
                
                if isinstance(output, torch.Tensor):
                    logger.info('TRACE08 converting tensor to PIL')
                    output = output.squeeze(0).cpu().float().clamp(0, 1)
                    output_np = output.permute(1, 2, 0).numpy()
                    result = PILImage.fromarray((output_np * 255).astype(np.uint8))
                    logger.info(f'TRACE09 PIL created: size={result.size}')
                else:
                    logger.warning(f'TRACE08 NOT_TENSOR: {type(output).__name__}')
                    result = image
            
            logger.info('TRACE10 returning model output')
            return result
        except Exception as e:
            logger.error(f'TRACE_EXCEPTION_ROOT: {e}')
            import traceback
            logger.error(f'TRACE_EXCEPTION_TRACEBACK: {traceback.format_exc()}')
    
    logger.warning('TRACE_FALLBACK using PIL fallback')
    working = image.convert("RGBA") if image.mode not in ("RGBA", "L") else image
    denoise = _clamp(denoise, 0.0, 1.0)
    
    if denoise > 0:
        working = working.filter(ImageFilter.MedianFilter(size=3))
        if denoise > 0.5:
            working = working.filter(ImageFilter.SMOOTH_MORE)
    
    inpainted = working.filter(ImageFilter.MinFilter(size=3))
    inpainted = inpainted.filter(ImageFilter.MaxFilter(size=3))
    inpainted = inpainted.filter(ImageFilter.MedianFilter(size=3))
    
    return inpainted'''

if old in content:
    content = content.replace(old, new)
    with open('services/restoration/app.py', 'w') as f:
        f.write(content)
    print('TRACE instrumentation applied successfully.')
else:
    print('ERROR: Could not find old function. Checking...')
    idx = content.find('def _apply_lama')
    if idx >= 0:
        print(f'Function found at byte {idx}')
        print('First 200 bytes of function:')
        print(repr(content[idx:idx+200]))
        # Try more lenient matching
        match_start = content.find('def _apply_lama', idx)
        match_end = content.find('logger.warning("LaMa using PIL fallback")', match_start)
        if match_end >= 0:
            match_end += len('logger.warning("LaMa using PIL fallback")')
            print(f'Found up to byte {match_end}')
            print('Match length:', match_end - match_start)
    else:
        print('Function signature NOT FOUND')
        # Show last few chars to see if file was truncated
        print('File ends with:', repr(content[-100:]))
