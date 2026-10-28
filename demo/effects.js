'use strict';

// Effects: loading a source file, downloads, reading a file/the clipboard, storage.
// Depends on nothing else. Not covered by node:test -- every function here needs
// browser APIs (document/Blob/FileReader/...).
(function (root) {

  // Injects <script src="<dir>/<file>">; resolves once window.DS.sources[name] appears.
  var loadSourceScript = function (dir, file, name) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = dir + '/' + file;
      s.onload = function () {
        window.DS.sources[name] ? resolve(name) : reject(new Error(name));
      };
      s.onerror = function () { reject(new Error(name)); };
      document.head.appendChild(s);
    });
  };

  // Injects <script src="<dir>/<file>">, resolves to window[globalName]'s value after
  // load (first resets it to undefined, so a missing file doesn't inherit the value
  // from a previous successful call with the same global name). A missing file
  // (onerror) is not an error, it resolves to null; the caller decides what that means.
  var loadGlobal = function (dir, file, globalName) {
    return new Promise(function (resolve) {
      window[globalName] = undefined;
      var s = document.createElement('script');
      s.src = dir + '/' + file;
      s.onload = function () { resolve(window[globalName] !== undefined ? window[globalName] : null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  };

  // data/manifest.js. null if the file is missing/failed to load (the caller decides
  // what's next: fall back to sample data on first start, or a hard error when the user
  // switches the directory).
  var loadManifest = function (dir) { return loadGlobal(dir, 'manifest.js', 'DS_MANIFEST'); };

  // data/manifest.imports.js -- an index of extra manifest fragment file names (reserved
  // for sources produced outside the main manifest.js; nothing produces such files yet,
  // but the app already knows how to read them). Each file in the list loads IN SEQUENCE,
  // not in parallel -- they all write into the same temporary window.DS_MANIFEST_FRAGMENT,
  // and parallel loads would race each other for it. A missing index or a missing fragment
  // is not an error, it's just skipped.
  var loadManifestFragments = function (dir) {
    return loadGlobal(dir, 'manifest.imports.js', 'DS_MANIFEST_IMPORTS').then(function (files) {
      return (files || []).reduce(function (chain, file) {
        return chain.then(function (acc) {
          return loadGlobal(dir, file, 'DS_MANIFEST_FRAGMENT').then(function (frag) {
            if (frag) acc.push(frag);
            return acc;
          });
        });
      }, Promise.resolve([]));
    });
  };

  var download = function (filename, text, mime) {
    var blob = new Blob(['﻿', text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  var readFile = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsText(file);
    });
  };

  // Read text from the clipboard (needs a user gesture + permission). On refusal/
  // unavailability -- notify and let the user paste manually (Ctrl+V).
  var pasteFromClipboard = function (cb) {
    var fail = function () {
      alert('Could not read the clipboard. Paste the list manually (Ctrl+V) into the field.');
    };
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) { if (t && t.trim()) cb(t); }, fail);
    } else {
      fail();
    }
  };

  // sessionStorage, NOT localStorage -- deliberately: a saved preset/settings used to be
  // shared across the whole file:// origin, so a second open tab would pick up the exact
  // same thing (no way to hold two different presets open in two tabs at once), and if a
  // saved preset on a large dataset made the browser run out of memory and restart the
  // tab, the same preset got reapplied on every attempt -- a restart loop with no way
  // out. sessionStorage is tied to one specific tab (restoring that same tab after a
  // crash survives it -- see main.js::render's watchdog, which catches exactly this case
  // separately; but a NEW tab starts from a clean sessionStorage, i.e. the default preset).
  var storage = {
    get: function (key) {
      try { return JSON.parse(sessionStorage.getItem('joinsheets:' + key)); }
      catch (e) { return null; }
    },
    set: function (key, value) {
      try { sessionStorage.setItem('joinsheets:' + key, JSON.stringify(value)); }
      catch (e) { /* private window / disabled -- best-effort */ }
    }
  };

  var api = {
    loadSourceScript: loadSourceScript, download: download, readFile: readFile,
    pasteFromClipboard: pasteFromClipboard, storage: storage,
    loadGlobal: loadGlobal, loadManifest: loadManifest, loadManifestFragments: loadManifestFragments
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, api);
  }
})(typeof window !== 'undefined' ? window : this);
