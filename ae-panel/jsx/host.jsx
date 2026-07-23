/* global app, CompItem, FolderItem, FootageItem, ImportOptions, ImportAsType, File */
// ExtendScript host — called from the CEP panel via CSInterface.evalScript()

function _ok(data) {
  var out = { ok: true };
  if (data) {
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
    }
  }
  return JSON.stringify(out);
}

function _err(e) {
  return JSON.stringify({ ok: false, error: String(e) });
}

function getActiveCompInfo() {
  try {
    var item = app.project.activeItem;
    if (item && item instanceof CompItem) {
      return _ok({
        name: item.name,
        id: item.id,
        width: item.width,
        height: item.height,
        frameRate: item.frameRate,
        duration: item.duration,
        numLayers: item.numLayers,
      });
    }
    return _err("No active composition");
  } catch (e) {
    return _err(e);
  }
}

function getProjectName() {
  try {
    if (!app.project.file) return _ok({ name: "Untitled" });
    var name = File.decode(app.project.file.name).replace(/\.aep[x]?$/i, "");
    return _ok({ name: name });
  } catch (e) {
    return _err(e);
  }
}

/** Ensure a top-level project folder named *folderName* exists; return it. */
function _ensureFolder(folderName) {
  var root = app.project.rootFolder;
  for (var i = 1; i <= root.numItems; i++) {
    var it = root.item(i);
    if (it instanceof FolderItem && it.name === folderName) return it;
  }
  return root.items.addFolder(folderName);
}

/**
 * Import a local file as footage.
 * @param {string} filePath - absolute path
 * @param {boolean} intoActiveComp - add as layer in active comp
 * @param {string} folderName - project panel folder (default "ftrack")
 */
function importFootageToComp(filePath, intoActiveComp, folderName) {
  app.beginUndoGroup("ftrack Import");
  try {
    var file = new File(filePath);
    if (!file.exists) {
      app.endUndoGroup();
      return _err("File not found: " + filePath);
    }

    var io = new ImportOptions(file);
    if (!io.canImportAs(ImportAsType.FOOTAGE)) {
      // Still try FOOTAGE; some codecs report false incorrectly
    }
    io.importAs = ImportAsType.FOOTAGE;

    var footage = app.project.importFile(io);
    if (!footage) {
      app.endUndoGroup();
      return _err("Import returned null");
    }

    var folder = _ensureFolder(folderName || "ftrack");
    try {
      footage.parentFolder = folder;
    } catch (moveErr) {
      // non-fatal
    }

    var layerName = footage.name;
    var addedLayer = false;

    if (intoActiveComp) {
      var comp = app.project.activeItem;
      if (comp && comp instanceof CompItem) {
        var layer = comp.layers.add(footage);
        layerName = layer.name;
        addedLayer = true;
      }
    }

    app.endUndoGroup();
    return _ok({
      name: footage.name,
      layerName: layerName,
      addedLayer: addedLayer,
      id: footage.id,
    });
  } catch (e) {
    try {
      app.endUndoGroup();
    } catch (ignore) {}
    return _err(e);
  }
}

function alertMessage(msg) {
  try {
    alert(String(msg));
    return _ok();
  } catch (e) {
    return _err(e);
  }
}

/** Absolute fs path from a File, normalized for Windows. */
function _filePath(file) {
  if (!file) return null;
  try {
    var p = File.decode(file.fsName || file.absoluteURI || "");
    return p || null;
  } catch (e) {
    return null;
  }
}

/**
 * Paths for selected FootageItems that have a file source.
 * Skips solids, comps, missing files.
 */
function getSelectedFootagePaths() {
  try {
    var sel = app.project.selection;
    var paths = [];
    var seen = {};
    for (var i = 0; i < sel.length; i++) {
      var item = sel[i];
      if (!(item instanceof FootageItem)) continue;
      try {
        var src = item.mainSource;
        if (!src || !src.file) continue;
        var p = _filePath(src.file);
        if (!p || seen[p]) continue;
        if (!(new File(p)).exists) continue;
        seen[p] = true;
        paths.push(p);
      } catch (inner) {
        // skip this item
      }
    }
    return _ok({ paths: paths, count: paths.length });
  } catch (e) {
    return _err(e);
  }
}

/**
 * Multi-select OS file dialog for media. Returns { paths: [...] }.
 * Cancel → ok with empty paths.
 */
function pickMediaFiles() {
  try {
    var files = File.openDialog(
      "Select media to upload to ftrack",
      "Media:*.mov;*.mp4;*.mxf;*.avi;*.mkv;*.mov,All files:*.*",
      true
    );
    if (!files) {
      return _ok({ paths: [], count: 0, cancelled: true });
    }
    // Single file → File; multi → Array
    if (!(files instanceof Array)) {
      files = [files];
    }
    var paths = [];
    var seen = {};
    for (var i = 0; i < files.length; i++) {
      var p = _filePath(files[i]);
      if (!p || seen[p]) continue;
      seen[p] = true;
      paths.push(p);
    }
    return _ok({ paths: paths, count: paths.length, cancelled: false });
  } catch (e) {
    return _err(e);
  }
}

