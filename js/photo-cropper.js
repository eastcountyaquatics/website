// Square photo cropper for headshots (coach-registration.html). Opens a
// dialog over the page: drag the photo to position it, use the slider (or
// mouse wheel / pinch) to zoom, and the circle shows exactly what the site
// will display. Resolves to a 600x600 JPEG Blob, or null if cancelled.
//
//   const blob = await openPhotoCropper(file);
//
// No libraries -- a canvas and pointer events. The photo always covers the
// whole square (it can't be zoomed or dragged out to leave empty edges).
(function (global) {
  var OUTPUT = 600;   // saved image size (px)
  var VIEW = 300;     // on-screen crop box size (CSS px)

  var css =
    ".pc-overlay{position:fixed;inset:0;background:rgba(10,20,60,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;}" +
    ".pc-dialog{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);padding:22px;width:100%;max-width:380px;text-align:center;}" +
    ".pc-dialog h3{margin:0 0 4px;font-size:19px;}" +
    ".pc-dialog p{margin:0 0 14px;font-size:13.5px;color:#5b6075;}" +
    ".pc-stage{position:relative;width:" + VIEW + "px;height:" + VIEW + "px;max-width:100%;margin:0 auto;touch-action:none;cursor:grab;border-radius:10px;overflow:hidden;background:#e9edf5;}" +
    ".pc-stage.dragging{cursor:grabbing;}" +
    ".pc-stage canvas{display:block;width:100%;height:100%;}" +
    ".pc-ring{position:absolute;inset:0;pointer-events:none;border-radius:10px;" +
      "background:radial-gradient(circle at center, transparent 0, transparent 70.5%, rgba(255,255,255,.65) 71%);}" +
    ".pc-ring::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15);}" +
    ".pc-zoom{display:flex;align-items:center;gap:10px;margin:16px 4px 6px;font-size:18px;color:#5b6075;}" +
    ".pc-zoom input{flex:1;}" +
    ".pc-actions{display:flex;gap:10px;justify-content:center;margin-top:14px;}";

  function injectCss() {
    if (document.getElementById("photo-cropper-css")) return;
    var style = document.createElement("style");
    style.id = "photo-cropper-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
      img.src = url;
    });
  }

  function openPhotoCropper(file) {
    injectCss();
    return loadImage(file).then(function (loaded) {
      return new Promise(function (resolve) {
        var img = loaded.img;
        var overlay = document.createElement("div");
        overlay.className = "pc-overlay";
        overlay.innerHTML =
          '<div class="pc-dialog" role="dialog" aria-modal="true" aria-labelledby="pc-title">' +
          '<h3 id="pc-title">Crop your photo</h3>' +
          "<p>Drag to position your face in the circle, and zoom to fit.</p>" +
          '<div class="pc-stage"><canvas></canvas><div class="pc-ring"></div></div>' +
          '<div class="pc-zoom"><span aria-hidden="true">&minus;</span>' +
          '<input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span aria-hidden="true">+</span></div>' +
          '<div class="pc-actions">' +
          '<button type="button" class="btn btn-outline-dark" data-pc-cancel>Cancel</button>' +
          '<button type="button" class="btn btn-primary" data-pc-ok>Use Photo</button>' +
          "</div></div>";
        document.body.appendChild(overlay);

        var stage = overlay.querySelector(".pc-stage");
        var canvas = overlay.querySelector("canvas");
        var slider = overlay.querySelector('input[type="range"]');
        var ctx = canvas.getContext("2d");
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = VIEW * dpr;
        canvas.height = VIEW * dpr;

        // Scale that makes the photo just cover the square; zoom multiplies it.
        var baseScale = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
        var zoom = 1;
        var offsetX = 0; // photo centre relative to box centre, in view px
        var offsetY = 0;

        function clamp() {
          var s = baseScale * zoom;
          var maxX = Math.max(0, (img.naturalWidth * s - VIEW) / 2);
          var maxY = Math.max(0, (img.naturalHeight * s - VIEW) / 2);
          offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
          offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
        }

        function draw(context, size) {
          var k = size / VIEW;
          var s = baseScale * zoom * k;
          var w = img.naturalWidth * s;
          var h = img.naturalHeight * s;
          context.fillStyle = "#fff";
          context.fillRect(0, 0, size, size);
          context.imageSmoothingQuality = "high";
          context.drawImage(img, size / 2 - w / 2 + offsetX * k, size / 2 - h / 2 + offsetY * k, w, h);
        }

        function render() { clamp(); draw(ctx, canvas.width); }
        render();

        // Drag (mouse, pen, touch); two-finger pinch zooms.
        var pointers = {};
        var lastPinch = null;
        function viewScale() { return VIEW / stage.getBoundingClientRect().width; }
        stage.addEventListener("pointerdown", function (e) {
          stage.setPointerCapture(e.pointerId);
          pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          stage.classList.add("dragging");
        });
        stage.addEventListener("pointermove", function (e) {
          var prev = pointers[e.pointerId];
          if (!prev) return;
          var ids = Object.keys(pointers);
          if (ids.length === 2) {
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            var a = pointers[ids[0]], b = pointers[ids[1]];
            var dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (lastPinch) setZoom(zoom * dist / lastPinch);
            lastPinch = dist;
            return;
          }
          var f = viewScale();
          offsetX += (e.clientX - prev.x) * f;
          offsetY += (e.clientY - prev.y) * f;
          pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          render();
        });
        function endPointer(e) {
          delete pointers[e.pointerId];
          lastPinch = null;
          if (!Object.keys(pointers).length) stage.classList.remove("dragging");
        }
        stage.addEventListener("pointerup", endPointer);
        stage.addEventListener("pointercancel", endPointer);
        stage.addEventListener("wheel", function (e) {
          e.preventDefault();
          setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
        }, { passive: false });

        function setZoom(z) {
          zoom = Math.min(4, Math.max(1, z));
          slider.value = String(zoom);
          render();
        }
        slider.addEventListener("input", function () { setZoom(parseFloat(slider.value)); });

        function close(result) {
          document.removeEventListener("keydown", onKey);
          overlay.remove();
          URL.revokeObjectURL(loaded.url);
          resolve(result);
        }
        function onKey(e) { if (e.key === "Escape") close(null); }
        document.addEventListener("keydown", onKey);
        overlay.querySelector("[data-pc-cancel]").addEventListener("click", function () { close(null); });
        overlay.querySelector("[data-pc-ok]").addEventListener("click", function () {
          var out = document.createElement("canvas");
          out.width = OUTPUT;
          out.height = OUTPUT;
          clamp();
          draw(out.getContext("2d"), OUTPUT);
          out.toBlob(function (blob) { close(blob); }, "image/jpeg", 0.9);
        });
        overlay.querySelector("[data-pc-ok]").focus();
      });
    });
  }

  global.openPhotoCropper = openPhotoCropper;
})(window);
