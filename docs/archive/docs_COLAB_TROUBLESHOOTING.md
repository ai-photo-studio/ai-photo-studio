# Colab Troubleshooting

Use this when the Colab validation flow fails.

## Python 3.12 issues

Symptoms:

- `rembg` import fails immediately
- `numpy` or `scipy` import fails
- `numba` complains about compiled wheels
- `open_clip` or `realesrgan` installs but does not import cleanly

Recovery:

```python
!python --version
!nvidia-smi
!python -m pip install --upgrade pip setuptools wheel
!python -m pip install --upgrade -r requirements-validation.txt
!bash scripts/colab-preflight.sh
```

## NumPy / SciPy issues

Symptoms:

- `numpy` imports but `scipy` does not
- `scipy` fails with ABI or binary compatibility errors
- `rembg` fails during import because `pymatting` pulls in the broken wheel mix

Recovery:

```python
!python -m pip uninstall -y numpy scipy numba pymatting
!python -m pip install --no-cache-dir numpy==1.26.4 scipy==1.13.1 numba==0.60.0 pymatting==1.1.13
!bash scripts/colab-preflight.sh
```

## rembg import failures

Symptoms:

- `from rembg import remove` fails
- `pymatting` stack trace appears
- The error happens before any image is processed

Recovery:

```python
!python -m pip install --no-cache-dir rembg==2.0.61 onnxruntime==1.18.1
!python -c "from rembg import remove; print('rembg ok')"
```

## GPU fallback

If GPU checks fail:

1. Reconnect to Colab.
2. Switch runtime to GPU again.
3. Run `!nvidia-smi`.
4. If the GPU is still missing, restart the notebook session.

## Full recovery sequence

```python
!bash colab_setup.sh cleanup
!python -m pip install --upgrade pip setuptools wheel
!python -m pip install --upgrade -r requirements-validation.txt
!bash scripts/colab-preflight.sh
!bash colab_setup.sh validate
```

## When to stop

If the pinned stack still fails after a clean reinstall, move to an isolated Python 3.11 validation environment and keep the production repo unchanged.
