"""
Live-reload runner for the Windy City Exteriors siding sample.

Watches `siding_sample.py` and rebuilds the scene in the open Blender session
every time the file is saved, so the viewport follows the edits instead of
waiting for someone to re-run a background render.

    START   In Blender's Python Console:

                import sys
                sys.path.append("/Users/nikostathis/Documents/ChatGPT/Windy City Exteriors/assets/blender")
                import live_reload
                live_reload.start()

    STOP    In the same console, or in a new one after a restart:

                import bpy
                bpy.app.driver_namespace["wce_live"].stop()

The stop line works from any console in the session because `start()` parks the
module in the driver namespace. That matters: a watcher you cannot find again
is a watcher you have to quit Blender to be rid of.

There is also a Text Editor route — open this file, press Run Script, and it
starts itself — but the console route is the one to use, because it leaves you
holding the handle you need to stop it.

What it will not do:

  * It writes nothing. No .blend, no render, no export. The only thing that
    can put a file on disk is `snapshot()`, called by hand, and that writes
    outside the watched folder by construction (see OUTPUT_DIR below). A
    watcher that writes into the directory it watches rebuilds forever.
  * It will not rebuild while you are in Edit or Sculpt mode, and it will not
    start a rebuild while one is already running.
  * It will not throw you out of camera view. A rebuild deletes the old
    camera, which drops any viewport looking through it back to user
    perspective; the regions that were in camera view before are put back
    afterwards, and only those.
  * It will not die on a bad edit. A syntax error or an exception in the
    authoring script is reported in the viewport and on the console, and the
    watcher keeps running so that the next save can fix it.

The rebuild itself is synchronous — Blender has one thread for Python and the
UI, and pretending otherwise would be a lie. The sample takes well under a
second to build, so the freeze is a blink. The poll between rebuilds is an
os.stat, which is free.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import time
import traceback

import bpy
import blf


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _here() -> str:
    """This file's directory, whether it was imported or run from the editor."""
    if "__file__" in globals() and __file__:
        return os.path.dirname(os.path.abspath(__file__))
    # Run Script on an unsaved text block: fall back to the open text's path.
    for text in bpy.data.texts:
        if text.filepath and os.path.basename(text.filepath) == "live_reload.py":
            return os.path.dirname(os.path.abspath(bpy.path.abspath(text.filepath)))
    raise RuntimeError(
        "Cannot locate live_reload.py on disk. Import it from a path instead of "
        "pasting it into a text block."
    )


HERE = _here()
WATCH_DIR = HERE
WATCHED = os.path.join(HERE, "siding_sample.py")

# Anywhere that is not WATCH_DIR. `snapshot()` is the only writer, and the
# assertion below is what keeps a future edit from quietly pointing it back at
# the watched folder and starting a rebuild loop.
OUTPUT_DIR = os.path.abspath(os.path.join(HERE, os.pardir, os.pardir, "build", "blender-live"))

POLL_SECONDS = 0.4      # how often the mtime is checked
SETTLE_SECONDS = 0.35   # the file must stop changing for this long before a rebuild

# Passed straight to siding_sample.build_scene(). Change them in the console
# and call rebuild(force=True) to see the difference without editing a file.
BUILD = {"colour": "porcelain", "sun": None, "sky": None}

MODULE_NAME = "wce_siding_sample_live"
DRIVER_KEY = "wce_live"


def _assert_outputs_are_outside_the_watch_path() -> None:
    watch = os.path.normcase(os.path.abspath(WATCH_DIR)) + os.sep
    out = os.path.normcase(os.path.abspath(OUTPUT_DIR)) + os.sep
    if out.startswith(watch):
        raise RuntimeError(
            f"OUTPUT_DIR ({OUTPUT_DIR}) is inside the watched directory "
            f"({WATCH_DIR}). Writing there would retrigger the watcher."
        )


_assert_outputs_are_outside_the_watch_path()


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

_state = {
    "running": False,
    "busy": False,          # re-entrancy guard: one rebuild at a time
    "stamp": None,          # (mtime, size) of the watched file as last seen
    "changed_at": None,     # when that stamp last moved
    "builds": 0,
    "message": "",
    "ok": True,
    "at": 0.0,
}

_draw_handle = None


def _say(message: str, ok: bool = True) -> None:
    _state["message"] = message
    _state["ok"] = ok
    _state["at"] = time.time()
    print(f"[wce-live] {message}")
    _redraw()


# ---------------------------------------------------------------------------
# Viewport reporting
#
# A timer has no operator context, so `self.report()` is not available and an
# error would otherwise land only in a terminal that nobody watching the
# viewport is looking at. This draws the last result in the corner of the 3D
# view, which is where the person editing the file already is.
# ---------------------------------------------------------------------------

def _redraw() -> None:
    window_manager = getattr(bpy.context, "window_manager", None)
    if window_manager is None:
        return
    for window in window_manager.windows:
        for area in window.screen.areas:
            if area.type in {"VIEW_3D", "OUTLINER"}:
                area.tag_redraw()


def _draw_status() -> None:
    try:
        font = 0
        blf.size(font, 13)
        red, green = (1.0, 0.45, 0.35, 1.0), (0.62, 0.86, 0.58, 1.0)
        blf.color(font, *(green if _state["ok"] else red))
        blf.position(font, 22, 28, 0)
        age = time.time() - _state["at"]
        blf.draw(font, f"wce live · {_state['message']} · {age:.0f}s ago")
    except Exception:
        # A draw handler that raises is a draw handler that spams the console
        # sixty times a second. Losing the overlay is the cheaper failure.
        pass


def _add_overlay() -> None:
    global _draw_handle
    if _draw_handle is not None:
        return
    try:
        _draw_handle = bpy.types.SpaceView3D.draw_handler_add(
            _draw_status, (), "WINDOW", "POST_PIXEL")
    except Exception as exc:
        # --background has no 3D view to draw into. Not a reason to refuse to
        # watch; the console still gets every line.
        print(f"[wce-live] no viewport overlay ({exc}); reporting to the console only")


def _remove_overlay() -> None:
    global _draw_handle
    if _draw_handle is not None:
        try:
            bpy.types.SpaceView3D.draw_handler_remove(_draw_handle, "WINDOW")
        except Exception:
            pass
        _draw_handle = None


# ---------------------------------------------------------------------------
# Camera view preservation
#
# A rebuild deletes the old camera object and builds a new one. Blender drops
# any viewport that was looking through the deleted camera back to user
# perspective, so without this the first rebuild after you press Numpad 0
# throws you out of the shot you were judging — which is most of the point of
# watching the file at all.
#
# The fix records which regions were in camera view BEFORE the rebuild and
# puts exactly those back afterwards. Regions that were already in user or
# orthographic perspective are left alone: a watcher that yanks every viewport
# into camera view is a different bug, not a fix.
#
# Regions are recorded by position (window, area, quad) rather than by holding
# a reference to the RegionView3D, because a Python reference into Blender's
# UI structs is not guaranteed to survive the data churn of a rebuild, and a
# stale one either does nothing or crashes.
# ---------------------------------------------------------------------------

def _iter_view3d_regions(window_manager):
    """Yield ((window, area, quad), region_3d) for every 3D region on screen.

    A quad-view space has four regions with independent perspectives, so they
    are enumerated individually; -1 is the index for a space's single main
    region.
    """
    if window_manager is None:
        return
    for window_index, window in enumerate(getattr(window_manager, "windows", ())):
        screen = getattr(window, "screen", None)
        if screen is None:
            continue
        for area_index, area in enumerate(getattr(screen, "areas", ())):
            if getattr(area, "type", None) != "VIEW_3D":
                continue
            for space in getattr(area, "spaces", ()):
                if getattr(space, "type", None) != "VIEW_3D":
                    continue
                quads = list(getattr(space, "region_quadviews", ()) or ())
                if quads:
                    for quad_index, region_3d in enumerate(quads):
                        yield (window_index, area_index, quad_index), region_3d
                else:
                    region_3d = getattr(space, "region_3d", None)
                    if region_3d is not None:
                        yield (window_index, area_index, -1), region_3d
                break        # the first VIEW_3D space of an area is the active one


def _capture_camera_views(window_manager) -> set:
    """Which regions are looking through the camera right now."""
    return {key for key, region_3d in _iter_view3d_regions(window_manager)
            if getattr(region_3d, "view_perspective", None) == "CAMERA"}


def _restore_camera_views(window_manager, keys) -> int:
    """Put exactly the recorded regions back into camera view. Returns how many.

    Setting view_perspective to CAMERA picks up whatever scene.camera now is,
    which is the newly built one, so the viewport lands back in the same shot
    rather than wherever the old camera used to be.
    """
    if not keys:
        return 0
    restored = 0
    for key, region_3d in _iter_view3d_regions(window_manager):
        if key not in keys:
            continue
        if getattr(region_3d, "view_perspective", None) == "CAMERA":
            continue
        try:
            region_3d.view_perspective = "CAMERA"
            restored += 1
        except Exception as exc:
            print(f"[wce-live] could not restore camera view on {key}: {exc}")
    return restored


# ---------------------------------------------------------------------------
# Loading and rebuilding
# ---------------------------------------------------------------------------

def _load_authoring_module():
    """Execute siding_sample.py fresh, ignoring anything Python has cached.

    importlib.reload() would reuse the module object and keep module-level
    state from the previous run; building a new one each time means an edit
    that deletes a constant actually deletes it.
    """
    spec = importlib.util.spec_from_file_location(MODULE_NAME, WATCHED)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {WATCHED}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


def _scene():
    scene = getattr(bpy.context, "scene", None)
    return scene if scene is not None else bpy.data.scenes[0]


def _blocked_reason():
    """Why a rebuild should not happen right now, or None."""
    if _state["busy"]:
        return "a rebuild is already running"
    mode = getattr(bpy.context, "mode", "OBJECT")
    if mode != "OBJECT":
        return f"Blender is in {mode}; leave it to rebuild"
    return None


def rebuild(force: bool = False) -> bool:
    """Clear the previous sample and build it again. Safe to call by hand."""
    blocked = _blocked_reason()
    if blocked and not force:
        _say(f"skipped — {blocked}", ok=True)
        return False
    if _state["busy"]:
        # Even force does not get to overlap. Two builders writing the same
        # collection is how a file ends up with two of everything.
        _say("skipped — a rebuild is already running", ok=True)
        return False

    _state["busy"] = True
    started = time.time()
    window_manager = getattr(bpy.context, "window_manager", None)
    # Recorded before anything is deleted; afterwards the old camera is gone
    # and every viewport that used it has already been moved.
    camera_views = _capture_camera_views(window_manager)
    try:
        module = _load_authoring_module()
        scene = _scene()
        module.clear_scene(scene)
        collection, parts = module.build_scene(**BUILD)
        _state["builds"] += 1

        # Only once the build succeeded and a camera actually exists. On a
        # failed build there is nothing to look through, and forcing camera
        # view would frame an empty scene.
        restored = 0
        if getattr(scene, "camera", None) is not None:
            restored = _restore_camera_views(window_manager, camera_views)

        suffix = f", {restored} view{'' if restored == 1 else 's'} back on camera" if restored else ""
        _say(f"rebuilt {len(parts)} parts in {time.time() - started:.2f}s "
             f"(#{_state['builds']}){suffix}", ok=True)
        return True
    except SyntaxError as exc:
        traceback.print_exc()
        _say(f"syntax error line {exc.lineno}: {exc.msg}", ok=False)
        return False
    except BaseException as exc:
        # BaseException rather than Exception on purpose: a KeyboardInterrupt
        # or a MemoryError raised inside a timer callback still has to leave
        # the watcher registered, or one bad edit costs a Blender restart.
        traceback.print_exc()
        _say(f"{type(exc).__name__}: {exc}", ok=False)
        return False
    finally:
        _state["busy"] = False
        _redraw()


def _stamp():
    try:
        st = os.stat(WATCHED)
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size)


def _tick():
    """The timer callback. Must never raise, and must always return a delay."""
    try:
        if not _state["running"]:
            return None          # returning None unregisters the timer

        stamp = _stamp()
        if stamp is None:
            _say(f"waiting — {os.path.basename(WATCHED)} is not there", ok=False)
            return POLL_SECONDS

        if stamp != _state["stamp"]:
            # The file moved. Note it and wait for it to stop moving: an
            # editor that truncates and rewrites would otherwise be read
            # half-written, and every save would look like a syntax error.
            _state["stamp"] = stamp
            _state["changed_at"] = time.time()
            return POLL_SECONDS

        if _state["changed_at"] is not None:
            if time.time() - _state["changed_at"] < SETTLE_SECONDS:
                return POLL_SECONDS
            _state["changed_at"] = None
            rebuild()

        return POLL_SECONDS
    except BaseException:
        # Belt and braces. Nothing above should escape, but a callback that
        # raises is silently unregistered by Blender, and a watcher that has
        # quietly stopped watching is worse than one that never started.
        traceback.print_exc()
        return POLL_SECONDS


# ---------------------------------------------------------------------------
# Start and stop
# ---------------------------------------------------------------------------

def start(build_now: bool = True) -> None:
    """Begin watching. Calling it twice is the same as calling it once."""
    stop(quiet=True)

    if not os.path.exists(WATCHED):
        raise FileNotFoundError(f"Nothing to watch at {WATCHED}")

    _state["running"] = True
    _state["stamp"] = _stamp()
    _state["changed_at"] = None
    _add_overlay()
    bpy.app.driver_namespace[DRIVER_KEY] = sys.modules[__name__]
    bpy.app.timers.register(_tick, first_interval=0.1, persistent=False)

    _say(f"watching {os.path.basename(WATCHED)} every {POLL_SECONDS}s")
    if build_now:
        rebuild()


def stop(quiet: bool = False) -> None:
    """Unregister the timer and the overlay. Safe to call when not running."""
    _state["running"] = False
    _state["changed_at"] = None
    if bpy.app.timers.is_registered(_tick):
        bpy.app.timers.unregister(_tick)
    _remove_overlay()
    bpy.app.driver_namespace.pop(DRIVER_KEY, None)
    if not quiet:
        print("[wce-live] stopped")
    _redraw()


def status() -> dict:
    """What the watcher thinks is going on, for the console."""
    return {
        "running": _state["running"],
        "registered": bpy.app.timers.is_registered(_tick),
        "busy": _state["busy"],
        "builds": _state["builds"],
        "watching": WATCHED,
        "last": _state["message"],
        "ok": _state["ok"],
        "build_args": dict(BUILD),
    }


def snapshot(name: str = "live_snapshot.png") -> str:
    """Render the current camera to OUTPUT_DIR. The only thing here that writes.

    Deliberately outside the watched folder, and deliberately not automatic:
    a watcher that renders on every save turns a one-second loop into a
    one-minute one.
    """
    _assert_outputs_are_outside_the_watch_path()
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, name)
    scene = _scene()
    previous = scene.render.filepath
    try:
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        scene.render.filepath = previous
    print(f"[wce-live] wrote {path}")
    return path


if __name__ == "__main__":
    start()
