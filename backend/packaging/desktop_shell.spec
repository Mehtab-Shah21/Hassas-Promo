# PyInstaller spec for the native desktop shell -- the actual clickable app
# (Desktop/Start Menu shortcut launches this, NOT the backend). See
# desktop_shell.py's module docstring for what it does in each install role.
#
# Build (from backend/):
#   python -m PyInstaller packaging\desktop_shell.spec --distpath dist --workpath build

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None
backend_dir = Path(SPECPATH)  # noqa: F821  (PyInstaller injects SPECPATH)

a = Analysis(
    [str(backend_dir / "desktop_shell.py")],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[
        (str(backend_dir.parent / "frontend_dist"), "frontend_dist"),
    ],
    hiddenimports=collect_submodules("webview"),
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="ProInvoicing",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # a real desktop app -- no console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(backend_dir / "app_icon.ico"),
)
