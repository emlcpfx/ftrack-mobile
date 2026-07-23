#!/usr/bin/env python3
"""
CEP publish helper — same upload path as the right-click ftrack_uploader:
AssetVersion.encode_media(local_path) streams from disk via ftrack_api.

Reads one JSON object from stdin:
  { server, user, apiKey, versionId, filePath, componentName? }

Prints JSON lines to stdout (progress / result).
"""
from __future__ import annotations

import json
import os
import sys


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    try:
        import ftrack_api
    except ImportError:
        emit({"ok": False, "error": "ftrack_api not installed for this Python (pip install ftrack-python-api)"})
        return 1

    try:
        cfg = json.load(sys.stdin)
    except Exception as e:
        emit({"ok": False, "error": f"Invalid JSON input: {e}"})
        return 1

    server = (cfg.get("server") or "").rstrip("/")
    user = cfg.get("user")
    api_key = cfg.get("apiKey")
    version_id = cfg.get("versionId")
    file_path = cfg.get("filePath")
    component_name = cfg.get("componentName")

    if not all([server, user, api_key, version_id, file_path]):
        emit({"ok": False, "error": "Missing server/user/apiKey/versionId/filePath"})
        return 1
    if not os.path.isfile(file_path):
        emit({"ok": False, "error": f"File not found: {file_path}"})
        return 1

    emit({"phase": "upload", "percent": 5, "msg": "Connecting…"})

    try:
        session = ftrack_api.Session(
            server=server,
            api_user=user,
            api_key=api_key,
        )
        av = session.get("AssetVersion", version_id)
        if av is None:
            emit({"ok": False, "error": f"AssetVersion not found: {version_id}"})
            return 1

        emit({"phase": "upload", "percent": 15, "msg": "Streaming to ftrack…"})
        job = av.encode_media(file_path, keep_original=True)

        data = job.get("data") if isinstance(job, dict) else None
        if isinstance(data, str):
            data = json.loads(data)
        data = data or {}
        component_id = data.get("source_component_id")

        if component_id:
            comp = session.get("Component", component_id)
            if comp is not None:
                name = component_name or os.path.splitext(os.path.basename(file_path))[0]
                comp["name"] = name
                session.commit()

        emit({
            "ok": True,
            "phase": "encode",
            "percent": 100,
            "componentId": component_id,
        })
        return 0
    except Exception as e:
        emit({"ok": False, "error": str(e)})
        return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
