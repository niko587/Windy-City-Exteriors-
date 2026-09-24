"""
Checks for live_reload.py. Run them, do not read them and assume.

    /Applications/Blender.app/Contents/MacOS/Blender \
        --background --factory-startup \
        --python assets/blender/live_reload_checks.py

Every check prints PASS or FAIL and the script exits non-zero if any failed,
so it is usable from a shell as well as by eye.

The camera-view checks use stand-in window/area/space objects rather than real
Blender UI structs, because --background has no 3D view at all and the regression
they cover is precisely a UI-state one. The stand-ins mirror the three shapes
_iter_view3d_regions has to cope with: an ordinary 3D view, a non-3D area that
must be ignored, and a quad-view space whose four regions each carry their own
perspective.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time

import bpy


FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(name)


# ---------------------------------------------------------------------------
# Stand-ins for Blender's UI structs
# ---------------------------------------------------------------------------

class FakeRegion3D:
    def __init__(self, perspective="PERSP"):
        self.view_perspective = perspective


class FakeSpace:
    def __init__(self, type="VIEW_3D", region_3d=None, quadviews=()):
        self.type = type
        self.region_3d = region_3d
        self.region_quadviews = list(quadviews)


class FakeArea:
    def __init__(self, type="VIEW_3D", spaces=()):
        self.type = type
        self.spaces = list(spaces)


class FakeScreen:
    def __init__(self, areas=()):
        self.areas = list(areas)


class FakeWindow:
    def __init__(self, screen):
        self.screen = screen


class FakeWindowManager:
    def __init__(self, windows=()):
        self.windows = list(windows)


def build_fake_wm():
    """One camera view, one user view, one ignored area, one quad view."""
    camera_view = FakeRegion3D("CAMERA")
    user_view = FakeRegion3D("PERSP")
    quads = [FakeRegion3D("ORTHO"), FakeRegion3D("CAMERA"),
             FakeRegion3D("ORTHO"), FakeRegion3D("ORTHO")]
    wm = FakeWindowManager([FakeWindow(FakeScreen([
        FakeArea("VIEW_3D", [FakeSpace(region_3d=camera_view)]),
        FakeArea("VIEW_3D", [FakeSpace(region_3d=user_view)]),
        FakeArea("PROPERTIES", [FakeSpace(type="PROPERTIES")]),
        FakeArea("VIEW_3D", [FakeSpace(quadviews=quads)]),
    ]))])
    return wm, camera_view, user_view, quads


def main() -> int:
    source_dir = os.path.dirname(os.path.abspath(__file__))
    sandbox = os.path.join(tempfile.mkdtemp(prefix="wce_live_checks_"), "blender")
    shutil.copytree(source_dir, sandbox)
    sys.path.insert(0, sandbox)
    import live_reload as L

    watched = L.WATCHED

    # -- outputs cannot retrigger the watcher --------------------------------
    watch = os.path.normcase(os.path.abspath(L.WATCH_DIR)) + os.sep
    check("OUTPUT_DIR is outside the watched directory",
          not (os.path.normcase(os.path.abspath(L.OUTPUT_DIR)) + os.sep).startswith(watch))

    # -- camera view preservation -------------------------------------------
    wm, camera_view, user_view, quads = build_fake_wm()
    captured = L._capture_camera_views(wm)
    check("capture finds every region in camera view, and only those",
          captured == {(0, 0, -1), (0, 3, 1)}, f"got {sorted(captured)}")

    # Losing the camera is what Blender does when the object is deleted.
    camera_view.view_perspective = "PERSP"
    quads[1].view_perspective = "PERSP"

    restored = L._restore_camera_views(wm, captured)
    check("restore puts back exactly the regions that were on camera",
          restored == 2 and camera_view.view_perspective == "CAMERA"
          and quads[1].view_perspective == "CAMERA",
          f"restored {restored}")
    check("restore leaves a user-perspective viewport alone",
          user_view.view_perspective == "PERSP", user_view.view_perspective)
    check("restore leaves the other quad regions alone",
          [q.view_perspective for q in quads] == ["ORTHO", "CAMERA", "ORTHO", "ORTHO"],
          str([q.view_perspective for q in quads]))
    check("restore is a no-op when nothing was on camera",
          L._restore_camera_views(wm, set()) == 0)
    check("a region already on camera is not touched twice",
          L._restore_camera_views(wm, captured) == 0)
    check("non-3D areas are never enumerated",
          all(key[1] != 2 for key, _ in L._iter_view3d_regions(wm)))
    check("a missing window manager is not an error",
          L._capture_camera_views(None) == set()
          and L._restore_camera_views(None, {(0, 0, -1)}) == 0)

    # -- the rebuild loop ----------------------------------------------------
    bpy.ops.wm.read_homefile(use_empty=True)
    bystander = bpy.data.objects.new("users_own_cube", bpy.data.meshes.new("users_own_mesh"))
    bpy.context.scene.collection.objects.link(bystander)

    def counts():
        return (len(bpy.data.objects), len(bpy.data.meshes), len(bpy.data.materials),
                len(bpy.data.worlds), len(bpy.data.lights), len(bpy.data.cameras))

    L.start()
    check("start registers the timer", bpy.app.timers.is_registered(L._tick))
    first = counts()
    check("the first build produced a camera", bpy.context.scene.camera is not None)

    for _ in range(4):
        L.rebuild(force=True)
    check("repeated rebuilds leak no datablocks", counts() == first,
          f"{first} then {counts()}")
    check("an unrelated object survives a rebuild", "users_own_cube" in bpy.data.objects)

    # -- the settle window ---------------------------------------------------
    os.utime(watched, None)
    L._tick()
    before = L._state["builds"]
    L._tick()
    held = L._state["builds"] == before
    time.sleep(L.SETTLE_SECONDS + 0.05)
    L._tick()
    check("a save is held until the file stops changing, then rebuilds",
          held and L._state["builds"] == before + 1)

    # -- bad edits are survivable -------------------------------------------
    good = open(watched, encoding="utf-8").read()

    open(watched, "w", encoding="utf-8").write(good + "\nthis is not python(\n")
    os.utime(watched, None)
    L._tick(); time.sleep(L.SETTLE_SECONDS + 0.05); L._tick()
    check("a syntax error is reported without unregistering the watcher",
          bpy.app.timers.is_registered(L._tick) and not L._state["ok"],
          L._state["message"])

    open(watched, "w", encoding="utf-8").write(
        good.replace("def build_scene(", "def build_scene_disabled(", 1)
        + "\ndef build_scene(**kw):\n    raise ValueError('deliberate')\n")
    os.utime(watched, None)
    L._tick(); time.sleep(L.SETTLE_SECONDS + 0.05); L._tick()
    check("a runtime error is reported without unregistering the watcher",
          bpy.app.timers.is_registered(L._tick) and not L._state["ok"],
          L._state["message"])

    open(watched, "w", encoding="utf-8").write(good)
    os.utime(watched, None)
    L._tick(); time.sleep(L.SETTLE_SECONDS + 0.05); L._tick()
    check("the next good save recovers", L._state["ok"], L._state["message"])
    check("and still leaks nothing", counts() == first, f"{first} then {counts()}")

    # -- guards --------------------------------------------------------------
    L._state["busy"] = True
    blocked = L.rebuild(force=True) is False
    L._state["busy"] = False
    check("the re-entrancy guard refuses even a forced rebuild", blocked)

    L.start(build_now=False)
    L.start(build_now=False)
    check("starting twice registers one timer", bpy.app.timers.is_registered(L._tick))
    L.stop()
    L.stop()
    check("stopping is idempotent and leaves nothing behind",
          not bpy.app.timers.is_registered(L._tick)
          and not L._state["running"]
          and L.DRIVER_KEY not in bpy.app.driver_namespace)
    check("the callback unregisters itself once stopped", L._tick() is None)

    L.start(build_now=False)
    os.rename(watched, watched + ".gone")
    L._tick()
    check("a deleted script is reported, not fatal",
          bpy.app.timers.is_registered(L._tick) and not L._state["ok"],
          L._state["message"])
    os.rename(watched + ".gone", watched)
    L.stop()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed: {', '.join(FAILURES)}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
